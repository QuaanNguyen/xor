#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { verify } = require('./verify-checker-data');
const { coverage } = require('../xor/prototype/checker-data');

const digest = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function prepare(datasetDir, humanDecisionsPath, outputDir, options = {}) {
  datasetDir = path.resolve(datasetDir);
  humanDecisionsPath = path.resolve(humanDecisionsPath);
  outputDir = path.resolve(outputDir);

  if (fs.existsSync(outputDir)) {
    throw new Error('Destination directory already exists: ' + outputDir);
  }

  const proposalsFile = path.join(datasetDir, 'proposals.jsonl');
  const reviewPacketFile = path.join(datasetDir, 'review-packet.json');
  const manifestFile = path.join(datasetDir, 'manifest.json');

  const proposals = fs.readFileSync(proposalsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const packet = JSON.parse(fs.readFileSync(reviewPacketFile, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const humanRecord = JSON.parse(fs.readFileSync(humanDecisionsPath, 'utf8'));

  const reviewFiles = fs.readdirSync(datasetDir).filter((file) => /^review-(?!packet).*\.json$/.test(file)).sort();
  const reviews = reviewFiles.map((file) => JSON.parse(fs.readFileSync(path.join(datasetDir, file), 'utf8')));
  const inventoryFile = options.inventoryFile || path.join(__dirname, '../docs/checker-tool-inventory.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const verification = verify(inventoryFile, datasetDir, reviewFiles.map((file) => path.join(datasetDir, file)));
  assert.equal(verification.integrity, 'passed', 'Preparation integrity failed: ' + verification.failures.join('; '));
  assert.equal(verification.currentProductionBuilderMatches, true, 'Preparation requires current exact production inputs');
  assert.equal(reviews.length, 2, 'Preparation requires exactly two independent reviews');
  assert.notEqual(reviews[0].modelFamily, reviews[1].modelFamily, 'Preparation requires independent reviewer families');
  const scope = options.scope || inventory.tools.filter((tool) => tool.schemaVerified && tool.inputSchema).map((tool) => `${tool.agent}:${tool.name}`);
  assert.ok(Array.isArray(scope) && scope.length && new Set(scope).size === scope.length, 'Specify a nonempty unique checked tool scope');
  const scopedTools = inventory.tools.filter((tool) => scope.includes(`${tool.agent}:${tool.name}`));
  assert.equal(scopedTools.length, scope.length, 'Every scoped tool must exist in the frozen inventory');
  assert.ok(scopedTools.every((tool) => tool.schemaVerified && tool.inputSchema), 'Do not invent contracts for unverified scoped tools');
  const selectedFamilies = new Set(proposals.filter((row) => scope.includes(`${row.agent}:${row.tool}`)).map((row) => row.family));
  const selected = proposals.filter((row) => selectedFamilies.has(row.family));
  assert.ok(selected.every((row) => scope.includes(`${row.agent}:${row.tool}`)), 'Include every tool of a selected family in the explicit scope');
  for (const proposal of selected) {
    const request = packet.requests.find((row) => row.id === proposal.id);
    assert.ok(reviews.every((review) => review.decisions.some((decision) => decision.id === proposal.id && decision.inputHash === request?.inputHash && ['approve', 'deny', 'ask', 'abstain'].includes(decision.verdict))), 'Every selected case requires both exact-input independent reviews before human adjudication');
  }
  const humanLabels = humanRecord.human?.labels || [];
  if (humanLabels.length) {
    assert.equal(humanRecord.human.inputHashes?.['proposals.jsonl'], digest(fs.readFileSync(proposalsFile, 'utf8')), 'Human decisions name different proposal bytes');
    assert.equal(humanRecord.human.inputHashes?.['manifest.json'], digest(fs.readFileSync(manifestFile, 'utf8')), 'Human decisions name a different source manifest');
    assert.ok(humanRecord.human.evidence?.conversationId && humanRecord.human.evidence?.exactReply, 'Human decisions require their recorded owner reply');
    assert.equal(new Set(humanLabels.map((label) => label.id)).size, humanLabels.length, 'Duplicate human case decisions');
    for (const label of humanLabels) {
      const proposal = proposals.find((row) => row.id === label.id);
      const request = packet.requests.find((row) => row.id === label.id);
      assert.ok(proposal && request && label.humanVerified === true && ['approve', 'deny', 'ask'].includes(label.verdict), 'Invalid case-bound human decision');
      assert.ok(label.inputHash === request.inputHash && label.family === proposal.family && label.tool === proposal.tool, 'Human decision does not match the exact case');
    }
  }

  const r1Map = new Map(reviews[0].decisions.map((d) => [d.id, d.verdict]));
  const r2Map = new Map(reviews[1].decisions.map((d) => [d.id, d.verdict]));
  const humanMap = new Map((humanRecord.human?.labels || []).map((l) => [l.id, l.verdict]));
  const requestMap = new Map(packet.requests.map((r) => [r.id, r]));

  const resolved = [];
  for (const proposal of selected) {
    const request = requestMap.get(proposal.id);
    if (!request) throw new Error('Missing request packet for proposal ' + proposal.id);

    const hv = humanMap.get(proposal.id);
    const v1 = r1Map.get(proposal.id);
    const v2 = r2Map.get(proposal.id);

    let verdict = null;
    let resolutionSource = null;

    if (hv) {
      verdict = hv;
      resolutionSource = 'human_adjudication';
    } else if (v1 && v2 && v1 === v2 && ['approve', 'deny', 'ask'].includes(v1)) {
      verdict = v1;
      resolutionSource = 'reviewer_agreement';
    } else {
      throw new Error('Unresolved verdict for proposal ' + proposal.id);
    }

    resolved.push({
      proposal,
      request,
      verdict,
      resolutionSource,
      trainingExample: {
        query: request.query,
        tools: request.tools,
        answers: [{ name: verdict, arguments: {} }],
      },
      scenarioExample: {
        id: proposal.id,
        family: proposal.family,
        agent: proposal.agent,
        split: proposal.split,
        tool: proposal.tool,
        args: proposal.args,
        preference: proposal.preference,
        userMessage: proposal.userMessage,
        verdict,
        inputHash: proposal.inputHash,
        resolutionSource,
        ...(proposal.topic ? { topic: proposal.topic } : {}),
      },
    });
  }

  const scopedCoverage = coverage({ tools: scopedTools }, resolved.map((item) => ({ ...item.proposal, verdict: item.verdict })));
  assert.equal(scopedCoverage.complete, true, 'Scoped reviewed coverage incomplete: ' + scopedCoverage.missing.join('; '));
  fs.mkdirSync(outputDir, { recursive: true });

  const splits = { train: [], validation: [], test: [] };
  for (const item of resolved) {
    splits[item.proposal.split].push(item);
  }

  const writeJsonl = (filePath, items) => {
    const text = items.map((i) => JSON.stringify(i)).join('\n') + '\n';
    fs.writeFileSync(filePath, text, { mode: 0o444 });
    return digest(text);
  };

  const hashes = {};
  hashes['train-answers.jsonl'] = writeJsonl(
    path.join(outputDir, 'train-answers.jsonl'),
    splits.train.map((i) => i.trainingExample)
  );
  hashes['validation-answers.jsonl'] = writeJsonl(
    path.join(outputDir, 'validation-answers.jsonl'),
    splits.validation.map((i) => i.trainingExample)
  );
  hashes['test-answers.jsonl'] = writeJsonl(
    path.join(outputDir, 'test-answers.jsonl'),
    splits.test.map((i) => i.trainingExample)
  );

  hashes['train-scenarios.jsonl'] = writeJsonl(
    path.join(outputDir, 'train-scenarios.jsonl'),
    splits.train.map((i) => i.scenarioExample)
  );
  hashes['validation-scenarios.jsonl'] = writeJsonl(
    path.join(outputDir, 'validation-scenarios.jsonl'),
    splits.validation.map((i) => i.scenarioExample)
  );
  hashes['test-scenarios.jsonl'] = writeJsonl(
    path.join(outputDir, 'test-scenarios.jsonl'),
    splits.test.map((i) => i.scenarioExample)
  );
  for (const split of ['validation', 'test']) {
    const file = `${split}-requests.jsonl`;
    hashes[file] = writeJsonl(path.join(outputDir, file), splits[split].map((item) => ({ ...item.request, family: item.proposal.family, agent: item.proposal.agent, tool: item.proposal.tool, expected: item.verdict })));
  }

  hashes['all-answers.jsonl'] = writeJsonl(
    path.join(outputDir, 'all-answers.jsonl'),
    resolved.map((i) => i.trainingExample)
  );
  hashes['all-scenarios.jsonl'] = writeJsonl(
    path.join(outputDir, 'all-scenarios.jsonl'),
    resolved.map((i) => i.scenarioExample)
  );

  fs.copyFileSync(proposalsFile, path.join(outputDir, 'proposals.jsonl'));
  fs.copyFileSync(reviewPacketFile, path.join(outputDir, 'review-packet.json'));
  for (const file of reviewFiles) {
    fs.copyFileSync(path.join(datasetDir, file), path.join(outputDir, file));
  }
  fs.copyFileSync(humanDecisionsPath, path.join(outputDir, 'human-critical-decisions.json'));

  const exportManifest = {
    purpose: 'Scoped reviewed fitting inputs; not full-product training or promotion qualification',
    scope,
    trainingEligible: false,
    qualifiedExport: false,
    promotionAllowed: false,
    fullProductQualified: false,
    sourceVerification: { integrity: verification.integrity, hashes: verification.hashes },
    sourceFilesSha256: Object.fromEntries([
      ['manifest.json', manifestFile],
      ['proposals.jsonl', proposalsFile],
      ['review-packet.json', reviewPacketFile],
      ['human-decisions.json', humanDecisionsPath],
      ...reviewFiles.map((file) => [file, path.join(datasetDir, file)]),
    ].map(([name, file]) => [name, digest(fs.readFileSync(file, 'utf8'))])),
    scopedCoverage,
    requestFormatVersion: manifest.requestFormatVersion,
    cases: resolved.length,
    splits: {
      train: splits.train.length,
      validation: splits.validation.length,
      test: splits.test.length,
    },
    verdicts: {
      approve: resolved.filter((r) => r.verdict === 'approve').length,
      deny: resolved.filter((r) => r.verdict === 'deny').length,
      ask: resolved.filter((r) => r.verdict === 'ask').length,
    },
    resolutions: {
      reviewerAgreement: resolved.filter((r) => r.resolutionSource === 'reviewer_agreement').length,
      humanAdjudication: resolved.filter((r) => r.resolutionSource === 'human_adjudication').length,
    },
    hashes,
    sourceSnapshot: datasetDir,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(outputDir, 'export-manifest.json'),
    JSON.stringify(exportManifest, null, 2) + '\n',
    { mode: 0o444 }
  );

  return exportManifest;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const datasetDir = args[0] || 'xor/prototype/output/checker-integrated-2026-10-22';
  const humanPath = args[1] || 'docs/experiments/human-critical-decisions-2026-10-23.json';
  const outputDir = args[2] || 'xor/prototype/output/v3-integrated-2026-10-23';

  try {
    const report = prepare(datasetDir, humanPath, outputDir);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare };
