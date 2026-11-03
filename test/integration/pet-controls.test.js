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
const { clampScale } = require('../../pet/geometry');

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
    for (const hook of hooks) await hook['tool.execute.before']({ tool: 'read', sessionID: 'test' }, { args: { filePath: path.join(root, 'input.txt') } });
    assert.equal(decisions, 2);
    assert.match(await petCommand(root, 'off'), /Applied to active sessions/);
    assert.ok(children.every((child) => child.stopped));
    for (const hook of hooks) await hook['tool.execute.before']({ tool: 'read', sessionID: 'test' }, { args: { filePath: path.join(root, 'input.txt') } });
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
    assert.deepEqual(fs.readdirSync(path.join(root, 'pet-controls')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
