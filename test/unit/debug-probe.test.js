'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

async function fixture(t, allowed) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-final-probe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, 'plugin.mjs');
  const fixtureFile = path.join(root, 'diagnostic.txt');
  const receiptFile = path.join(root, 'receipt.json');
  fs.writeFileSync(fixtureFile, 'XOR installation diagnostic.\n');
  fs.writeFileSync(entry, `export default { id: 'xor', async setup(context) { await context.tool.hook('execute.before', async () => { context.counts.before += 1; }); await context.tool.transform(editor => { for (const definition of editor.list()) editor.update(definition.id, tool => { const execute = tool.execute; tool.execute = async (input, execution) => { context.counts.guarded += 1; if (!${JSON.stringify(allowed)}) throw new Error('final action denied'); return execute(input, execution); }; }); }); await context.tool.hook('execute.after', async () => { context.counts.after += 1; }); } };\n`);
  const counts = { before: 0, guarded: 0, executed: 0, after: 0 };
  const definitions = new Map([['read', { id: 'read', name: 'read', execute: async (input, execution) => {
    counts.executed += 1;
    assert.equal(execution.id, 'call_xor_installation_diagnostic');
    assert.equal(execution.messageID, 'msg_diagnostic');
    return { output: fs.readFileSync(input.path, 'utf8') };
  } }]]);
  const context = {
    counts,
    tool: {
      list: async () => [...definitions.values()],
      hook: async () => ({ dispose() {} }),
      async transform(callback) {
        callback({ list: () => [...definitions.values()], update(id, update) { const tool = { ...definitions.get(id) }; update(tool); definitions.set(id, tool); } });
        return { dispose() {} };
      },
    },
    session: { create: async () => ({ id: 'ses_diagnostic' }), prompt: async () => ({ id: 'msg_diagnostic' }), context: async () => [{ id: 'msg_diagnostic', type: 'user' }], remove: async () => {} },
  };
  const { probeInstalledPlugin } = await import(pathToFileURL(path.resolve(__dirname, '../../scripts/debug-probe.mjs')).href);
  return { counts, run: () => probeInstalledPlugin(context, { entry, fixtureFile, receiptFile, fixtureMarker: 'XOR installation diagnostic.' }) };
}

test('the diagnostic completes a read through the transformed executor without invoking an early before hook', async (t) => {
  const context = await fixture(t, true);
  const receipt = await context.run();
  assert.equal(receipt.finalExecutionGuard, true);
  assert.deepEqual(receipt.guardedTools, ['read']);
  assert.equal(receipt.executionPath, 'captured-transformed-definition');
  assert.equal(receipt.read, true);
  assert.equal(receipt.error, undefined);
  assert.deepEqual(context.counts, { before: 0, guarded: 1, executed: 1, after: 1 });
});

test('an early hook cannot make the diagnostic pass when the final executor withholds the read', async (t) => {
  const context = await fixture(t, false);
  const receipt = await context.run();
  assert.equal(receipt.finalExecutionGuard, true);
  assert.equal(receipt.allowed, false);
  assert.equal(receipt.read, false);
  assert.equal(receipt.error, 'final action denied');
  assert.deepEqual(context.counts, { before: 0, guarded: 1, executed: 0, after: 0 });
});
