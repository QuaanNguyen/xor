'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { installExecutionGuard } = require('../../xor/lib/opencode-execution');

test('repeated host transforms review one action once and still review nested calls independently', async () => {
  const reviewed = [];
  const definitions = new Map();
  definitions.set('read', { id: 'read', name: 'read', execute: async (args, context) => {
    if (args.path === 'outer.txt') return definitions.get('read').execute({ path: 'nested.txt' }, { ...context, id: 'nested' });
    return args.path;
  } });
  let transform;
  const context = { tool: { transform: async callback => { transform = callback; return { dispose() {} }; } } };
  await installExecutionGuard(context, { runAction: action => {
    reviewed.push([action.tool, action.callID, action.args.path]);
    return action.execute(action.args, action.signal);
  } });
  const editor = {
    list: () => [...definitions.values()].map(definition => {
      const execute = definition.execute;
      return { ...definition, execute: (...args) => execute(...args) };
    }),
    update: (id, change) => {
      const definition = definitions.get(id);
      const execute = definition.execute;
      const replacement = { ...definition, execute: (...args) => execute(...args) };
      change(replacement);
      definitions.set(id, replacement);
    },
  };
  transform(editor);
  transform(editor);
  const value = await definitions.get('read').execute({ path: 'outer.txt' }, { id: 'outer', sessionID: 'session', signal: new AbortController().signal });
  assert.equal(value, 'nested.txt');
  assert.deepEqual(reviewed, [['read', 'outer', 'outer.txt'], ['read', 'nested', 'nested.txt']]);
});
