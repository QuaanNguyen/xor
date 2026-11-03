'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const { createXorAdapter } = require('../../xor/lib/adapter');
const { platformKey } = require('../../xor/lib/gate-artifacts');
const { DEFAULT_PREFERENCE } = require('../../xor/lib/preference');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-cancel-check-'));
  const fixtureDir = path.join(root, 'fixture');
  fs.mkdirSync(fixtureDir);
  const runner = path.join(fixtureDir, process.platform === 'win32' ? 'needle.exe' : 'needle');
  fs.writeFileSync(runner, 'fixture runner');
  const weights = path.join(fixtureDir, 'needle3.cact');
  const started = path.join(root, 'started');
  const script = path.join(root, 'checker.js');
  fs.writeFileSync(weights, 'fictional model');
  fs.writeFileSync(script, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(started)}, String(process.pid));setTimeout(()=>process.stdout.write(JSON.stringify({success:true,function_calls:[{name:'approve',arguments:{}}]})),500);`);
  const artifact = (file) => ({ path: path.basename(file), size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  const manifest = { revision: 'fixture', weights: artifact(weights), runners: { [platformKey()]: artifact(runner) } };
  const childProcess = require('node:child_process');
  t.mock.method(childProcess, 'spawn', (executable, args, options) => spawn(process.execPath, [script], options));
  delete require.cache[require.resolve('../../xor/lib/gate')];
  const { createNeedleGate: createGate } = require('../../xor/lib/gate');
  const gate = createGate({ root, manifest, workdir: root });
  t.after(() => { gate.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  const adapter = createXorAdapter({ workdir: root, preference: DEFAULT_PREFERENCE, gate });
  return { root, started, gate, adapter };
}

test('disposing an active checker stops it and withholds the proposed marker write', async (t) => {
  const context = fixture(t);
  const marker = path.join(context.root, 'action-ran');
  const pending = context.adapter.proposedAction({ tool: 'shell', args: { command: 'touch action-ran' }, userMessage: 'Create the marker.' });
  const limit = Date.now() + 3000;
  while (!fs.existsSync(context.started) && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!fs.existsSync(context.started)) assert.fail(JSON.stringify(await pending));
  context.gate.dispose();
  const result = await pending;
  if (result.decision === 'allow') fs.writeFileSync(marker, 'ran');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(result.decision, 'disallow');
  const pid = Number(fs.readFileSync(context.started, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

function saveSettings(root, settings) {
  fs.mkdirSync(path.join(root, '.xor'), { recursive: true });
  fs.writeFileSync(path.join(root, '.xor', 'settings.json'), JSON.stringify(settings));
}

test('folder deadline withholds the action and records the effective limit', async (t) => {
  const context = fixture(t);
  saveSettings(context.root, { gate_timeout_ms: 50 });
  const result = await context.adapter.proposedAction({ tool: 'shell', args: { command: 'touch action-ran' }, userMessage: 'Create the marker.' });
  assert.equal(result.decision, 'disallow');
  assert.match(result.message, /50ms time limit/);
  assert.equal(result.events.at(-1).detail.timeoutMs, 50);
  assert.equal(fs.existsSync(path.join(context.root, 'action-ran')), false);
});

test('invalid folder deadlines withhold actions before starting the checker', async (t) => {
  const context = fixture(t);
  for (const value of [0, -1, 120001, 1.5, '1000', null]) {
    saveSettings(context.root, { gate_timeout_ms: value });
    const result = await context.adapter.proposedAction({ tool: 'read', args: { path: 'notes.txt' } });
    assert.equal(result.decision, 'disallow');
    assert.match(result.message, /Gate settings could not be applied/);
    assert.equal(fs.existsSync(context.started), false);
  }
});

test('an already cancelled call cannot start the checker', async (t) => {
  const context = fixture(t);
  const controller = new AbortController();
  controller.abort();
  const result = await context.adapter.proposedAction({ tool: 'read', args: { path: 'notes.txt' }, signal: controller.signal });
  assert.equal(result.decision, 'disallow');
  assert.equal(fs.existsSync(context.started), false);
});

test('parallel calls record queue and checker time separately', async (t) => {
  const context = fixture(t);
  const action = () => context.adapter.proposedAction({ tool: 'read', args: { path: 'notes.txt' } });
  const [first, second] = await Promise.all([action(), action()]);
  for (const result of [first, second]) {
    assert.equal(result.decision, 'allow');
    const timing = result.events.at(-1).detail;
    assert.equal(timing.timeoutMs, 15000);
    assert.ok(timing.queueMs >= 0);
    assert.ok(timing.checkerMs >= 0);
  }
  assert.ok(second.events.at(-1).detail.queueMs >= first.events.at(-1).detail.checkerMs);
});
