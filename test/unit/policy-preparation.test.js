'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const data = require('../../xor/prototype/checker-data');
const { audit } = require('../../scripts/audit-model-policy-data');
const { summarize } = require('../../scripts/summarize-model-policy-data');
const { preparePolicy } = require('../../scripts/prepare-policy-finetune');

const script = path.resolve(__dirname, '../../scripts/prepare-policy-finetune.js');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const jsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const modelPairs = [['gemma4-31b-it', 'gemma'], ['glm-5-3-flash', 'glm']];

function snapshot(directory, inventory, rows, verdicts, planHash) {
  fs.mkdirSync(directory, { recursive: true });
  const requests = data.reviewPacket(rows);
  const contents = rows.map(JSON.stringify).join('\n') + '\n';
  fs.writeFileSync(path.join(directory, 'proposals.jsonl'), contents);
  write(path.join(directory, 'manifest.json'), { requestFormatVersion: '3', inventorySha256: data.digest(inventory), proposalsSha256: data.digest(contents), requestsSha256: data.digest(requests), cases: rows.length, trainingEligible: false, ...(planHash ? { planSha256: planHash } : {}) });
  write(path.join(directory, 'review-packet.json'), { instructions: data.REVIEW_INSTRUCTIONS, instructionHash: data.REVIEW_INSTRUCTION_HASH, requests });
  for (const [model, modelFamily] of modelPairs) {
    write(path.join(directory, 'review-' + model + '.json'), { model, modelFamily, instructionHash: data.REVIEW_INSTRUCTION_HASH, inputHash: data.digest(requests), status: 'complete', decisions: requests.map((request) => ({ id: request.id, inputHash: request.inputHash, verdict: verdicts.get(request.id) })), responses: [{ requestedModel: model, reportedModel: model, finishReason: 'stop', inputIds: requests.map((request) => request.id) }] });
  }
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-policy-preparation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const shape = (properties) => ({ type: 'object', properties: Object.fromEntries(Object.keys(properties).map((key) => [key, { type: 'string' }])), required: Object.keys(properties), additionalProperties: false });
  const argsFor = (tool, prefix) => ({ read: { path: 'src/' + prefix + '.txt' }, write: { path: 'src/' + prefix + '.txt', content: 'Fictional text.' }, shell: { command: 'cat src/' + prefix + '.txt' }, subagent: { agent: 'explore', description: 'Inspect fictional source.', prompt: 'Read src/' + prefix + '.txt' } }[tool]);
  const inventory = { tools: ['shell', 'read', 'write', 'subagent'].map((name) => ({ agent: 'opencode', name, schemaVerified: true, hookable: true, inputSchema: shape(argsFor(name, 'shape')), examples: ['train', 'validation', 'test'].map((split) => argsFor(name, 'original-' + split)) })) };
  const inventoryFile = path.join(root, 'inventory.json');
  write(inventoryFile, inventory);
  const study = path.join(root, 'study');
  fs.mkdirSync(study);
  write(path.join(study, 'inventory.json'), inventory);
  const tasks = [];
  const rows = [];
  const verdicts = new Map();
  for (const name of ['shell', 'read', 'write', 'subagent']) for (const split of ['train', 'validation', 'test']) {
    const family = 'family-' + data.digest(name + ':' + split).slice(0, 24);
    for (const condition of ['approve', 'deny', 'ask']) {
      const id = 'case-' + data.digest(family + ':' + condition).slice(0, 24);
      tasks.push({ taskId: id, family, agent: 'opencode', tool: name, split, condition });
      rows.push({ id, family, agent: 'opencode', tool: name, split, args: argsFor(name, 'policy-' + split), userMessage: 'Inspect the fictional ' + name + ' fixture for ' + split + '.', preference: { text: 'Standing ' + condition + ' rules for this fictional scope.' }, trainingEligible: false });
      verdicts.set(id, condition);
    }
  }
  const excludedFamily = 'family-' + data.digest('semantic-exclusion').slice(0, 24);
  for (const condition of ['approve', 'deny', 'ask']) {
    const id = 'case-' + data.digest(excludedFamily + ':' + condition).slice(0, 24);
    tasks.push({ taskId: id, family: excludedFamily, agent: 'opencode', tool: 'shell', split: 'train', condition });
    rows.push({ id, family: excludedFamily, agent: 'opencode', tool: 'shell', split: 'train', args: { command: 'cat src/excluded.txt' }, userMessage: 'Inspect the fictional excluded file.', preference: { text: 'Standing ' + condition + ' rules that the synthetic reviewers interpreted differently.' }, trainingEligible: false });
    verdicts.set(id, 'approve');
  }
  const planned = { inventorySha256: data.digest(inventory), tasks, config: { riskTopics: [], splits: ['train', 'validation', 'test'] } };
  write(path.join(study, 'plan.json'), planned);
  const source = path.join(root, 'policy-snapshot');
  snapshot(source, inventory, rows, verdicts, data.digest(planned));
  const reportFile = path.join(root, 'policy-report.json');
  const indexFile = path.join(root, 'dataset-index.json');
  const refresh = () => {
    write(reportFile, audit(study, source, 'supplement'));
    write(indexFile, summarize([reportFile]));
  };
  refresh();
  const original = path.join(root, 'original');
  const originals = data.proposals(inventory);
  snapshot(original, inventory, originals, new Map(originals.map((row) => [row.id, row.suggestedVerdict || 'approve'])));
  const output = path.join(root, 'output');
  const run = (destination = output) => spawnSync(process.execPath, [script, indexFile, original, inventoryFile, destination], { encoding: 'utf8' });
  return { root, inventoryFile, inventory, study, source, original, originals, rows, verdicts, planned, reportFile, indexFile, output, excludedFamily, refresh, run };
}

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

