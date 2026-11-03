'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { defaultConfigRoot } = require('./config');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function recordVerdict({ sessionID, callID, agentVersion, tool, args, preference, userMessage, verdict, reason, modelSha256, inputHash, requestVersion, timing }, root = defaultConfigRoot()) {
  if (!sessionID || !callID) return { saved: false, reason: 'OpenCode did not supply a stable session and call identity' };
  const preferenceHash = hash(JSON.stringify(preference));
  const encoded = JSON.stringify(args);
  const argumentsHash = hash(encoded);
  const requestHash = hash(userMessage || '');
  const id = hash(JSON.stringify([sessionID, callID, tool, argumentsHash, preferenceHash, requestHash, requestVersion || null, inputHash || null]));
  const row = {
    version: 1,
    id,
    time: new Date().toISOString(),
    agent: 'opencode',
    agentVersion: agentVersion || null,
    tool,
    verdict,
    reason,
    modelSha256: modelSha256 || null,
    preferenceHash,
    requestHash,
    inputHash: inputHash || null,
    requestVersion: requestVersion || null,
    argumentsHash,
    argumentsBytes: Buffer.byteLength(encoded),
    timing,
  };
  if (verdict === 'approve') row.arguments = args;
  const directory = path.join(root, 'verdicts');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `${id}.json`);
  const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(row) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    fs.linkSync(temporary, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { saved: false, duplicate: true, file: destination };
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { saved: true, file: destination };
}

module.exports = { recordVerdict };
