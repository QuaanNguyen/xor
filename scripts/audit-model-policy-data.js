'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { verify } = require('./verify-checker-data');
const { digest, reviewedRows } = require('../xor/prototype/checker-data');
const { matchedPolicyCoverage, permissiveCoverage, mutationCoverage, MUTATION_SHAPES, RUNTIME_GAPS } = require('../xor/prototype/model-policy-study');

function audit(directory, snapshot, mode = 'policy') {
  if (!['policy', 'permissive', 'supplement'].includes(mode)) throw new Error('Unknown policy audit mode');
  const permissive = mode === 'permissive';
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const planned = read(path.join(directory, 'plan.json'));
  const manifest = read(path.join(snapshot, 'manifest.json'));
  if (manifest.planSha256 !== digest(planned)) throw new Error('Snapshot differs from the saved authoring plan');
  if (mode === 'policy') {
    const receipt = read(path.join(directory, 'policy-coverage-plan.json'));
    if (receipt.study.planSha256 !== digest(planned)) throw new Error('Policy receipt differs from the saved authoring plan');
    if (receipt.successorInventorySha256 !== planned.inventorySha256 || digest(receipt.policyTopics) !== digest(planned.config.riskTopics) || digest(receipt.runtimeGaps) !== digest(RUNTIME_GAPS)) throw new Error('Policy receipt metadata differs from the recorded inventory, plan or runtime gaps');
  }
  const reviewers = [{ model: 'gemma4-31b-it', family: 'gemma' }, { model: 'glm-5-3-flash', family: 'glm' }];
  const reviewFiles = reviewers.map(({ model }) => path.join(snapshot, `review-${model}.json`));
  const existing = reviewFiles.filter((file) => fs.existsSync(file));
  for (const { model, family } of reviewers) {
    const file = path.join(snapshot, `review-${model}.json`);
    if (!fs.existsSync(file)) continue;
    const review = read(file);
    if (review.model !== model || review.modelFamily !== family) throw new Error('Policy reviewer identity differs from the required Gemma and GLM pair');
  }
  const integrity = verify(path.join(directory, 'inventory.json'), snapshot, existing);
  const rows = fs.readFileSync(path.join(snapshot, 'proposals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const accepted = integrity.integrity === 'passed' && integrity.currentProductionBuilderMatches && existing.length === 2
    ? reviewedRows(rows, existing.map(read)).accepted
    : [];
  const tasks = new Map(planned.tasks.map((task) => [task.taskId, task]));
  const packet = read(path.join(snapshot, 'review-packet.json'));
  const inputs = new Map(packet.requests.map((request) => [request.id, request.inputHash]));
  const semanticReviewFlags = accepted.filter((row) => tasks.get(row.id)?.condition !== row.verdict).map((row) => ({ id: row.id, family: row.family, inputHash: inputs.get(row.id), intendedCondition: tasks.get(row.id)?.condition, reviewedVerdict: row.verdict, reason: 'Generation intent and independent review differ; inspect semantics without changing the saved verdict.' }));
  const semanticFamilies = new Set(semanticReviewFlags.map((flag) => flag.family));
  const policyAccepted = accepted.filter((row) => !semanticFamilies.has(row.family));
  const policy = matchedPolicyCoverage(planned, rows, policyAccepted);
  const matchedAccepted = policyAccepted.filter((row) => !policy.unmatchedFamilies.includes(row.family));
  const mutations = MUTATION_SHAPES.every((shape) => planned.config.riskTopics.includes(shape.topic));
  return { mode, study: path.resolve(directory), snapshot: path.resolve(snapshot), integrity, semanticReviewFlags, policy, ...(permissive ? { permissive: permissiveCoverage(planned, rows, matchedAccepted) } : {}), ...(mutations ? { mutations: mutationCoverage(rows) } : {}), runtimeGaps: RUNTIME_GAPS, trainingEligible: false, runtimeReplacementVerified: false };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 && !(args.length === 3 && ['--permissive', '--supplement'].includes(args[2]))) throw new Error('Usage: audit-model-policy-data.js <study-directory> <frozen-snapshot> [--permissive|--supplement]');
    const result = audit(args[0], args[1], args[2] ? args[2].slice(2) : 'policy');
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.integrity.integrity === 'failed' ? 1 : 2;
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { audit };
