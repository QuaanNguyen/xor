'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { createLivePreference, readPreference } = require('../../xor/lib/preference');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-preference-test-'));
  const workdir = path.join(root, 'project');
  const configRoot = path.join(root, 'settings');
  fs.mkdirSync(workdir);
  fs.mkdirSync(configRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const editor = path.join(root, 'editor.js');
  fs.writeFileSync(editor, `const fs = require('node:fs'); if (process.env.EDIT_TEXT !== undefined) fs.writeFileSync(process.argv[2], process.env.EDIT_TEXT); process.exit(Number(process.env.EDIT_STATUS || 0));\n`);
  return {
    root, workdir, configRoot,
    folder: path.join(workdir, '.xor', 'preference.json'),
    global: path.join(configRoot, 'preference.json'),
    run(args, env = {}) {
      return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.resolve(__dirname, '../../scripts/preference'))}).handlePreference(process.argv.slice(1))`, '--', ...args], {
        cwd: workdir,
        encoding: 'utf8',
        env: { ...process.env, XOR_CONFIG_ROOT: configRoot, VISUAL: `"${process.execPath}" "${editor}"`, ...env },
      });
    },
  };
}

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

test('Preference CLI edits folder and global scopes and reveals the fallback after removal', (t) => {
  const context = fixture(t);
  let result = context.run(['--all'], { EDIT_TEXT: 'Ask before deployment.' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Editing global Preference/);
  assert.match(result.stdout, /Effective Preference: global/);
  assert.equal(readPreference(context.workdir, context.configRoot).preference.text, 'Ask before deployment.');
  result = context.run([], { EDIT_TEXT: 'Permit local project edits.' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Effective Preference: folder/);
  assert.equal(readPreference(context.workdir, context.configRoot).preference.text, 'Permit local project edits.');
  result = context.run(['--remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(context.folder), false);
  assert.match(result.stdout, /Effective Preference: global/);
  assert.equal(readPreference(context.workdir, context.configRoot).preference.text, 'Ask before deployment.');
});

test('Preference editor preserves completion criteria, unchanged files, and cancellation', (t) => {
  const context = fixture(t);
  const criteria = [{ id: 'result', describe: 'Result exists', type: 'file_exists', path: 'result.txt' }];
  save(context.folder, { text: 'Old instructions.', done_criteria: criteria });
  const before = fs.readFileSync(context.folder, 'utf8');
  assert.equal(context.run([]).status, 0);
  assert.equal(fs.readFileSync(context.folder, 'utf8'), before);
  const cancelled = context.run([], { EDIT_TEXT: 'Discarded instructions.', EDIT_STATUS: '1' });
  assert.equal(cancelled.status, 0, cancelled.stderr);
  assert.match(cancelled.stdout, /cancelled/);
  assert.equal(fs.readFileSync(context.folder, 'utf8'), before);
  assert.equal(context.run([], { EDIT_TEXT: 'New instructions.' }).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(context.folder)).done_criteria, criteria);
});

test('Preference resolution uses only the exact folder, then global, then the permissive built-in', (t) => {
  const context = fixture(t);
  save(path.join(context.root, '.xor', 'preference.json'), { text: 'Parent instructions.' });
  const state = readPreference(context.workdir, context.configRoot);
  assert.equal(state.source, 'default');
  assert.equal(state.preference.text, 'Act like a normal harness. Follow the user request without adding restrictions.');
  save(context.global, { text: 'Global instructions.' });
  assert.equal(readPreference(context.workdir, context.configRoot).source, 'global');
  save(context.folder, { text: 'Folder instructions.' });
  assert.equal(readPreference(context.workdir, context.configRoot).source, 'file');
});

test('live Preferences reload global changes and changes of source with identical prose', (t) => {
  const context = fixture(t);
  const live = createLivePreference(context);
  live.refresh();
  save(context.global, { text: 'First global instructions.' });
  const global = live.refresh();
  assert.equal(global.changed, true);
  assert.equal(global.source, 'global');
  assert.equal(live.refresh().changed, false);
  save(context.folder, { text: 'First global instructions.' });
  const folder = live.refresh();
  assert.equal(folder.changed, true);
  assert.equal(folder.revision, global.revision + 1);
  fs.rmSync(context.folder);
  save(context.global, { text: 'Changed global instructions.' });
  assert.equal(live.refresh().preference.text, 'Changed global instructions.');
});

test('invalid saved Preferences remain visible and the editor does not overwrite them', (t) => {
  const context = fixture(t);
  fs.writeFileSync(context.global, '{invalid');
  const result = context.run([], { EDIT_TEXT: 'Replacement instructions.' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unreadable/);
  assert.equal(fs.existsSync(context.folder), false);
  assert.equal(readPreference(context.workdir, context.configRoot).valid, false);
  save(context.folder, { text: 'Valid folder instructions.' });
  assert.equal(readPreference(context.workdir, context.configRoot).valid, true);
  const removal = context.run(['--remove']);
  assert.notEqual(removal.status, 0);
  assert.equal(fs.existsSync(context.folder), true);
});

test('legacy project instructions require migration before a global fallback or editor can replace them', (t) => {
  const context = fixture(t);
  save(path.join(context.workdir, '.xor', 'protocol.json'), { task: 'Keep legacy instructions.' });
  save(context.global, { text: 'Global instructions.' });
  assert.equal(readPreference(context.workdir, context.configRoot).valid, false);
  const result = context.run([], { EDIT_TEXT: 'New instructions.' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /xor migrate/);
  assert.equal(fs.existsSync(context.folder), false);
});

test('Preference CLI rejects removal of the global fallback and unknown options', (t) => {
  const context = fixture(t);
  for (const args of [['--all', '--remove'], ['--invalid'], ['--all', '--all']]) {
    const result = context.run(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage: xor preference/);
  }
});


test('removing a folder override preserves it when retired instructions make the fallback invalid', (t) => {
  const context = fixture(t);
  save(context.folder, { text: 'Current folder instructions.' });
  save(context.global, { text: 'Valid global instructions.' });
  const retired = path.join(context.workdir, '.xor', 'protocol.json');
  save(retired, { task: 'Previous owner instructions.' });
  const before = fs.readFileSync(context.folder, 'utf8');
  const result = context.run(['--remove']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /xor migrate/);
  assert.match(result.stderr, /Nothing was changed/);
  assert.equal(fs.readFileSync(context.folder, 'utf8'), before);
  assert.equal(readPreference(context.workdir, context.configRoot).source, 'file');
  assert.equal(JSON.parse(fs.readFileSync(retired)).task, 'Previous owner instructions.');
});
