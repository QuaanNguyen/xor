'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { recordVerdict } = require('../../xor/lib/verdict-log');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-verdict-log-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = { sessionID: 'session', callID: 'call', agentVersion: '2.2.5', tool: 'shell', args: { command: 'echo FAKE_SECRET_89' }, preference: { text: 'Ask before changing files.', done_criteria: [] }, userMessage: 'Read the project.', verdict: 'deny', reason: 'The action was withheld by gate', modelSha256: 'b'.repeat(64), timing: { timeoutMs: 15000, queueMs: 0, checkerMs: 10 } };
  return { root, input, rows: () => fs.readdirSync(path.join(root, 'verdicts')).map((name) => fs.readFileSync(path.join(root, 'verdicts', name), 'utf8')) };
}

test('denied and unanswered calls never save their raw arguments', (t) => {
  const context = fixture(t);
  for (const verdict of ['deny', 'ask']) {
    recordVerdict({ ...context.input, callID: verdict, verdict }, context.root);
  }
  for (const text of context.rows()) {
    assert.equal(text.includes('FAKE_SECRET_89'), false);
    const row = JSON.parse(text);
    assert.equal(Object.hasOwn(row, 'arguments'), false);
    assert.match(row.argumentsHash, /^[a-f0-9]{64}$/);
    assert.ok(row.argumentsBytes > 0);
  }
});

test('duplicate final calls save exactly once across logger reloads', (t) => {
  const context = fixture(t);
  recordVerdict(context.input, context.root);
  delete require.cache[require.resolve('../../xor/lib/verdict-log')];
  const reloaded = require('../../xor/lib/verdict-log');
  assert.equal(reloaded.recordVerdict(context.input, context.root).duplicate, true);
  assert.equal(context.rows().length, 1);
});

test('a changed checked action has a different receipt and approved arguments are preserved', (t) => {
  const context = fixture(t);
  recordVerdict(context.input, context.root);
  const args = { command: 'echo safe' };
  recordVerdict({ ...context.input, args, verdict: 'approve' }, context.root);
  const rows = context.rows().map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((row) => row.verdict === 'approve').arguments, args);
});

test('missing durable call identity writes no receipt', (t) => {
  const context = fixture(t);
  const result = recordVerdict({ ...context.input, callID: null }, context.root);
  assert.equal(result.saved, false);
  assert.equal(fs.existsSync(path.join(context.root, 'verdicts')), false);
});

test('changed model or verdict retains a separate final decision for the same call', (t) => {
  const context = fixture(t);
  recordVerdict(context.input, context.root);
  recordVerdict({ ...context.input, verdict: 'approve' }, context.root);
  recordVerdict({ ...context.input, modelSha256: 'c'.repeat(64) }, context.root);
  const rows = context.rows().map(JSON.parse);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.verdict === 'approve').length, 1);
  assert.equal(new Set(rows.map((row) => row.modelSha256)).size, 2);
});
