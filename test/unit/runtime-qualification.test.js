'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { auditRuntime, report, verifyClaim } = require('../../scripts/check-runtime-qualification');
const { NEEDLE_MANIFEST } = require('../../xor/lib/gate-artifacts');
const evidence = require('../../analysis/checker-v3-2026-10-23/evidence/evaluation.json');
const training = require('../../analysis/checker-v3-2026-10-23/run.json');
const historical = require('../../docs/experiments/checker-v3-runtime-qualification-2026-10-23.json');
const current = require('../../docs/experiments/checker-runtime-audit-2026-11-02.json');

test('the saved qualification claim cannot qualify a different model or platform', () => {
  const audit = report();
  assert.throws(() => verifyClaim(historical, audit), /wrong model/);
  assert.throws(() => verifyClaim({ ...historical, modelSha256: audit.modelSha256 }, audit), /wrong runner/);
  assert.throws(() => verifyClaim({ ...audit, platform: historical.platform }, audit), /wrong platform/);
  assert.throws(() => verifyClaim({ ...audit, status: 'go' }, audit), /Do not claim deployment qualification/);
  assert.doesNotThrow(() => verifyClaim(current, audit));
});

test('the current runtime report is derived from complete native evidence', () => {
  assert.deepEqual(current, report(), 'Run node scripts/check-runtime-qualification.js --write after reviewing changed evidence');
});

test('the recorded candidate cannot replace the shipped model without promotion evidence', () => {
  const unqualified = { ...NEEDLE_MANIFEST, weights: { ...NEEDLE_MANIFEST.weights, sha256: evidence.archiveAudit.weightsSha256 } };
  assert.throws(() => auditRuntime(evidence, training, unqualified), /Do not ship this candidate/);
});
