'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepare } = require('../../scripts/prepare-checker-finetune');
const data = require('../../xor/prototype/checker-data');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-preparation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inventory = { tools: [{ agent: 'opencode', name: 'shell', schemaVerified: true, inputSchema: { type: 'object', required: ['command'], properties: { command: { type: 'string' } }, additionalProperties: false }, examples: [{ command: 'pwd' }, { command: 'ls' }, { command: 'git diff' }] }] };
  const inventoryFile = path.join(root, 'inventory.json');
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  const directory = path.join(root, 'source');
  data.prepare(inventory, directory);
  const rows = data.proposals(inventory);
  const requests = data.reviewPacket(rows);
  for (const model of ['one', 'two']) fs.writeFileSync(path.join(directory, 'review-' + model + '.json'), JSON.stringify({ model, modelFamily: model, instructionHash: data.REVIEW_INSTRUCTION_HASH, inputHash: data.digest(requests), decisions: requests.map((request, index) => ({ id: request.id, inputHash: request.inputHash, verdict: rows[index].suggestedVerdict || 'approve' })), responses: [{ requestedModel: model, reportedModel: model, inputIds: rows.map((row) => row.id) }] }));
  const human = path.join(root, 'human.json');
  fs.writeFileSync(human, JSON.stringify({ human: { labels: [] } }));
  return { root, directory, human, inventoryFile, output: path.join(root, 'output') };
}

test('preparation rejects incorrect exact-input review hashes before writing an export', (t) => {
  const f = fixture(t);
  const file = path.join(f.directory, 'review-one.json');
  const review = JSON.parse(fs.readFileSync(file));
  review.decisions[0].inputHash = 'wrong';
  fs.writeFileSync(file, JSON.stringify(review));
  assert.throws(() => prepare(f.directory, f.human, f.output, { inventoryFile: f.inventoryFile }), /review|Review|hash|integrity/);
  assert.equal(fs.existsSync(f.output), false);
});

test('preparation preserves complete checked examples and declares its explicit scope', (t) => {
  const f = fixture(t);
  const report = prepare(f.directory, f.human, f.output, { inventoryFile: f.inventoryFile, scope: ['opencode:shell'] });
  assert.equal(report.cases, 12);
  assert.deepEqual(report.scope, ['opencode:shell']);
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.trainingEligible, false);
  assert.equal(report.qualifiedExport, false);
  const rows = fs.readFileSync(path.join(f.output, 'train-answers.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.every((row) => row.query.includes('Agent action: shell ') && row.answers.length === 1));
});

test('human adjudication cannot replace a missing independent review', (t) => {
  const f = fixture(t);
  const proposals = fs.readFileSync(path.join(f.directory, 'proposals.jsonl'), 'utf8');
  const manifest = fs.readFileSync(path.join(f.directory, 'manifest.json'), 'utf8');
  const row = JSON.parse(proposals.trim().split('\n')[0]);
  const request = JSON.parse(fs.readFileSync(path.join(f.directory, 'review-packet.json'))).requests[0];
  const file = path.join(f.directory, 'review-one.json');
  const review = JSON.parse(fs.readFileSync(file));
  review.decisions.shift();
  fs.writeFileSync(file, JSON.stringify(review));
  fs.writeFileSync(f.human, JSON.stringify({ human: { inputHashes: { 'proposals.jsonl': data.digest(proposals), 'manifest.json': data.digest(manifest) }, evidence: { conversationId: 'fixture', exactReply: 'Approve this fixture.' }, labels: [{ id: row.id, family: row.family, tool: row.tool, inputHash: request.inputHash, verdict: 'approve', humanVerified: true }] } }));
  assert.throws(() => prepare(f.directory, f.human, f.output, { inventoryFile: f.inventoryFile }), /both exact-input independent reviews/);
  assert.equal(fs.existsSync(f.output), false);
});

test('human decisions must bind to the exact case and recorded owner reply', (t) => {
  const f = fixture(t);
  const proposals = fs.readFileSync(path.join(f.directory, 'proposals.jsonl'), 'utf8');
  const manifest = fs.readFileSync(path.join(f.directory, 'manifest.json'), 'utf8');
  const row = JSON.parse(proposals.trim().split('\n')[0]);
  const request = JSON.parse(fs.readFileSync(path.join(f.directory, 'review-packet.json'))).requests[0];
  const record = { human: { inputHashes: { 'proposals.jsonl': data.digest(proposals), 'manifest.json': data.digest(manifest) }, evidence: { conversationId: 'fixture', exactReply: 'Approve this fixture.' }, labels: [{ id: row.id, family: row.family, tool: row.tool, inputHash: '0'.repeat(64), verdict: 'approve', humanVerified: true }] } };
  fs.writeFileSync(f.human, JSON.stringify(record));
  assert.throws(() => prepare(f.directory, f.human, f.output, { inventoryFile: f.inventoryFile }), /does not match the exact case/);
  record.human.labels[0].inputHash = request.inputHash;
  record.human.evidence.exactReply = '';
  fs.writeFileSync(f.human, JSON.stringify(record));
  assert.throws(() => prepare(f.directory, f.human, f.output, { inventoryFile: f.inventoryFile }), /recorded owner reply/);
  assert.equal(fs.existsSync(f.output), false);
});