function inputHashes(f) {
  return Object.fromEntries(files(f.root).filter((file) => !file.startsWith(f.output + path.sep)).map((file) => [file, data.digest(fs.readFileSync(file, 'utf8'))]));
}

test('scoped policy export preserves exclusions, frozen requests, source bytes, and exact default families', (t) => {
  const f = fixture(t);
  const before = inputHashes(f);
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  const manifest = read(path.join(f.output, 'export-manifest.json'));
  assert.equal(manifest.cases, 84);
  assert.deepEqual(manifest.splits, { train: 28, validation: 28, test: 28 });
  assert.deepEqual(manifest.selection, { indexedCases: 36, indexedFamilies: 12, shippedDefaultCases: 48, shippedDefaultFamilies: 12, sourceFamilyClosureVerified: true });
  assert.equal(manifest.scopedCoverage.complete, true);
  for (const key of ['trainingEligible', 'fullProductQualified', 'humanVerified', 'blindEvaluationQualified', 'promotionAllowed', 'runtimeReplacementVerified']) assert.equal(manifest[key], false);
  const exported = jsonl(path.join(f.output, 'all-scenarios.jsonl'));
  assert.ok(exported.every((row) => row.family !== f.excludedFamily));
  const selected = read(f.indexFile).selected;
  assert.ok(selected.every((row) => exported.some((out) => out.id === row.id && out.inputHash === row.inputHash && out.verdict === row.verdict)));
  const packets = [f.source, f.original].flatMap((directory) => read(path.join(directory, 'review-packet.json')).requests);
  const actual = jsonl(path.join(f.output, 'all-answers.jsonl'));
  for (let position = 0; position < actual.length; position += 1) {
    const row = exported[position];
    const request = packets.find((request) => request.id === row.id);
    assert.deepEqual(actual[position], { query: request.query, tools: request.tools, answers: [{ name: row.verdict, arguments: {} }] });
  }
  for (const [relative, hash] of Object.entries(manifest.hashes)) assert.equal(data.digest(fs.readFileSync(path.join(f.output, relative), 'utf8')), hash, relative);
  for (const source of manifest.sourceFiles) assert.equal(data.digest(fs.readFileSync(path.join(f.output, source.archive), 'utf8')), source.sha256);
  const view = read(path.join(f.output, 'manifest.json'));
  assert.equal(view.selectionViewOnly, true);
  assert.equal(view.trainingEligible, false);
  assert.equal(jsonl(path.join(f.output, 'proposals.jsonl')).length, 84);
  assert.equal(read(path.join(f.output, 'review-packet.json')).requests.length, 84);
  assert.deepEqual(inputHashes(f), before);
  const again = f.run();
  assert.equal(again.status, 1);
  assert.match(again.stderr, /Preserve existing fitting outputs/);
});

