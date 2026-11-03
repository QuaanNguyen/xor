#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verify } = require('./verify-checker-data');
const { summarize } = require('./summarize-model-policy-data');
const { coverage, digest, reviewedRows, validatePartitions, REVIEW_INSTRUCTIONS, REVIEW_INSTRUCTION_HASH } = require('../xor/prototype/checker-data');
const { DEFAULT_PREFERENCE } = require('../xor/lib/preference');
const { GATE_REQUEST_VERSION } = require('../xor/lib/gate');

const SCOPE = Object.freeze(['opencode:shell', 'opencode:read', 'opencode:write', 'opencode:subagent']);
const SPLITS = Object.freeze(['train', 'validation', 'test']);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function resolvedDestination(file) {
  let current = path.resolve(file);
  const suffix = [];
  while (!fs.existsSync(current)) {
    suffix.unshift(path.basename(current));
    const parent = path.dirname(current);
    assert.notEqual(parent, current, 'Destination has no existing ancestor');
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...suffix);
}

function outside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function scopedTools(inventory) {
  return SCOPE.map((key) => {
    const tools = inventory.tools.filter((tool) => `${tool.agent}:${tool.name}` === key);
    assert.equal(tools.length, 1, 'Every scoped tool needs one authoritative contract: ' + key);
    assert.ok(tools[0].schemaVerified === true && tools[0].inputSchema, 'Scoped tool contract is unverified: ' + key);
    return tools[0];
  });
}

