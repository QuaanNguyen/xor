'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { installPlugin } = require('../../scripts/install-plugin');
const { fakeGateManifest } = require('../fixtures/fake-gate');

function setup(t, definition) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-staged-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, 'repository');
  for (const directory of ['plugin', 'xor/lib', 'events', 'pet']) fs.mkdirSync(path.join(repoRoot, directory), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'plugin/xor.js'), `export const xor = async () => ({}); export default ${definition};\n`);
  fs.writeFileSync(path.join(repoRoot, 'xor/lib/session.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(repoRoot, 'events/index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(repoRoot, 'pet/package.json'), '{}\n');
  const command = path.join(root, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  const fixture = path.resolve(__dirname, '../fixtures/fake-opencode.js');
  fs.writeFileSync(command, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`, { mode: 0o755 });
  const destDir = path.join(root, 'plugins');
  fs.mkdirSync(path.join(destDir, 'xor'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'xor', 'previous'), 'previous installation');
  return {
    root, destDir,
    options: {
      repoRoot, destDir, skipRuntimeSetup: true, verifyOpenCode: true,
      openCodeCommand: command,
      gateRoot: path.join(root, 'gate'),
      gateManifest: fakeGateManifest(path.join(root, 'artifacts')).manifest,
    },
  };
}

test('installation rejects throwing setup before replacing the working plugin', async (t) => {
  const fixture = setup(t, `{ id: 'xor', setup() { throw new Error('setup exploded'); } }`);
  await assert.rejects(installPlugin(fixture.options), /setup exploded/);
  assert.equal(fs.readFileSync(path.join(fixture.destDir, 'xor', 'previous'), 'utf8'), 'previous installation');
  assert.equal(fs.existsSync(path.join(fixture.destDir, 'xor', 'index.mjs')), false);
  assert.deepEqual(fs.readdirSync(fixture.destDir), ['xor']);
});

test('installation requires actual action hook registration before replacing the working plugin', async (t) => {
  const fixture = setup(t, `{ id: 'xor', setup() {} }`);
  await assert.rejects(installPlugin(fixture.options), /did not register its action hooks/);
  assert.equal(fs.readFileSync(path.join(fixture.destDir, 'xor', 'previous'), 'utf8'), 'previous installation');
});

test('installation commits the staged plugin after its setup registers action hooks', async (t) => {
  const fixture = setup(t, `{ id: 'xor', async setup(context) { await context.tool.hook('execute.before', async () => {}); await context.tool.hook('execute.after', async () => {}); } }`);
  const result = await installPlugin(fixture.options);
  assert.ok(fs.existsSync(result.dest));
  assert.equal(fs.existsSync(path.join(fixture.destDir, 'xor', 'previous')), false);
});
