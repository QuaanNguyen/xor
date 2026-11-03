'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { digest, requestFor } = require('../../xor/prototype/checker-data');
const { recordVerdict } = require('../../xor/lib/verdict-log');

function fixture(t, verdict = 'approve') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-verdict-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preference = { text: 'Read local files.', done_criteria: [] };
  const result = recordVerdict({ sessionID: 's', callID: 'c', tool: 'read', args: { path: 'notes.txt' }, preference, userMessage: 'Read the notes.', verdict, reason: 'gate', modelSha256: 'a'.repeat(64), requestVersion: '3', inputHash: digest(requestFor({ tool: 'read', args: { path: 'notes.txt' }, preference, userMessage: 'Read the notes.' })), timing: {} }, root);
  const receipt = JSON.parse(fs.readFileSync(result.file, 'utf8'));
  const contexts = [{ receiptId: receipt.id, userMessage: 'Read the notes.', preference, family: 'local-notes', split: 'train' }];
  const contextFile = path.join(root, 'contexts.json');
  const inventoryFile = path.join(root, 'inventory.json');
  fs.writeFileSync(inventoryFile, JSON.stringify({ tools: [{ agent: 'opencode', name: 'read', hookable: true, schemaVerified: true, inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } }] }));
  const output = path.join(root, 'candidates');
  return { output, contexts, receiptFile: result.file, run() {
    fs.writeFileSync(contextFile, JSON.stringify(contexts));
    return spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/export-verdict-candidates.js'), path.join(root, 'verdicts'), contextFile, inventoryFile, output], { encoding: 'utf8' });
  } };
}

test('the CLI exports exact approved inputs for independent review without a suggested verdict', (t) => {
  const context = fixture(t);
  const result = context.run();
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.trainingEligible, false);
  assert.equal(manifest.humanVerified, false);
  assert.equal(manifest.blind, false);
  const row = JSON.parse(fs.readFileSync(path.join(context.output, 'proposals.jsonl'), 'utf8'));
  assert.equal(Object.hasOwn(row, 'verdict'), false);
  assert.equal(Object.hasOwn(row, 'suggestedVerdict'), false);
  assert.deepEqual(row.args, { path: 'notes.txt' });
  const packet = JSON.parse(fs.readFileSync(path.join(context.output, 'review-packet.json'), 'utf8'));
  assert.equal(packet.requests.length, 1);
  assert.match(packet.requests[0].query, /Read the notes/);
});

test('the CLI refuses guessed context without creating an export', (t) => {
  const context = fixture(t);
  context.contexts[0].userMessage = 'A guessed request.';
  const result = context.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exact checked user request/);
  assert.equal(fs.existsSync(context.output), false);
});

test('the CLI cannot turn a denied receipt into a raw training action', (t) => {
  const context = fixture(t, 'deny');
  const result = context.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no retained action/);
  assert.equal(fs.existsSync(context.output), false);
});

test('the CLI rejects production-builder drift even when visible context still matches', (t) => {
  const context = fixture(t);
  const receipt = JSON.parse(fs.readFileSync(context.receiptFile, 'utf8'));
  receipt.inputHash = '0'.repeat(64);
  fs.writeFileSync(context.receiptFile, JSON.stringify(receipt));
  const result = context.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /differs from the checked input/);
  assert.equal(fs.existsSync(context.output), false);
});
