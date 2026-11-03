'use strict';

const path = require('node:path');
const { readSettingsFile } = require('./settings-file');

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 120000;

function readGateSettings(workdir) {
  const file = path.join(workdir, '.xor', 'settings.json');
  const contents = readSettingsFile(file);
  if (contents === null) return { timeoutMs: DEFAULT_TIMEOUT_MS };
  const settings = JSON.parse(contents);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${file} must contain a settings object`);
  for (const key of Object.keys(settings)) {
    if (key !== 'gate_timeout_ms') throw new Error(`Unknown setting ${key} in ${file}`);
  }
  const timeoutMs = Object.hasOwn(settings, 'gate_timeout_ms') ? settings.gate_timeout_ms : DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`gate_timeout_ms in ${file} must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }
  return { timeoutMs };
}

module.exports = { readGateSettings };