function preparePolicy(indexFile, originalSnapshot, inventoryFile, outputDirectory) {
  const output = resolvedDestination(outputDirectory);
  assert.ok(!fs.existsSync(output), 'Preserve existing fitting outputs; choose a new output directory');
  const sources = new Map();
  const capture = (file) => {
    const absolute = path.resolve(file);
    const bytes = fs.readFileSync(absolute);
    const previous = sources.get(absolute);
    assert.ok(!previous || previous.sha256 === sha256(bytes), 'Source changed while preparing: ' + absolute);
    if (!previous) sources.set(absolute, { bytes, sha256: sha256(bytes) });
    return bytes;
  };
  const read = (file) => JSON.parse(capture(file).toString('utf8'));
  const index = read(indexFile);
  assert.ok(Array.isArray(index.sources) && index.sources.length, 'Dataset index needs source reports');
  assert.ok(Array.isArray(index.selected) && index.selected.length, 'Dataset index has no selected cases');
  const inventory = read(inventoryFile);
  const tools = scopedTools(inventory);
  const protectedDirectories = [fs.realpathSync(originalSnapshot)];
  const reports = index.sources.map((source) => {
    const report = read(source.report);
    assert.equal(sha256(capture(source.report)), source.reportSha256, 'Index source report digest changed');
    assert.equal(report.snapshot, source.snapshot, 'Index snapshot differs from its source report');
    assert.equal(report.integrity.hashes.proposals, source.proposalsSha256, 'Index proposal digest differs from its source report');
    protectedDirectories.push(fs.realpathSync(report.study), fs.realpathSync(source.snapshot));
    read(path.join(report.study, 'plan.json'));
    if (report.mode === 'policy') read(path.join(report.study, 'policy-coverage-plan.json'));
    read(path.join(report.study, 'inventory.json'));
    return report;
  });
  for (const directory of protectedDirectories) assert.ok(outside(directory, output), 'Do not write fitting output inside a source snapshot or study');
  for (const file of sources.keys()) assert.notEqual(output, fs.realpathSync(file), 'Do not replace source evidence');

  const fresh = summarize(index.sources.map((source) => source.report), index.semanticExclusions || []);
  assert.equal(digest(index), digest(fresh), 'Dataset index is stale or its exclusions and selections changed');
  assert.equal(index.trainingEligible, false, 'An index cannot grant training qualification');
  assert.equal(index.runtimeReplacementVerified, false, 'An index cannot grant runtime replacement');
  assert.equal(index.blindEvaluationVerified, false, 'An index cannot grant blind qualification');

  const checked = [];
  const snapshot = (directory, sourceInventoryFile, role) => {
    const root = fs.realpathSync(directory);
    const sourceInventory = read(sourceInventoryFile);
    const contracts = scopedTools(sourceInventory);
    for (let position = 0; position < tools.length; position += 1) {
      assert.equal(digest(contracts[position].inputSchema), digest(tools[position].inputSchema), 'Scoped input schema differs from the canonical inventory: ' + SCOPE[position]);
    }
    const files = ['manifest.json', 'proposals.jsonl', 'review-packet.json'];
    const names = fs.readdirSync(root).filter((name) => /^review-(?!packet).*\.json$/.test(name)).sort();
    assert.equal(names.length, 2, 'Each source requires exactly two independent reviews');
    files.push(...names);
    const localFile = (relative) => {
      assert.ok(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'Evidence paths must remain relative to their source snapshot');
      const file = path.join(root, relative);
      assert.ok(!outside(root, fs.realpathSync(file)), 'Evidence must remain inside its source snapshot');
      return file;
    };
    const reviews = names.map((name) => read(localFile(name)));
    for (const review of reviews) if (review.importedFrom) files.push(review.importedFrom.evidenceFile);
    for (const relative of new Set(files)) capture(localFile(relative));
    const verification = verify(sourceInventoryFile, root, names.map((name) => path.join(root, name)));
    assert.equal(verification.integrity, 'passed', 'Source integrity failed: ' + verification.failures.join('; '));
    assert.equal(verification.currentProductionBuilderMatches, true, 'Source requires current exact production inputs');
    const manifest = read(path.join(root, 'manifest.json'));
    assert.ok(!manifest.composedFrom, 'Provide original independently reviewed snapshots rather than composed envelopes');
    const rows = capture(path.join(root, 'proposals.jsonl')).toString('utf8').split('\n').filter((line) => line.trim()).map(JSON.parse);
    const packet = read(path.join(root, 'review-packet.json'));
    const accepted = reviewedRows(rows, reviews).accepted;
    const entry = { role, root, inventory: path.resolve(sourceInventoryFile), files: [...new Set(files)], verification: { integrity: verification.integrity, currentProductionBuilderMatches: verification.currentProductionBuilderMatches, hashes: verification.hashes } };
    checked.push(entry);
    return { entry, rows, accepted, requests: new Map(packet.requests.map((request) => [request.id, request])) };
  };

  const chosen = [];
  const indexedIds = new Set();
  for (let position = 0; position < reports.length; position += 1) {
    const report = reports[position];
    const source = index.sources[position];
    const current = snapshot(source.snapshot, path.join(report.study, 'inventory.json'), 'policy');
    assert.equal(current.entry.verification.hashes.proposals, source.proposalsSha256, 'Snapshot no longer matches the dataset index');
    const selected = index.selected.filter((row) => row.snapshot === source.snapshot);
    const byId = new Map(current.accepted.map((row) => [row.id, row]));
    const selectedIds = new Set(selected.map((row) => row.id));
    assert.equal(selectedIds.size, selected.length, 'Duplicate indexed case identity');
    const selectedFamilies = new Set(selected.map((row) => row.family));
    for (const row of current.rows.filter((row) => selectedFamilies.has(row.family))) {
      assert.ok(selectedIds.has(row.id), 'Selected families must include every source sibling: ' + row.family);
    }
    for (const item of selected) {
      const row = byId.get(item.id);
      assert.ok(row, 'Selected case lacks full-family independent reviewer agreement: ' + item.id);
      assert.ok(!indexedIds.has(item.id), 'Duplicate indexed case identity across sources');
      indexedIds.add(item.id);
      assert.ok(SCOPE.includes(`${row.agent}:${row.tool}`), 'Selected case exceeds the checked fitting scope');
      const request = current.requests.get(row.id);
      assert.equal(item.family, row.family, 'Selected family differs from source');
      assert.equal(item.split, row.split, 'Selected split differs from source');
      assert.equal(item.topic, row.topic || null, 'Selected topic differs from source');
      assert.equal(item.inputHash, request.inputHash, 'Selected exact input differs from source');
      assert.equal(item.verdict, row.verdict, 'Selected verdict differs from independent reviewers');
      chosen.push({ row, request, source: current.entry, role: 'policy' });
    }
  }
  assert.equal(chosen.length, index.selected.length, 'Index selects a case from an unknown source snapshot');

  const defaults = snapshot(originalSnapshot, inventoryFile, 'shipped-default');
  const defaultFamilies = new Set();
  for (const key of SCOPE) for (const split of SPLITS) {
    const candidate = defaults.accepted.find((row) => {
      if (`${row.agent}:${row.tool}` !== key || row.split !== split || row.preference.text !== DEFAULT_PREFERENCE.text) return false;
      const family = defaults.rows.filter((sibling) => sibling.family === row.family);
      const accepted = defaults.accepted.filter((sibling) => sibling.family === row.family);
      return family.length === 4 && accepted.length === 4 && family.every((sibling) => `${sibling.agent}:${sibling.tool}` === key && sibling.split === split) && new Set(accepted.map((sibling) => sibling.verdict)).size === 3;
    });
    assert.ok(candidate, 'No fully agreed four-case shipped-default family for ' + key + ':' + split);
    assert.ok(!defaultFamilies.has(candidate.family), 'A shipped-default family was selected more than once');
    defaultFamilies.add(candidate.family);
    for (const row of defaults.accepted.filter((row) => row.family === candidate.family)) chosen.push({ row, request: defaults.requests.get(row.id), source: defaults.entry, role: 'shipped-default' });
  }
  assert.equal(chosen.length - index.selected.length, 48, 'Exactly 48 original shipped-default cases are required');
  const rows = chosen.map(({ row }) => row);
  validatePartitions(rows);
  const familySources = new Map();
  for (const item of chosen) {
    const previous = familySources.get(item.row.family);
    assert.ok(!previous || previous === item.source.root, 'A family is reused by different source snapshots');
    familySources.set(item.row.family, item.source.root);
  }
  const scopedCoverage = coverage({ tools }, rows);
  assert.equal(scopedCoverage.complete, true, 'Scoped reviewed coverage incomplete: ' + scopedCoverage.missing.join('; '));

  let stage;
  try {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    stage = fs.mkdtempSync(path.join(path.dirname(output), '.policy-fitting-stage-'));
    const hashes = {};
    const write = (relative, bytes) => {
      const file = path.join(stage, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes, { mode: 0o444 });
      hashes[relative] = sha256(bytes);
    };
    const jsonl = (relative, values) => write(relative, values.map(JSON.stringify).join('\n') + '\n');
    const scenarios = chosen.map(({ row, request }) => ({ id: row.id, family: row.family, agent: row.agent, split: row.split, tool: row.tool, args: row.args, preference: row.preference, userMessage: row.userMessage, verdict: row.verdict, inputHash: request.inputHash, resolutionSource: 'independent-reviewer-agreement', ...(row.topic ? { topic: row.topic } : {}) }));
    const answer = ({ row, request }) => ({ query: request.query, tools: request.tools, answers: [{ name: row.verdict, arguments: {} }] });
    for (const split of SPLITS) {
      const entries = chosen.filter(({ row }) => row.split === split);
      jsonl(split + '-answers.jsonl', entries.map(answer));
      jsonl(split + '-scenarios.jsonl', scenarios.filter((row) => row.split === split));
      jsonl(split + '-requests.jsonl', entries.map(({ row, request }) => ({ ...request, family: row.family, agent: row.agent, tool: row.tool, expected: row.verdict })));
    }
    jsonl('all-answers.jsonl', chosen.map(answer));
    jsonl('all-scenarios.jsonl', scenarios);
    const viewContents = scenarios.map((row) => JSON.stringify({ ...row, trainingEligible: false })).join('\n') + '\n';
    const viewRequests = chosen.map(({ request }) => request);
    write('proposals.jsonl', viewContents);
    write('review-packet.json', JSON.stringify({ instructions: REVIEW_INSTRUCTIONS, instructionHash: REVIEW_INSTRUCTION_HASH, requests: viewRequests }, null, 2) + '\n');
    write('manifest.json', JSON.stringify({ requestFormatVersion: GATE_REQUEST_VERSION, inventorySha256: digest(inventory), proposalsSha256: sha256(viewContents), requestsSha256: digest(viewRequests), cases: rows.length, selectionViewOnly: true, trainingEligible: false, humanVerified: false, blind: false, promotionAllowed: false }, null, 2) + '\n');
    const mapping = chosen.map(({ row, request, source, role }) => ({ id: row.id, family: row.family, split: row.split, inputHash: request.inputHash, verdict: row.verdict, source: source.root, role }));
    write('included-cases.json', JSON.stringify(mapping, null, 2) + '\n');

    const archives = new Map();
    const archive = (file, relative) => {
      const absolute = path.resolve(file);
      assert.ok(!archives.has(absolute), 'Source evidence was assigned duplicate archive locations');
      archives.set(absolute, relative);
    };
    archive(indexFile, 'source-receipts/dataset-index.json');
    archive(inventoryFile, 'source-receipts/canonical-inventory.json');
    for (let position = 0; position < checked.length; position += 1) {
      const source = checked[position];
      const prefix = 'source-receipts/source-' + position;
      source.archive = prefix;
      for (const file of source.files) archive(path.join(source.root, file), prefix + '/snapshot/' + file);
      if (!archives.has(source.inventory)) archive(source.inventory, prefix + '/inventory.json');
    }
    for (let position = 0; position < reports.length; position += 1) {
      const report = reports[position];
      const prefix = 'source-receipts/source-' + position;
      const files = [[index.sources[position].report, prefix + '/audit-report.json'], [path.join(report.study, 'plan.json'), prefix + '/plan.json']];
      if (report.mode === 'policy') files.push([path.join(report.study, 'policy-coverage-plan.json'), prefix + '/policy-coverage-plan.json']);
      for (const [file, relative] of files) if (!archives.has(path.resolve(file))) archive(file, relative);
    }
    for (const file of sources.keys()) assert.ok(archives.has(file), 'Source evidence is missing from the archive: ' + file);
    for (const [file, relative] of archives) write(relative, sources.get(file).bytes);
    const sourceFiles = [...sources].map(([file, evidence]) => ({ file, archive: archives.get(file), sha256: evidence.sha256 }));
    const manifest = {
      purpose: 'Selected-family scoped fitting experiment; not full-product training or promotion qualification',
      requestFormatVersion: GATE_REQUEST_VERSION,
      scope: SCOPE,
      experimentalFittingOnly: true,
      trainingEligible: false,
      fullProductQualified: false,
      humanVerified: false,
      blindEvaluationQualified: false,
      promotionAllowed: false,
      runtimeReplacementVerified: false,
      generatedCommandsExecuted: false,
      modelApisCalled: false,
      datasetIndexSha256: sources.get(path.resolve(indexFile)).sha256,
      sourceFiles,
      sources: checked,
      selection: { indexedCases: index.selected.length, indexedFamilies: new Set(index.selected.map((row) => row.family)).size, shippedDefaultCases: 48, shippedDefaultFamilies: defaultFamilies.size, sourceFamilyClosureVerified: true },
      cases: rows.length,
      splits: Object.fromEntries(SPLITS.map((split) => [split, rows.filter((row) => row.split === split).length])),
      verdicts: Object.fromEntries(['approve', 'deny', 'ask'].map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length])),
      scopedCoverage,
      hashes,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(stage, 'export-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o444 });
    for (const [file, evidence] of sources) assert.equal(sha256(fs.readFileSync(file)), evidence.sha256, 'Source changed before finalizing: ' + file);
    assert.ok(!fs.existsSync(output), 'Destination appeared while preparing; refusing overwrite');
    assert.equal(resolvedDestination(outputDirectory), output, 'Destination ancestry changed while preparing');
    fs.renameSync(stage, output);
    stage = null;
    return manifest;
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.equal(args.length, 4, 'Usage: prepare-policy-finetune.js <dataset-index.json> <original-default-snapshot> <canonical-inventory.json> <new-output-directory>');
    const result = preparePolicy(...args);
    process.stdout.write(JSON.stringify({ cases: result.cases, splits: result.splits, selection: result.selection, promotionAllowed: false }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { preparePolicy };