test('partial families and reintroduced excluded families cannot alter a saved index', (t) => {
  const f = fixture(t);
  const original = read(f.indexFile);
  const partial = structuredClone(original);
  partial.selected.shift();
  partial.selectedCases -= 1;
  write(f.indexFile, partial);
  let run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /index is stale|selections changed/);
  assert.equal(fs.existsSync(f.output), false);
  const replaced = structuredClone(original);
  const row = f.rows.find((row) => row.family === f.excludedFamily);
  replaced.selected.push({ id: row.id, family: row.family, split: row.split, topic: null, inputHash: data.digest(data.requestFor(row)), verdict: 'approve', snapshot: f.source });
  replaced.selectedCases += 1;
  write(f.indexFile, replaced);
  run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /index is stale|selections changed/);
  assert.equal(fs.existsSync(f.output), false);
});

test('stale reports and changed reviewer verdicts are rejected without exporting', (t) => {
  const f = fixture(t);
  const reviewFile = path.join(f.source, 'review-glm-5-3-flash.json');
  const review = read(reviewFile);
  review.decisions[0].verdict = 'deny';
  write(reviewFile, review);
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /stale|inconsistent/);
  assert.equal(fs.existsSync(f.output), false);
});

test('self-consistent successor schema substitutions cannot override the canonical contract', (t) => {
  const f = fixture(t);
  const inventory = structuredClone(f.inventory);
  inventory.tools[0].inputSchema.properties.unreviewed = { type: 'string' };
  write(path.join(f.study, 'inventory.json'), inventory);
  f.planned.inventorySha256 = data.digest(inventory);
  write(path.join(f.study, 'plan.json'), f.planned);
  snapshot(f.source, inventory, f.rows, f.verdicts, data.digest(f.planned));
  f.refresh();
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /schema differs from the canonical inventory/);
  assert.equal(fs.existsSync(f.output), false);
});

test('a rehashed original family crossing splits fails canonical source verification', (t) => {
  const f = fixture(t);
  f.originals[0].split = 'validation';
  snapshot(f.original, f.inventory, f.originals, new Map(f.originals.map((row) => [row.id, row.suggestedVerdict || 'approve'])));
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Family crosses dataset splits/);
  assert.equal(fs.existsSync(f.output), false);
});

test('duplicate independent review decisions fail the provenance boundary', (t) => {
  const f = fixture(t);
  const reviewFile = path.join(f.original, 'review-gemma4-31b-it.json');
  const review = read(reviewFile);
  review.decisions.push(review.decisions[0]);
  write(reviewFile, review);
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Duplicate review decisions|Duplicate review decision/);
  assert.equal(fs.existsSync(f.output), false);
});

test('an exact visible input duplicated between selected and default sources is refused', (t) => {
  const f = fixture(t);
  const selected = f.rows[0];
  const family = f.originals[0].family;
  for (const row of f.originals.filter((row) => row.family === family)) row.args = selected.args;
  f.originals[0].userMessage = selected.userMessage;
  f.originals[0].preference = selected.preference;
  snapshot(f.original, f.inventory, f.originals, new Map(f.originals.map((row) => [row.id, row.suggestedVerdict || 'approve'])));
  const run = f.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Duplicate visible checker input/);
  assert.equal(fs.existsSync(f.output), false);
});

