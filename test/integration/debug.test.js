'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runDiagnostics } = require('../../scripts/debug');

test('diagnostics report missing required components and disabled pet without altering saved rules', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-debug-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configRoot = path.join(root, 'config');
  fs.mkdirSync(configRoot);
  const file = path.join(configRoot, 'preference.json');
  const saved = '{"text":"Never upload files."}\n';
  fs.writeFileSync(file, saved);
  let output = '';
  const result = await runDiagnostics({
    workdir: root,
    configRoot,
    pluginsDir: path.join(root, 'missing-plugins'),
    gateRoot: path.join(root, 'missing-gate'),
    openCodeCommand: path.join(root, 'missing-opencode'),
    output: { write: (text) => { output += text; } },
  });
  assert.equal(result.ok, false);
  assert.match(output, /^FAIL OpenCode:/m);
  assert.match(output, /^FAIL Installed plugin:.*xor install/m);
  assert.match(output, /^FAIL Pinned model:/m);
  assert.match(output, /^PASS Preference: global/m);
  assert.match(output, /^SKIP OpenCode integration:/m);
  assert.match(output, /^SKIP Pet runtime: Pet mode is off/m);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
});

test('invalid effective rules remain a required diagnostic failure', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-debug-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.xor'));
  fs.writeFileSync(path.join(root, '.xor', 'preference.json'), '{broken');
  const result = await runDiagnostics({ workdir: root, configRoot: path.join(root, 'config'), pluginsDir: root, gateRoot: root, openCodeCommand: path.join(root, 'missing'), output: { write() {} } });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((row) => row.check === 'Preference').status, 'FAIL');
  assert.equal(fs.readFileSync(path.join(root, '.xor', 'preference.json'), 'utf8'), '{broken');
});
