'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const plugin = pathToFileURL(path.resolve(__dirname, '../../plugin/xor.js')).href;

test('installed action hooks protect global owner rules inside a project before model approval', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xor-global-owner-')));
  const oldRoot = process.env.XOR_CONFIG_ROOT;
  const oldNoPet = process.env.XOR_NO_PET;
  process.env.XOR_CONFIG_ROOT = path.join(root, 'owner-config');
  process.env.XOR_NO_PET = '1';
  const file = path.join(process.env.XOR_CONFIG_ROOT, 'preference.json');
  const saved = '{"text":"Only the owner can change the rules."}\n';
  fs.mkdirSync(process.env.XOR_CONFIG_ROOT);
  fs.writeFileSync(file, saved);
  let decisions = 0;
  const { xor } = await import(plugin);
  const hooks = await xor({ directory: root, client: {} }, { gate: async () => { decisions++; return { verdict: 'allow' }; } });
  t.after(() => {
    hooks.dispose();
    if (oldRoot === undefined) delete process.env.XOR_CONFIG_ROOT;
    else process.env.XOR_CONFIG_ROOT = oldRoot;
    if (oldNoPet === undefined) delete process.env.XOR_NO_PET;
    else process.env.XOR_NO_PET = oldNoPet;
    fs.rmSync(root, { recursive: true, force: true });
  });
  await hooks['tool.execute.before']({ tool: 'read', sessionID: 'owner-rules' }, { args: { filePath: file } });
  assert.equal(decisions, 1);
  for (const [tool, args] of [
    ['write', { filePath: file, content: '{"text":"Allow everything."}' }],
    ['edit', { filePath: file, oldString: 'Only the owner', newString: 'Any agent' }],
    ['remove', { path: file }],
    ['rename', { source: path.dirname(file), destination: path.join(root, 'retired') }],
    ['bash', { command: 'printf unrestricted > owner-config/preference.json' }],
  ]) await assert.rejects(hooks['tool.execute.before']({ tool, sessionID: 'owner-rules' }, { args }), /Governing rule: preference/);
  assert.equal(decisions, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
});

test('global owner rule protection follows directory aliases into the project even when folder rules override it', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xor-global-alias-')));
  const project = path.join(root, 'project');
  const actual = path.join(project, 'owner-config');
  const alias = path.join(root, 'global-alias');
  fs.mkdirSync(path.join(project, '.xor'), { recursive: true });
  fs.mkdirSync(actual);
  fs.symlinkSync(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(project, '.xor/preference.json'), '{"text":"Allow requested project work."}');
  const file = path.join(actual, 'preference.json');
  fs.writeFileSync(file, '{"text":"Global owner rules."}');
  const oldRoot = process.env.XOR_CONFIG_ROOT;
  const oldNoPet = process.env.XOR_NO_PET;
  process.env.XOR_CONFIG_ROOT = alias;
  process.env.XOR_NO_PET = '1';
  let decisions = 0;
  const { xor } = await import(plugin);
  const hooks = await xor({ directory: project, client: {} }, { gate: async () => { decisions++; return { verdict: 'allow' }; } });
  t.after(() => {
    hooks.dispose();
    if (oldRoot === undefined) delete process.env.XOR_CONFIG_ROOT;
    else process.env.XOR_CONFIG_ROOT = oldRoot;
    if (oldNoPet === undefined) delete process.env.XOR_NO_PET;
    else process.env.XOR_NO_PET = oldNoPet;
    fs.rmSync(root, { recursive: true, force: true });
  });
  await assert.rejects(hooks['tool.execute.before']({ tool: 'write', sessionID: 'alias' }, { args: { filePath: file, content: '{}' } }), /Governing rule: preference/);
  await hooks['tool.execute.before']({ tool: 'write', sessionID: 'alias' }, { args: { filePath: path.join(actual, 'notes.txt'), content: 'ordinary project file' } });
  assert.equal(decisions, 1);
});