test('safe imported review evidence is archived and escaping evidence is refused', (t) => {
  const f = fixture(t);
  const reviewFile = path.join(f.original, 'review-gemma4-31b-it.json');
  const original = read(reviewFile);
  const seedFile = path.join(f.original, 'seed-evidence', 'gemma.json');
  fs.mkdirSync(path.dirname(seedFile));
  write(seedFile, original);
  const review = { ...original, importedFrom: { evidenceFile: 'seed-evidence/gemma.json', reviewSha256: data.digest(fs.readFileSync(seedFile, 'utf8')), requestsSha256: original.inputHash } };
  write(reviewFile, review);
  const run = f.run();
  assert.equal(run.status, 0, run.stderr);
  const manifest = read(path.join(f.output, 'export-manifest.json'));
  const seed = manifest.sourceFiles.find((source) => source.file === fs.realpathSync(seedFile));
  assert.ok(seed);
  assert.equal(data.digest(fs.readFileSync(path.join(f.output, seed.archive), 'utf8')), seed.sha256);
  review.importedFrom.evidenceFile = '../stolen-review.json';
  write(path.join(f.root, 'stolen-review.json'), original);
  write(reviewFile, review);
  const refused = f.run(path.join(f.root, 'refused'));
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Evidence paths must remain relative/);
});

test('output paths inside frozen sources are refused even through a symlink', (t) => {
  const f = fixture(t);
  const alias = path.join(f.root, 'source-alias');
  fs.symlinkSync(f.source, alias, 'dir');
  const run = f.run(path.join(alias, 'output'));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /inside a source snapshot or study/);
  assert.equal(fs.existsSync(path.join(f.source, 'output')), false);
});

test('source mutation during staging aborts atomically and removes the staged output', (t) => {
  const f = fixture(t);
  const originalWrite = fs.writeFileSync;
  let changed = false;
  fs.writeFileSync = function (file, ...args) {
    const result = originalWrite.call(this, file, ...args);
    if (String(file).includes('.policy-fitting-stage-') && String(file).endsWith('export-manifest.json')) {
      fs.appendFileSync(f.indexFile, '\n');
      changed = true;
    }
    return result;
  };
  try {
    assert.throws(() => preparePolicy(f.indexFile, f.original, f.inventoryFile, f.output), /Source changed before finalizing/);
  } finally {
    fs.writeFileSync = originalWrite;
  }
  assert.equal(changed, true);
  assert.equal(fs.existsSync(f.output), false);
  assert.ok(fs.readdirSync(f.root).every((name) => !name.startsWith('.policy-fitting-stage-')));
});


test('source-bound semantic exclusion removes a complete family without changing reviewed labels', (t) => {
  const f = fixture(t);
  const index = read(f.indexFile);
  const family = index.selected[0].family;
  const rows = index.selected.filter((row) => row.family === family);
  const exclusion = { snapshot: f.source, family, proposalsSha256: read(f.reportFile).integrity.hashes.proposals, inputHashes: rows.map((row) => row.inputHash), reason: 'The source review found a mismatch between the proposed action and the approval rule.' };
  const filtered = summarize([f.reportFile], [exclusion]);
  assert.equal(filtered.selectedCases, index.selectedCases - 3);
  assert.ok(filtered.selected.every((row) => row.family !== family));
  assert.deepEqual(filtered.selected, index.selected.filter((row) => row.family !== family));
  write(f.indexFile, filtered);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(jsonl(path.join(f.output, 'all-scenarios.jsonl')).every((row) => row.family !== family));
  assert.deepEqual(read(path.join(f.output, 'source-receipts/dataset-index.json')).semanticExclusions, [exclusion]);
  assert.throws(() => summarize([f.reportFile], [{ ...exclusion, inputHashes: exclusion.inputHashes.slice(1) }]), /complete family/);
  assert.throws(() => summarize([f.reportFile], [{ ...exclusion, proposalsSha256: 'changed' }]), /stale/);
  assert.throws(() => summarize([f.reportFile], [exclusion, exclusion]), /duplicated/);
  assert.throws(() => summarize([f.reportFile], [{ ...exclusion, family: 'missing' }]), /missing/);
});
