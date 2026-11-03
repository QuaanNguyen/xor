'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_DIRECTORY = '.audit/policy-successor-2026-11-03';
const TOPIC = 'owner-authorized-preference-change-shell';
const VERDICTS = ['approve', 'deny', 'ask'];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function buildReceipt(directory, repositoryRoot) {
  const read = (relative) => JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));
  const audit = read('settings-shell-explicit-audit.json');
  const packet = read('settings-shell-explicit-review/review-packet.json');
  const manifest = read('settings-shell-explicit-review/manifest.json');
  const successor = read('dataset-index-successor.json');
  const predecessorPath = `${SOURCE_DIRECTORY}/predecessor-index.json`;
  const predecessorBytes = fs.readFileSync(path.join(directory, 'predecessor-index.json'));
  const predecessor = JSON.parse(predecessorBytes);
  const proposals = fs.readFileSync(path.join(directory, 'settings-shell-explicit-review/proposals.jsonl'), 'utf8');
  const rows = proposals.trim().split('\n').map(JSON.parse);
  const { digest, requestFor, REVIEW_INSTRUCTION_HASH } = require(path.join(repositoryRoot, 'xor/prototype/checker-data.js'));
  assert.equal(sha256(proposals), manifest.proposalsSha256);
  assert.equal(digest(packet.requests), manifest.requestsSha256);
  assert.equal(audit.integrity.integrity, 'passed');
  assert.equal(audit.integrity.currentProductionBuilderMatches, true);
  assert.equal(audit.semanticReviewFlags.length, 0);
  assert.equal(audit.policy.complete, true);
  const reviewModels = [{ model: 'gemma4-31b-it', family: 'gemma' }, { model: 'glm-5-3-flash', family: 'glm' }];
  const reviews = reviewModels.map(({ model, family }) => {
    const review = read(`settings-shell-explicit-review/review-${model}.json`);
    assert.equal(review.model, model);
    assert.equal(review.modelFamily, family);
    assert.equal(review.instructionHash, REVIEW_INSTRUCTION_HASH);
    assert.equal(review.inputHash, manifest.requestsSha256);
    assert.equal(review.status, 'complete');
    assert.equal(review.decisions.length, rows.length);
    return review;
  });
  const cases = rows.map((row) => {
    const request = packet.requests.find((entry) => entry.id === row.id);
    assert.ok(request);
    assert.equal(digest(requestFor(row)), request.inputHash);
    const decisions = reviews.map((review) => {
      const decision = review.decisions.find((entry) => entry.id === row.id);
      assert.equal(decision?.inputHash, request.inputHash);
      assert.ok(VERDICTS.includes(decision.verdict));
      return { model: review.model, modelFamily: review.modelFamily, inputHash: decision.inputHash, verdict: decision.verdict };
    });
    assert.equal(new Set(decisions.map((decision) => decision.verdict)).size, 1);
    return { id: row.id, family: row.family, split: row.split, topic: row.topic || null, inputHash: request.inputHash, agreedVerdict: decisions[0].verdict, decisions };
  });
  const targetCases = cases.filter((row) => row.topic === TOPIC && row.split === 'train');
  assert.equal(targetCases.length, 3);
  assert.deepEqual(targetCases.map((row) => row.agreedVerdict).sort(), [...VERDICTS].sort());
  assert.deepEqual(successor.semanticExclusions, predecessor.semanticExclusions);
  const priorRows = new Map(predecessor.selected.map((row) => [row.id, row]));
  for (const previous of predecessor.selected) assert.deepEqual(successor.selected.find((row) => row.id === previous.id), previous);
  const added = successor.selected.filter((row) => !priorRows.has(row.id));
  assert.equal(added.length, cases.length);
  assert.deepEqual(added.map((row) => row.id).sort(), cases.map((row) => row.id).sort());
  assert.deepEqual(successor.shapeCoverageMissing, []);
  assert.equal(successor.trainingEligible, false);
  assert.equal(successor.blindEvaluationVerified, false);
  assert.equal(successor.runtimeReplacementVerified, false);
  const files = ['predecessor-index.json', 'settings-shell-explicit-config.json', 'settings-shell-explicit-study/plan.json', 'settings-shell-explicit-study/state.json', 'settings-shell-explicit-review/manifest.json', 'settings-shell-explicit-review/proposals.jsonl', 'settings-shell-explicit-review/review-packet.json', ...reviewModels.map(({ model }) => `settings-shell-explicit-review/review-${model}.json`), 'settings-shell-explicit-audit.json', 'dataset-index-successor.json'];
  return {
    version: 1,
    generatedBy: 'node scripts/build-policy-successor-receipt.js .audit/policy-successor-2026-11-03',
    purpose: 'Case-bound independent review evidence for the previously missing settings-shell training contrast',
    sourceDirectory: SOURCE_DIRECTORY,
    predecessor: { path: predecessorPath, sha256: sha256(predecessorBytes), cases: predecessor.cases, selectedCases: predecessor.selectedCases, excludedCases: predecessor.excludedCases, shapeCoverageMissing: predecessor.shapeCoverageMissing, semanticExclusions: predecessor.semanticExclusions },
    successor: { path: `${SOURCE_DIRECTORY}/dataset-index-successor.json`, sha256: sha256(fs.readFileSync(path.join(directory, 'dataset-index-successor.json'))), cases: successor.cases, selectedCases: successor.selectedCases, excludedCases: successor.excludedCases, shapeCoverageMissing: successor.shapeCoverageMissing, priorSelectedCasesPreserved: predecessor.selected.length, priorSemanticExclusionsPreserved: predecessor.semanticExclusions.length, addedCases: added.length },
    repairedCoverage: { topic: TOPIC, split: 'train', counts: Object.fromEntries(VERDICTS.map((verdict) => [verdict, targetCases.filter((row) => row.agreedVerdict === verdict).length])) },
    cases,
    reviewers: reviews.map((review) => ({ model: review.model, modelFamily: review.modelFamily, instructionHash: review.instructionHash, inputHash: review.inputHash, responses: review.responses })),
    sources: files.map((file) => ({ path: `${SOURCE_DIRECTORY}/${file}`, sha256: sha256(fs.readFileSync(path.join(directory, file))) })),
    trainingEligible: false,
    qualifiedExport: false,
    humanVerified: false,
    freshBlindEvaluationQualified: false,
    runtimeReplacementQualified: false,
    modelTrainingPerformed: false,
    packagedModelChanged: false,
    generatedCommandsExecuted: false,
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length <= 2, 'Usage: node scripts/build-policy-successor-receipt.js [local-evidence-directory] [repository-root]');
    const root = path.resolve(args[1] || path.join(__dirname, '..'));
    process.stdout.write(JSON.stringify(buildReceipt(path.resolve(args[0] || path.join(root, SOURCE_DIRECTORY)), root), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { buildReceipt };
