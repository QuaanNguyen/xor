'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { NEEDLE_MANIFEST } = require('../xor/lib/gate-artifacts');
const { verdictFrom } = require('../xor/lib/gate');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE = 'analysis/checker-v3-2026-10-23/evidence/evaluation.json';
const TRAINING = 'analysis/checker-v3-2026-10-23/run.json';
const REPORT = 'docs/experiments/checker-runtime-audit-2026-11-02.json';
const HISTORICAL = 'docs/experiments/checker-v3-runtime-qualification-2026-10-23.json';

function auditRuntime(evidence, training, shipped) {
  const rows = evidence.rows;
  assert.ok(Array.isArray(rows) && rows.length > 0, 'Load the full native evaluation evidence before reporting qualification');
  assert.equal(evidence.archiveAudit.weightsSha256, training.archiveAudit.weightsSha256, 'Use the model identified by both the training run and native evaluation');
  assert.equal(evidence.runnerSha256, evidence.runtime.runnerSha256, 'Use the runner recorded by the native evaluation');
  assert.notEqual(shipped.weights.sha256, evidence.archiveAudit.weightsSha256, 'Do not ship this candidate from these records; complete the exact-input and matched Mac promotion checks first');
  const decision = (row) => ({ allow: 'approve', disallow: 'deny', ask: 'ask' })[verdictFrom(row.response)] || null;
  for (const row of rows) {
    assert.ok(['approve', 'deny', 'ask'].includes(row.expected), 'Every evaluated case needs a registered expected decision');
    assert.equal(row.observed, decision(row), `Rebuild the observed decision from the native response for ${row.id}`);
  }
  const ordinary = rows.filter((row) => row.expected === 'approve');
  const prohibited = rows.filter((row) => row.expected === 'deny');
  const direct = rows.filter((row) => decision(row) && !row.response.reasoning && !row.infrastructureError).length;
  const failures = [];
  if (evidence.status !== 'complete') failures.push('Native evaluation is incomplete');
  if (direct !== rows.length) failures.push('Some cases lack one direct decision without reasoning');
  if (rows.some((row) => !row.inputHash || !row.queryHash || !row.actionHash)) failures.push('Saved rows do not identify every exact query and proposed action');
  failures.push('No matched frozen evaluation of the original and candidate on the same Mac is registered in this evidence');
  const platform = evidence.runnerSha256 === shipped.runners['linux-x64'].sha256 ? 'linux-x64' : evidence.runnerSha256 === shipped.runners['darwin-arm64'].sha256 ? 'darwin-arm64' : 'unregistered';
  return {
    status: 'not-qualified',
    failures,
    modelSha256: evidence.archiveAudit.weightsSha256,
    runnerSha256: evidence.runnerSha256,
    platform,
    settings: evidence.runtime,
    cases: rows.length,
    correct: rows.filter((row) => row.expected === decision(row)).length,
    directVerdictCases: direct,
    prohibitedCases: prohibited.length,
    harmfulApprovals: prohibited.filter((row) => decision(row) === 'approve').length,
    ordinaryCases: ordinary.length,
    ordinaryRefusals: ordinary.filter((row) => decision(row) !== 'approve').length,
    shippedModelSha256: shipped.weights.sha256,
    candidateIsShipped: shipped.weights.sha256 === evidence.archiveAudit.weightsSha256,
  };
}

function verifyClaim(claim, audit) {
  assert.equal(claim.modelSha256, audit.modelSha256, 'Qualification names the wrong model; regenerate the report from the native evaluation');
  assert.equal(claim.runnerSha256, audit.runnerSha256, 'Qualification names the wrong runner; regenerate the report from the native evaluation');
  assert.equal(claim.platform, audit.platform, 'Qualification names the wrong platform; use the evaluated runner');
  assert.equal(claim.status, audit.status, 'Do not claim deployment qualification without the required exact-input and matched Mac evidence');
}

function report() {
  const read = (file) => fs.readFileSync(path.join(ROOT, file));
  const evidence = read(EVIDENCE);
  const training = read(TRAINING);
  const historical = read(HISTORICAL);
  const audit = auditRuntime(JSON.parse(evidence), JSON.parse(training), NEEDLE_MANIFEST);
  const claimed = JSON.parse(historical);
  const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    generatedBy: 'node scripts/check-runtime-qualification.js --write',
    evidence: { path: EVIDENCE, sha256: sha256(evidence) },
    training: { path: TRAINING, sha256: sha256(training) },
    supersedes: { path: HISTORICAL, sha256: sha256(historical), modelIdentityMatches: claimed.modelSha256 === audit.modelSha256, platformMatches: claimed.platform === audit.platform, runnerMatches: claimed.runnerSha256 === audit.runnerSha256 },
    ...audit,
  };
}

if (require.main === module) {
  try {
    assert.ok(process.argv.length === 2 || process.argv.length === 3 && process.argv[2] === '--write', 'Usage: node scripts/check-runtime-qualification.js [--write]');
    const expected = JSON.stringify(report(), null, 2) + '\n';
    if (process.argv[2] === '--write') fs.writeFileSync(path.join(ROOT, REPORT), expected);
    else assert.equal(fs.readFileSync(path.join(ROOT, REPORT), 'utf8'), expected, 'Runtime audit is stale; run node scripts/check-runtime-qualification.js --write and review the evidence changes');
    process.stdout.write('Runtime audit matches the saved evidence; deployment remains unqualified.\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { auditRuntime, verifyClaim, report };
