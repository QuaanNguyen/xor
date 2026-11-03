'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { audit, auditSuccessor } = require('../../scripts/audit-policy-replacement');

const repository = path.resolve(__dirname, '../..');
const relative = 'docs/experiments/model-policy-successor-2026-11-03.json';

function changedReceipt(t, mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-policy-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = JSON.parse(fs.readFileSync(path.join(repository, relative), 'utf8'));
  mutate(receipt);
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), JSON.stringify(receipt));
  return root;
}

test('reviewed coverage does not qualify model-only replacement despite repaired settings contrasts', () => {
  const result = audit(repository);
  assert.equal(result.counterexamples.length, 5);
  assert.equal(result.runtimeReplacementQualified, false);
  assert.equal(result.successorData.qualifiedExport, false);
  assert.deepEqual(result.successorData.repairedCoverage.counts, { approve: 1, deny: 1, ask: 1 });
  assert.ok(result.runtimeChecks.every((check) => !check.replacementQualified));
});

test('the audit refuses a qualification claim without the required evidence', (t) => {
  assert.throws(() => auditSuccessor(changedReceipt(t, (receipt) => { receipt.qualifiedExport = true; })), /Do not infer qualifiedExport/);
});

test('the audit rejects incomplete or mismatched exact-input independent reviews', (t) => {
  assert.throws(() => auditSuccessor(changedReceipt(t, (receipt) => { receipt.cases[0].decisions[0].inputHash = '0'.repeat(64); })));
  assert.throws(() => auditSuccessor(changedReceipt(t, (receipt) => { receipt.repairedCoverage.counts.ask = 0; })));
});
