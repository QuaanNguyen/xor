'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { defaultConfig, readConfig, writeConfig } = require('../../xor/lib/config');
const { parseSizeArgument } = require('../../events/size-command');
const { migrate } = require('../../scripts/migrate');
const { clampScale, renderScale, boundsFor } = require('../../pet/geometry');

const project = path.resolve(__dirname, '../..');

function petCommand(root, argument) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', "require('./scripts/pet').handlePet(process.argv.slice(1)).catch(error => { console.error(error.message); process.exitCode = 2; })", argument], {
      cwd: project,
      env: { ...process.env, XOR_CONFIG_ROOT: root },
      timeout: 5000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(stderr));
      else resolve(stdout);
    });
  });
}

async function waitForControllers(root, count) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    if (fs.existsSync(path.join(root, 'pet-controls')) && fs.readdirSync(path.join(root, 'pet-controls')).length === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Pet controllers did not become ready');
}

test('fresh and old configurations keep the pet off while preserving saved sizes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-default-'));
  try {
    assert.deepEqual(defaultConfig().pet, { enabled: false, scale: 1 });
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ schema_version: 3, pet: { scale: 0.875 } }));
    assert.deepEqual(readConfig(root).config.pet, { enabled: false, scale: 0.875 });
    for (const argument of ['0.5', '87.5', '250', '1000.125']) {
      assert.equal(parseSizeArgument(argument).percent, Number(argument));
      assert.equal(clampScale(Number(argument) / 100), Number(argument) / 100);
    }
    for (const argument of ['0', '-1', 'Infinity', 'NaN', 'wat']) assert.equal(parseSizeArgument(argument), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration keeps explicit pet enablement and arbitrary decimal size', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-migrate-'));
  try {
    const workdir = path.join(root, 'project');
    const configRoot = path.join(root, 'config');
    fs.mkdirSync(workdir);
    writeConfig({ ...defaultConfig(), pet: { enabled: true, scale: 2.505 } }, configRoot);
    migrate({ workdir, configRoot, ownerPolicyPath: path.join(root, 'missing-policy.json') });
    assert.deepEqual(readConfig(configRoot).config.pet, { enabled: true, scale: 2.505 });
    migrate({ workdir, configRoot, ownerPolicyPath: path.join(root, 'missing-policy.json') });
    assert.deepEqual(readConfig(configRoot).config.pet, { enabled: true, scale: 2.505 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('live plugin sessions broadcast off, on, decimal size, and off while action checking stays active', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-live-'));
  const previousRoot = process.env.XOR_CONFIG_ROOT;
  const previousNoPet = process.env.XOR_NO_PET;
  process.env.XOR_CONFIG_ROOT = root;
  delete process.env.XOR_NO_PET;
  const hooks = [];
  const children = [];
  const events = [];
  let decisions = 0;
  try {
    const { xor } = await import(pathToFileURL(path.join(project, 'plugin/xor.js')).href);
    const launchPet = () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdin.on('data', (chunk) => {
        events.push(...chunk.toString().trim().split('\n').map(JSON.parse));
      });
      child.kill = () => { child.stopped = true; child.emit('exit', 0); };
      children.push(child);
      queueMicrotask(() => child.emit('spawn'));
      return child;
    };
    for (let i = 0; i < 2; i++) {
      hooks.push(await xor({ directory: root }, {
        launchPet,
        gate: async () => { decisions++; return { verdict: 'allow' }; },
      }));
    }
    await waitForControllers(root, 2);
    assert.equal(children.length, 0);
    assert.match(await petCommand(root, 'on'), /Applied to active sessions/);
    assert.equal(children.length, 2);
    assert.match(await petCommand(root, '250.5'), /250.5%/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events.filter((event) => event.detail?.scale === 2.505).length, 2);
    for (const hook of hooks) await hook.runAction({ callID: 'fixture-call', ...({ tool: 'read', sessionID: 'test' }), ...({ args: { filePath: path.join(root, 'input.txt') } }), execute: async () => undefined });
    assert.equal(decisions, 2);
    assert.match(await petCommand(root, 'off'), /Applied to active sessions/);
    assert.ok(children.every((child) => child.stopped));
    for (const hook of hooks) await hook.runAction({ callID: 'fixture-call', ...({ tool: 'read', sessionID: 'test' }), ...({ args: { filePath: path.join(root, 'input.txt') } }), execute: async () => undefined });
    assert.equal(decisions, 4);
    await petCommand(root, 'reset');
    assert.deepEqual(readConfig(root).config.pet, { enabled: false, scale: 1 });
  } finally {
    for (const hook of hooks) hook.dispose();
    if (previousRoot === undefined) delete process.env.XOR_CONFIG_ROOT;
    else process.env.XOR_CONFIG_ROOT = previousRoot;
    if (previousNoPet === undefined) delete process.env.XOR_NO_PET;
    else process.env.XOR_NO_PET = previousNoPet;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an idle plugin with pet mode off exits without a lingering control server', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-exit-'));
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { xor } from './plugin/xor.js'; await xor({ directory: process.env.XOR_CONFIG_ROOT }, { gate: async () => ({ verdict: 'allow' }) });"], {
      cwd: project,
      env: { ...process.env, XOR_CONFIG_ROOT: root, XOR_NO_PET: '1' },
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(fs.existsSync(path.join(root, 'pet-controls')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('arbitrary finite requested percentages render within physical display dimensions', () => {
  const area = { width: 1920, height: 1080 };
  for (const requested of [Number.MIN_VALUE, 1e-200, 0.875, 2.505, Number.MAX_VALUE]) {
    const scale = renderScale(requested, area);
    const bounds = boundsFor({ x: 0, y: 0, width: 340, height: 380 }, scale);
    assert.ok(Object.values(bounds).every(Number.isFinite));
    assert.ok(bounds.width >= 1 && bounds.width <= area.width);
    assert.ok(bounds.height >= 1 && bounds.height <= area.height);
  }
  assert.equal(renderScale(2.505, area), 2.505);
});

test('unavailable optional control storage cannot prevent gate startup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-storage-'));
  try {
    const config = path.join(root, 'not-a-directory');
    fs.writeFileSync(config, 'unavailable');
    const workdir = path.join(root, 'project');
    fs.mkdirSync(path.join(workdir, '.xor'), { recursive: true });
    fs.writeFileSync(path.join(workdir, '.xor', 'preference.json'), JSON.stringify({ text: 'Permit reading the requested local fixture.' }));
    fs.writeFileSync(path.join(workdir, 'fixture.txt'), 'Local fixture.');
    fs.writeFileSync(path.join(workdir, '.xor', 'settings.json'), JSON.stringify({ verdict_logging: false }));
    for (const forced of ['0', '1']) {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import { xor } from ${JSON.stringify(pathToFileURL(path.join(project, 'plugin/xor.js')).href)}; const hook = await xor({ directory: process.cwd() }, { gate: async () => ({ verdict: 'allow' }) }); await hook.runAction({ callID: 'fixture-call', ...({ tool: 'read', sessionID: 'pet-storage' }), ...({ args: { filePath: 'fixture.txt' } }), execute: async () => undefined }); console.log('gate operational'); hook.dispose();`], {
        cwd: workdir,
        env: { ...process.env, XOR_CONFIG_ROOT: config, XOR_NO_PET: forced },
        encoding: 'utf8',
        timeout: 3000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /gate operational/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pet controls report failed process startup without claiming application', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-launch-'));
  const { EventBus } = require('../../events');
  const { createPetController } = require('../../pet/controller');
  const { sendControl } = require('../../pet/control');
  const errors = [];
  const controller = createPetController({
    bus: new EventBus(),
    root,
    launch: () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.kill = () => {};
      queueMicrotask(() => child.emit('error', new Error('Cannot start the pet host')));
      return child;
    },
    onError: (error) => errors.push(error.message),
  });
  try {
    assert.equal(await controller.ready, true);
    writeConfig({ ...defaultConfig(), pet: { enabled: true, scale: 1 } }, root);
    assert.equal(await sendControl({ action: 'reload' }, root), false);
    assert.deepEqual(errors, ['Cannot start the pet host']);
  } finally {
    controller.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('asynchronous control registration failures stay inside the optional pet controller', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-registration-'));
  const { EventBus } = require('../../events');
  const { createPetController } = require('../../pet/controller');
  const errors = [];
  const controller = createPetController({ bus: new EventBus(), root, launch: () => null, onError: (error) => errors.push(error.code) });
  try {
    const registry = path.join(root, 'pet-controls');
    fs.rmdirSync(registry);
    fs.writeFileSync(registry, 'unavailable');
    assert.equal(await controller.ready, false);
    assert.equal(errors.length, 1);
    assert.ok(['ENOTDIR', 'ENOENT', 'EACCES', 'EPERM'].includes(errors[0]), errors[0]);
  } finally {
    controller.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a disconnected pet controller cannot leave a command waiting indefinitely', { timeout: 2000 }, async () => {
  const net = require('node:net');
  const { randomUUID } = require('node:crypto');
  const { controlSocketPath, sendControl } = require('../../pet/control');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-disconnect-'));
  const id = randomUUID();
  const socket = controlSocketPath(root, id);
  const server = net.createServer((connection) => connection.once('data', () => connection.destroy()));
  try {
    fs.mkdirSync(path.join(root, 'pet-controls'));
    fs.writeFileSync(path.join(root, 'pet-controls', id), '');
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
    assert.equal(await sendControl({ action: 'reload' }, root), false);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.unlinkSync(socket); } catch {}
  }
});

test('pet control servers acknowledge newline-framed requests without waiting for client EOF', { timeout: 2500 }, async () => {
  const net = require('node:net');
  const { controlSocketPath, startControlServer } = require('../../pet/control');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-frame-'));
  const received = [];
  const server = startControlServer(async (control) => {
    await new Promise((resolve) => setImmediate(resolve));
    received.push(control);
    return true;
  }, root);
  let client;
  try {
    assert.equal(await server.ready, true);
    const [id] = fs.readdirSync(path.join(root, 'pet-controls'));
    const reply = await new Promise((resolve, reject) => {
      client = net.createConnection(controlSocketPath(root, id));
      let output = '';
      client.setEncoding('utf8');
      client.once('error', reject);
      client.on('data', (chunk) => { output += chunk; });
      client.once('end', () => resolve(output));
      client.once('connect', () => {
        client.write('{"action":');
        setImmediate(() => client.write('"reload"}\n'));
      });
    });
    assert.equal(reply, 'ok');
    assert.deepEqual(received, [{ action: 'reload' }]);
  } finally {
    client?.destroy();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('malformed, oversized, extra, and unterminated pet control frames cannot dispatch actions', { timeout: 3000 }, async () => {
  const net = require('node:net');
  const { controlSocketPath, startControlServer } = require('../../pet/control');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-pet-invalid-'));
  let calls = 0;
  const server = startControlServer(() => { calls++; return true; }, root);
  try {
    assert.equal(await server.ready, true);
    const [id] = fs.readdirSync(path.join(root, 'pet-controls'));
    for (const frame of ['not-json\n', '{}\n{}\n', 'x'.repeat(4097) + '\n', '{"action":"reload"}']) {
      const reply = await new Promise((resolve) => {
        const client = net.createConnection(controlSocketPath(root, id));
        let output = '';
        client.setEncoding('utf8');
        client.on('data', (chunk) => { output += chunk; });
        client.once('error', () => {});
        client.once('close', () => resolve(output));
        client.once('connect', () => client.write(frame));
      });
      assert.notEqual(reply, 'ok');
      assert.equal(calls, 0);
    }
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
