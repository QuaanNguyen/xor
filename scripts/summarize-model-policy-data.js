'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('./audit-model-policy-data');
const { digest, requestFor, reviewedRows } = require('../xor/prototype/checker-data');
const { POLICY_SHAPES, MUTATION_SHAPES, RUNTIME_GAPS } = require('../xor/prototype/model-policy-study');

function summarize(files, semanticExclusions = []) {
  if (!files.length) throw new Error('Pass at least one completed policy audit report');
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const reports = files.map(read);
  const candidates = [];
  const snapshots = new Set();
  for (const report of reports) {
    if (snapshots.has(report.snapshot)) throw new Error('Duplicate snapshot report');
    snapshots.add(report.snapshot);
    const current = audit(report.study, report.snapshot, report.mode);
    if (digest(current) !== digest(report) || report.integrity.integrity !== 'passed' || !report.integrity.currentProductionBuilderMatches || report.integrity.reviewers.some((review) => review.decisions !== report.integrity.cases)) throw new Error('Audit is stale, incomplete or inconsistent; refresh it before summarizing');
    const rows = fs.readFileSync(path.join(report.snapshot, 'proposals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const reviews = ['gemma4-31b-it', 'glm-5-3-flash'].map((model) => read(path.join(report.snapshot, `review-${model}.json`)));
    const excluded = new Set([...report.policy.unmatchedFamilies, ...report.semanticReviewFlags.map((flag) => flag.family)]);
    for (const row of reviewedRows(rows, reviews).accepted.filter((row) => !excluded.has(row.family))) candidates.push({ ...row, source: report.snapshot, inputHash: digest(requestFor(row)) });
  }
  const seen = new Map();
  const duplicateFamilies = new Set();
  for (const row of candidates) {
    const previous = seen.get(row.inputHash);
    if (previous) {
      duplicateFamilies.add(previous.family);
      duplicateFamilies.add(row.family);
    } else seen.set(row.inputHash, row);
  }
  if (!Array.isArray(semanticExclusions)) throw new Error('Semantic exclusions must be an array');
  const excludedFamilies = new Set();
  for (const exclusion of semanticExclusions) {
    if (!exclusion || Object.keys(exclusion).sort().join(',') !== 'family,inputHashes,proposalsSha256,reason,snapshot' || typeof exclusion.reason !== 'string' || exclusion.reason.trim().length < 20) throw new Error('Semantic exclusions need exact source-bound fields and a concrete reason');
    const report = reports.find((entry) => entry.snapshot === exclusion.snapshot);
    if (!report || report.integrity.hashes.proposals !== exclusion.proposalsSha256) throw new Error('Semantic exclusion source is missing or stale');
    const siblings = candidates.filter((row) => row.source === exclusion.snapshot && row.family === exclusion.family);
    if (!siblings.length || excludedFamilies.has(exclusion.family)) throw new Error('Semantic exclusion family is missing or duplicated');
    if (!Array.isArray(exclusion.inputHashes) || digest([...exclusion.inputHashes].sort()) !== digest(siblings.map((row) => row.inputHash).sort())) throw new Error('Semantic exclusion must bind every complete family input');
    excludedFamilies.add(exclusion.family);
  }
  const selected = candidates.filter((row) => !duplicateFamilies.has(row.family) && !excludedFamilies.has(row.family));
  const shapes = [...POLICY_SHAPES, ...MUTATION_SHAPES];
  const policies = [...new Set(shapes.map((shape) => shape.policy))];
  const shapePolicy = new Map(shapes.map((shape) => [shape.topic, shape.policy]));
  const counts = (matches) => Object.fromEntries(['approve', 'deny', 'ask'].map((verdict) => [verdict, matches.filter((row) => row.verdict === verdict).length]));
  const coverage = Object.fromEntries(policies.map((policy) => [policy, Object.fromEntries(['train', 'validation', 'test'].map((split) => [split, counts(selected.filter((row) => shapePolicy.get(row.topic) === policy && row.split === split))]))]));
  const shapeMissing = [];
  for (const shape of shapes) for (const split of ['train', 'validation', 'test']) for (const verdict of ['approve', 'deny', 'ask']) {
    if (!selected.some((row) => row.topic === shape.topic && row.split === split && row.verdict === verdict)) shapeMissing.push(`${shape.topic}:${split}:${verdict}`);
  }
  const cases = reports.reduce((sum, report) => sum + report.integrity.cases, 0);
  return {
    version: 1,
    ...(semanticExclusions.length ? { semanticExclusions } : {}),
    sources: files.map((file, index) => ({ report: path.resolve(file), reportSha256: digest(fs.readFileSync(file, 'utf8')), snapshot: reports[index].snapshot, proposalsSha256: reports[index].integrity.hashes.proposals })),
    cases,
    reviewerAgreedCases: reports.reduce((sum, report) => sum + report.integrity.accepted, 0),
    selectedCases: selected.length,
    excludedCases: cases - selected.length,
    exactDuplicateFamilies: [...duplicateFamilies],
    policyCoverage: coverage,
    policyGroupCoverageComplete: Object.values(coverage).every((splits) => Object.values(splits).every((verdicts) => Object.values(verdicts).every((count) => count > 0))),
    shapeCoverageMissing: shapeMissing,
    permissiveCoverageComplete: reports.some((report) => report.permissive?.complete === true),
    directMutationCoverageComplete: reports.some((report) => report.mutations?.complete === true),
    runtimeGaps: RUNTIME_GAPS,
    selected: selected.map((row) => ({ id: row.id, family: row.family, split: row.split, topic: row.topic || null, inputHash: row.inputHash, verdict: row.verdict, snapshot: row.source })),
    trainingEligible: false,
    blindEvaluationVerified: false,
    runtimeReplacementVerified: false,
    generatedCommandsExecuted: false,
  };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(summarize(process.argv.slice(2)), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { summarize };
