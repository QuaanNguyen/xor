'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { defaultPluginsDir, nativePetReady, electronReady } = require('./install-plugin');
const { readPreference } = require('../xor/lib/preference');
const { readConfig } = require('../xor/lib/config');
const { gateManifest, defaultGateRoot, verifyInstalledGate } = require('../xor/lib/gate-artifacts');
const { assertOpenCodeVersion } = require('../xor/lib/opencode-version');
const { createNeedleGate } = require('../xor/lib/gate');
const { proposedCall } = require('../xor/lib/toolcalls');

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    windowsHide: true,
  });
  if (result.error) throw new Error(result.error.code === 'ETIMEDOUT' ? 'The check timed out.' : result.error.message);
  if (result.status !== 0) {
    if (command === process.execPath) {
      let report;
      try { report = JSON.parse(result.stdout); } catch {}
      if (report?.reason) throw new Error(report.reason);
    }
    throw new Error('The check failed. Run xor install to repair setup.');
  }
  return result.stdout;
}

async function runDiagnostics(options = {}) {
  const workdir = options.workdir || process.cwd();
  const output = options.output || process.stdout;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xor-debug-')));
  const rows = [];
  const env = { ...process.env, XOR_NO_PET: '1' };
  for (const [key, name] of Object.entries({ XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state' })) {
    env[key] = path.join(root, name);
  }
  const command = options.openCodeCommand || (process.platform === 'win32' ? 'opencode.exe' : 'opencode');
  const pluginsDir = options.pluginsDir || defaultPluginsDir();
  const entry = path.join(pluginsDir, 'xor', 'index.mjs');
  const modelRoot = options.gateRoot || defaultGateRoot();
  let version;
  let ready;
  function record(status, check, detail) {
    const row = { status, check, detail: String(detail).replace(/[\r\n]+/g, ' ') };
    rows.push(row);
    output.write(`${status} ${check}: ${row.detail}\n`);
  }
  function check(name, action) {
    try {
      const detail = action();
      record('PASS', name, detail);
      return true;
    } catch (error) {
      record('FAIL', name, error.message);
      return false;
    }
  }
  try {
    check('OpenCode', () => {
      version = assertOpenCodeVersion(run(command, ['--version'], root, env).trim());
      return version;
    });
    check('Preference', () => {
      const state = readPreference(workdir, options.configRoot);
      if (!state.valid) throw new Error(state.reason);
      return state.source === 'default' ? 'built-in' : `${state.source === 'file' ? 'folder' : 'global'} (${state.file})`;
    });
    const installed = check('Installed plugin', () => {
      if (!fs.existsSync(entry)) throw new Error('XOR is missing. Run xor install.');
      return entry;
    });
    const model = check('Pinned model', () => {
      ready = verifyInstalledGate(gateManifest(), modelRoot);
      if (!ready.ready) throw new Error(`${ready.reason}. Run xor install.`);
      return 'Model and runner match their pinned hashes.';
    });
    if (model) {
      const gate = createNeedleGate({ root: modelRoot });
      try {
        for (const [text, expected] of [
          ['Allow reading the requested local file.', 'allow'],
          ['Deny reading any file.', 'disallow'],
          ['Ask the owner before reading any file.', 'ask'],
        ]) {
          const result = await gate({ userMessage: 'Read the local fixture.txt file.', preference: { text }, call: proposedCall('read', { filePath: 'fixture.txt' }) });
          if (result.verdict !== expected) throw new Error('The local model did not return the expected diagnostic decision. Run xor install to verify setup, then retry xor debug.');
        }
        record('PASS', 'Native decisions', 'approve, deny, and ask. These smoke checks do not establish model qualification.');
      } catch (error) {
        record('FAIL', 'Native decisions', error.message);
      } finally {
        gate.dispose();
      }
    } else {
      record('SKIP', 'Native decisions', 'Repair the pinned model check first.');
    }
    if (version && installed && model) {
      check('OpenCode integration', () => {
        const report = JSON.parse(run(process.execPath, [path.join(__dirname, 'debug-probe.mjs'), JSON.stringify({ entry, root, modelRoot, command, version })], root, env));
        if (!report.ok) throw new Error(report.reason || 'The isolated action check failed.');
        return report.detail;
      });
    } else {
      record('SKIP', 'OpenCode integration', 'Correct the required checks above, then run xor debug again.');
    }
    check('Pet settings', () => {
      const loaded = readConfig(options.configRoot);
      if (loaded.error) throw new Error(`Correct ${loaded.file}: ${loaded.error.message}`);
      if (!loaded.config.pet.enabled) {
        record('SKIP', 'Pet runtime', 'Pet mode is off.');
        return 'off';
      }
      const petDir = path.join(pluginsDir, 'xor', 'pet');
      if (!(process.platform === 'darwin' ? nativePetReady(petDir) : electronReady(petDir))) throw new Error('The enabled Pet runtime is missing. Run xor install.');
      return `on, ${loaded.config.pet.scale * 100}%`;
    });
    return { ok: rows.every((row) => row.status !== 'FAIL'), checks: rows };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { runDiagnostics };
