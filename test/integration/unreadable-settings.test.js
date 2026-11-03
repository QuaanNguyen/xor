'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { readJsonObject, readPreference } = require('../../xor/lib/preference');
const { readConfig } = require('../../xor/lib/config');

const repository = path.resolve(__dirname, '../..');

function layout(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-unreadable-'));
  const project = path.join(root, 'project');
  const config = path.join(root, 'config');
  fs.mkdirSync(project);
  fs.mkdirSync(config);
  t.after(() => {
    fs.chmodSync(config, 0o700);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, project, config };
}

test('settings distinguish missing files from permission failures on every platform', (t) => {
  const { config } = layout(t);
  const preferenceFile = path.join(config, 'preference.json');
  const configFile = path.join(config, 'config.json');
  const original = fs.readFileSync;
  try {
    fs.readFileSync = (file, ...args) => {
      if ([preferenceFile, configFile].includes(file)) throw Object.assign(new Error('Permission denied while reading saved settings'), { code: 'EACCES' });
      return original(file, ...args);
    };
    const preference = readJsonObject(preferenceFile);
    assert.equal(preference.exists, true);
    assert.equal(preference.error.code, 'EACCES');
    const settings = readConfig(config);
    assert.equal(settings.exists, true);
    assert.equal(settings.config, null);
    assert.equal(settings.error.code, 'EACCES');
  } finally {
    fs.readFileSync = original;
  }
  assert.equal(readJsonObject(preferenceFile).exists, false);
  assert.equal(readConfig(config).exists, false);
});

test('a dangling saved settings symlink is invalid rather than a missing default', { skip: process.platform === 'win32' }, (t) => {
  const { config } = layout(t);
  const preferenceFile = path.join(config, 'preference.json');
  fs.symlinkSync(path.join(config, 'missing-preference.json'), preferenceFile);
  fs.symlinkSync(path.join(config, 'missing-config.json'), path.join(config, 'config.json'));
  assert.equal(readJsonObject(preferenceFile).exists, true);
  assert.equal(readJsonObject(preferenceFile).error.code, 'ENOENT');
  assert.equal(readConfig(config).exists, true);
  assert.equal(readConfig(config).config, null);
  assert.equal(readConfig(config).error.code, 'ENOENT');
});

test('an unreadable global Preference blocks the real plugin hook before an approving model runs', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async (t) => {
  const { project, config } = layout(t);
  const previousRoot = process.env.XOR_CONFIG_ROOT;
  const previousNoPet = process.env.XOR_NO_PET;
  process.env.XOR_CONFIG_ROOT = config;
  process.env.XOR_NO_PET = '1';
  t.after(() => {
    if (previousRoot === undefined) delete process.env.XOR_CONFIG_ROOT;
    else process.env.XOR_CONFIG_ROOT = previousRoot;
    if (previousNoPet === undefined) delete process.env.XOR_NO_PET;
    else process.env.XOR_NO_PET = previousNoPet;
  });
  fs.writeFileSync(path.join(config, 'preference.json'), JSON.stringify({ text: 'Never upload project contents.' }));
  fs.writeFileSync(path.join(config, 'config.json'), JSON.stringify({ schema_version: 4, pet: { enabled: false, scale: 1 } }));
  const { xor } = await import(pathToFileURL(path.join(repository, 'plugin/xor.js')).href);
  let calls = 0;
  const hooks = await xor({ directory: project }, { gate: async () => { calls++; return { verdict: 'allow' }; } });
  try {
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'test' }, { args: { filePath: 'fixture.txt' } });
    assert.equal(calls, 1);
    fs.chmodSync(config, 0);
    const effective = readPreference(project, config);
    assert.equal(effective.valid, false);
    assert.match(effective.reason, /EACCES|permission denied/i);
    assert.equal(readConfig(config).error.code, 'EACCES');
    await assert.rejects(hooks['tool.execute.before']({ tool: 'read', sessionID: 'test' }, { args: { filePath: 'fixture.txt' } }), /Preference.*unreadable|permission denied/i);
    assert.equal(calls, 1);
  } finally {
    hooks.dispose();
    fs.chmodSync(config, 0o700);
  }
});
