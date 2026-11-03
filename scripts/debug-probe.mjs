import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

export async function probeInstalledPlugin(context, { entry, receiptFile, fixtureFile, setupOnly = false }) {
  const receipt = { complete: false, stage: 'import', plugin: entry, loaded: false, registeredHooks: [], allowed: false, read: false, observed: false };
  const hooks = new Map();
  let dispose;
  let session;
  const save = () => {
    fs.writeFileSync(`${receiptFile}.tmp`, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    fs.renameSync(`${receiptFile}.tmp`, receiptFile);
  };
  try {
    save();
    const plugin = (await import(pathToFileURL(entry).href)).default;
    if (plugin?.id !== 'xor' || typeof plugin.setup !== 'function') throw new Error('The installed plugin does not export the XOR setup function.');
    receipt.stage = 'setup';
    save();
    dispose = await plugin.setup({
      ...context,
      tool: {
        ...context.tool,
        async hook(name, callback) {
          hooks.set(name, callback);
          receipt.registeredHooks.push(name);
          return context.tool.hook(name, callback);
        },
      },
    });
    receipt.loaded = true;
    receipt.stage = 'session';
    save();
    const before = hooks.get('execute.before');
    const after = hooks.get('execute.after');
    if (!before || !after) throw new Error('The installed plugin did not register its action hooks.');
    if (setupOnly) {
      receipt.complete = true;
      receipt.stage = 'ready';
      save();
      return receipt;
    }
    session = await context.session.create({});
    receipt.stage = 'prompt';
    save();
    await context.session.prompt({
      sessionID: session.id,
      text: `Read ${path.basename(fixtureFile)} for the XOR installation diagnostic.`,
      resume: false,
    });
    receipt.stage = 'before';
    save();
    const event = {
      tool: 'read',
      sessionID: session.id,
      callID: 'xor-installation-diagnostic',
      input: { filePath: fixtureFile },
    };
    await before(event);
    receipt.allowed = true;
    const text = fs.readFileSync(fixtureFile, 'utf8');
    receipt.read = true;
    await after({ ...event, status: 'completed', result: { output: text } });
    receipt.observed = true;
    receipt.complete = true;
    save();
  } catch (error) {
    receipt.error = String(error?.message || error);
    receipt.complete = true;
    save();
  } finally {
    if (session?.id) await context.session.remove({ sessionID: session.id }).catch(() => {});
    if (dispose) await dispose();
  }
  return receipt;
}


export async function runProbe({ entry, root, modelRoot, command, setupOnly = false }) {
  fs.mkdirSync(root, { recursive: true });
  root = fs.realpathSync(root);
  const project = path.join(root, 'project');
  const config = path.join(root, 'config', 'opencode');
  const wrapper = path.join(config, 'plugins', 'xor-diagnostic');
  const fixtureFile = path.join(project, 'diagnostic.txt');
  const receiptFile = path.join(root, 'plugin-receipt.json');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(wrapper, { recursive: true });
  fs.rmSync(receiptFile, { force: true });
  fs.writeFileSync(fixtureFile, 'XOR installation diagnostic.\n');
  fs.writeFileSync(path.join(wrapper, 'package.json'), JSON.stringify({ name: 'xor-diagnostic', exports: { '.': './index.mjs' } }) + '\n');
  fs.writeFileSync(path.join(wrapper, 'index.mjs'), `import { probeInstalledPlugin } from ${JSON.stringify(import.meta.url)}; export default { id: 'xor-diagnostic', setup(context) { setTimeout(() => { void probeInstalledPlugin(context, ${JSON.stringify({ entry, receiptFile, fixtureFile, setupOnly })}); }, 0); } };\n`);
  const password = randomBytes(32).toString('base64url');
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_DATA_HOME: path.join(root, 'data'),
    XDG_CACHE_HOME: path.join(root, 'cache'),
    XDG_STATE_HOME: path.join(root, 'state'),
    XOR_CONFIG_ROOT: path.join(root, 'xor-config'),
    XOR_GATE_ROOT: modelRoot,
    XOR_NO_PET: '1',
    OPENCODE_PASSWORD: password,
  };
  delete env.XOR_ROOT;
  delete env.OPENCODE_SERVER_PASSWORD;
  const child = spawn(command, ['serve', '--stdio', '--port', '0'], { cwd: project, env, stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command), windowsHide: true });
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  let childError;
  child.on('error', (error) => { childError = error; });
  const exit = new Promise((resolve) => { child.once('exit', resolve); child.once('error', resolve); });
  let url;
  lines.on('line', (line) => {
    try {
      const value = JSON.parse(line);
      if (typeof value.url === 'string' && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(value.url)) url = value.url;
    } catch {
    }
  });
  const deadline = Date.now() + 40000;
  try {
    while (Date.now() < deadline) {
      if (childError) throw childError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('The private OpenCode server exited before the diagnostic finished.');
      const receipt = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : null;
      if (receipt?.complete) {
        if (setupOnly && receipt.loaded && !receipt.error) return { ok: true, detail: 'OpenCode loaded the plugin and registered its action hooks.' };
        if (!setupOnly && receipt.loaded && receipt.allowed && receipt.read && receipt.observed) return { ok: true, detail: 'OpenCode loaded the installed plugin; its native action hooks allowed and observed a harmless file read.' };
        return { ok: false, detail: 'The installed OpenCode action-hook diagnostic failed.', reason: receipt.error || 'The hook receipt is incomplete.' };
      }
      if (url) {
        const response = await fetch(new URL('/api/plugin', url), { headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }, signal: AbortSignal.timeout(2000) }).catch(() => null);
        if (response?.ok) {
          const value = await response.json();
          const failed = value.data?.find((plugin) => (plugin.id === 'xor-diagnostic' || plugin.source?.path === wrapper) && plugin.state?.status === 'failed');
          if (failed) throw new Error(failed.state.error);
        }
      }
      await delay(100);
    }
    throw new Error('OpenCode did not finish loading the installed action hooks within 40 seconds.');
  } finally {
    lines.close();
    child.stdin.end();
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 3000);
    force.unref();
    await exit;
    clearTimeout(force);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runProbe(JSON.parse(process.argv[2]));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, detail: 'The installed OpenCode action-hook diagnostic failed.', reason: String(error?.message || error) }) + '\n');
    process.exitCode = 1;
  }
}
