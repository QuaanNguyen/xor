'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CONFIG_SCHEMA_VERSION, configPath, defaultConfigRoot, writeConfig } = require('../xor/lib/config');
const {
  DEFAULT_PREFERENCE,
  preferencePath,
  readJsonObject,
  retiredProtocolPaths,
  validatePreference,
  withDefaults,
} = require('../xor/lib/preference');

function retiredOwnerPolicyPath() {
  if (process.env.XOR_OWNER_CONFIG) return path.join(process.env.XOR_OWNER_CONFIG, 'policy.json');
  const xorDir = path.join(os.homedir(), '.config', 'opencode', 'xor');
  return path.join(xorDir, 'policy.json');
}

function readOrThrow(file, label) {
  const source = readJsonObject(file);
  if (source.error) throw new Error(`${label} at ${file} is unreadable (${source.error.message}). Fix or remove it, then run xor migrate again. Nothing was changed.`);
  return source;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function mergeDoneCriteria(groups) {
  const criteria = new Map();
  for (const group of groups) {
    for (const criterion of group) {
      const previous = criteria.get(criterion.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(criterion)) throw new Error(`Completion checks have conflicting definitions for '${criterion.id}'. Nothing was changed.`);
      criteria.set(criterion.id, criterion);
    }
  }
  return [...criteria.values()];
}

function retiredDoneCriteria(protocols) {
  const groups = protocols.filter(({ source }) => source.exists).map(({ file, source }) => {
    const criteria = source.value.done_criteria;
    if (criteria === undefined) return [];
    if (!Array.isArray(criteria)) throw new Error(`done_criteria in ${file} must be an array. Nothing was changed.`);
    return criteria;
  });
  return mergeDoneCriteria(groups);
}

function preservedInstructions(sources) {
  const labels = { task: 'Project purpose', read_paths: 'Read only these path patterns', write_paths: 'Write only these path patterns', command_allowlist: 'Permit these exact commands', deny_commands: 'Deny these commands', allow_tools: 'Permit these tools', egress: 'Permit network access only to these destinations', protected_paths: 'Never modify these paths', read_protected_paths: 'Never read these paths' };
  return sources.filter(({ source }) => source.exists).flatMap(({ source }) => Object.entries(source.value).filter(([key]) => key !== 'done_criteria').map(([key, value]) => `${labels[key] || `Preserved owner setting ${key}`}: ${typeof value === 'string' ? value : JSON.stringify(value)}.`)).join('\n');
}

function migratePreference(opts = {}) {
  const workdir = opts.workdir || process.cwd();
  const configRoot = opts.configRoot || defaultConfigRoot();
  const ownerPolicy = opts.ownerPolicyPath || retiredOwnerPolicyPath();

  const preferenceFile = preferencePath(workdir);
  const preference = readOrThrow(preferenceFile, 'The Preference');
  const globalFile = path.join(configRoot, 'preference.json');
  const globalPreference = readOrThrow(globalFile, 'The global Preference');
  if (globalPreference.exists) {
    try { validatePreference(globalPreference.value); } catch (error) {
      throw new Error(`The global Preference at ${globalFile} is invalid (${error.message}). Nothing was changed.`);
    }
  }
  const sourcePreference = preference;
  if (sourcePreference.exists) {
    try {
      validatePreference(sourcePreference.value);
    } catch (error) {
      throw new Error(`The Preference at ${preferenceFile} is invalid (${error.message}). Nothing was changed.`);
    }
  }
  const protocols = retiredProtocolPaths(workdir).map((file) => ({ file, source: readOrThrow(file, 'The retired Protocol') }));
  const doneCriteria = retiredDoneCriteria(protocols);
  const config = readOrThrow(configPath(configRoot), 'The xor configuration');
  const owner = readOrThrow(ownerPolicy, 'The retired owner policy');
  if (config.exists && config.value.pet?.scale !== undefined && (!Number.isFinite(config.value.pet.scale) || config.value.pet.scale <= 0)) throw new Error('The saved pet size must be positive and finite. Nothing was changed.');
  if (config.exists && config.value.pet?.enabled !== undefined && typeof config.value.pet.enabled !== 'boolean') throw new Error('The saved pet enablement must be a boolean. Nothing was changed.');

  const report = { preferenceFile, wrotePreference: false, carriedDoneCriteria: 0, removed: [], configFile: null };

  const current = sourcePreference.exists ? sourcePreference.value : globalPreference.exists ? globalPreference.value : { ...DEFAULT_PREFERENCE };
  const next = withDefaults(current);
  const previousConfig = { ...config, value: Object.fromEntries(Object.entries(config.value || {}).filter(([key]) => !['schema_version', 'pet'].includes(key))) };
  const instructions = preservedInstructions([...protocols, { source: owner }, { source: previousConfig }]);
  if (instructions) next.text += '\n\nContinue to enforce these previous owner instructions:\n' + instructions;
  if ((!sourcePreference.exists || !next.done_criteria.length) && doneCriteria.length) {
    const previousCount = next.done_criteria.length;
    next.done_criteria = mergeDoneCriteria([next.done_criteria, doneCriteria]);
    report.carriedDoneCriteria = next.done_criteria.length - previousCount;
  }
  const needsFolderPreference = preference.exists || protocols.some(({ source }) => source.exists) || Boolean(instructions);
  if (needsFolderPreference && (!preference.exists || report.carriedDoneCriteria || JSON.stringify(preference.value) !== JSON.stringify(next))) {
    writeJson(preferenceFile, next);
    report.wrotePreference = true;
  }

  if (!needsFolderPreference && globalPreference.exists) report.preferenceFile = globalFile;

  for (const { file, source } of protocols) {
    if (!source.exists) continue;
    fs.rmSync(file, { force: true });
    report.removed.push(file);
  }

  if (config.exists) {
    const savedScale = config.value.pet?.scale;
    const scale = Number.isFinite(savedScale) && savedScale > 0 ? savedScale : 1;
    const petOnly = { schema_version: CONFIG_SCHEMA_VERSION, pet: { enabled: config.value.pet?.enabled === true, scale } };
    if (JSON.stringify(config.value) !== JSON.stringify(petOnly)) {
      report.configFile = writeConfig(petOnly, configRoot);
    }
  }

  if (fs.existsSync(ownerPolicy)) {
    fs.rmSync(ownerPolicy, { force: true });
    report.removed.push(ownerPolicy);
  }

  return report;
}

function migrate(opts = {}) {
  const result = migratePreference(opts);
  return result;
}

module.exports = { migrate, retiredOwnerPolicyPath };
