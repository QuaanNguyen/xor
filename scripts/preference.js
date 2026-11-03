'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { defaultConfigRoot } = require('../xor/lib/config');
const {
  DEFAULT_PREFERENCE,
  globalPreferencePath,
  preferencePath,
  readJsonObject,
  readFallbackPreference,
  readPreference,
  validatePreference,
  withDefaults,
  writePreference,
} = require('../xor/lib/preference');

function effectiveSource(state) {
  if (!state.valid) return `invalid saved settings at ${state.file}`;
  if (state.source === 'default') return 'built-in';
  return `${state.source === 'file' ? 'folder' : 'global'} (${state.file})`;
}

function handlePreference(args = [], options = {}) {
  const global = args.includes('--all');
  const remove = args.includes('--remove');
  if (args.some((arg) => !['--all', '--remove'].includes(arg)) || new Set(args).size !== args.length || (global && remove)) {
    throw new Error('Usage: xor preference [--all | --remove]');
  }
  const workdir = options.workdir || process.cwd();
  const configRoot = options.configRoot || defaultConfigRoot();
  const output = options.output || process.stdout;
  const file = global ? globalPreferencePath(configRoot) : preferencePath(workdir);
  const saved = readJsonObject(file);
  if (saved.error) throw new Error(`The Preference at ${file} is unreadable: ${saved.error.message}. Nothing was changed.`);
  if (saved.exists) validatePreference(saved.value);
  if (remove) {
    const fallback = readFallbackPreference(workdir, configRoot);
    if (!fallback.valid) throw new Error(`${fallback.reason}. Nothing was changed.`);
    fs.rmSync(file, { force: true });
    const state = readPreference(workdir, configRoot);
    output.write(`${saved.exists ? 'Removed' : 'No'} folder Preference at ${file}.\nEffective Preference: ${effectiveSource(state)}.\n`);
    return { file, changed: saved.exists, removed: saved.exists, source: state.source };
  }
  const state = readPreference(workdir, configRoot);
  if (!global && !state.valid) throw new Error(`${state.reason}. Nothing was changed.`);
  const initial = saved.exists ? withDefaults(saved.value) : global ? withDefaults(DEFAULT_PREFERENCE) : state.preference;
  output.write(`Editing ${global ? 'global' : 'folder'} Preference: ${file}.\nEffective Preference: ${effectiveSource(state)}.\n`);
  const editor = options.editor || process.env.VISUAL || process.env.EDITOR;
  if (!editor?.trim()) throw new Error('Set VISUAL or EDITOR to your text editor, then run xor preference again. Nothing was changed.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-preference-edit-'));
  const draft = path.join(directory, 'preference.txt');
  try {
    fs.writeFileSync(draft, initial.text, { mode: 0o600 });
    const command = `${editor} ${process.platform === 'win32' ? '"%XOR_PREFERENCE_EDIT_FILE%"' : '"$XOR_PREFERENCE_EDIT_FILE"'}`;
    const result = spawnSync(command, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, XOR_PREFERENCE_EDIT_FILE: draft },
    });
    if (result.error || result.status !== 0) {
      output.write('Preference editing cancelled. Saved settings were kept.\n');
      return { file, changed: false, cancelled: true };
    }
    const text = fs.readFileSync(draft, 'utf8');
    if (text === initial.text) {
      output.write('Preference unchanged. Saved settings were kept.\n');
      return { file, changed: false };
    }
    const current = readJsonObject(file);
    if (current.exists !== saved.exists || current.contents !== saved.contents) throw new Error('The saved Preference changed while the editor was open. Nothing was changed.');
    writePreference(file, { ...initial, text });
    const next = readPreference(workdir, configRoot);
    output.write(`Saved ${global ? 'global' : 'folder'} Preference: ${file}.\nEffective Preference: ${effectiveSource(next)}.\n`);
    return { file, changed: true, source: next.source };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { handlePreference };
