'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { snapshotActionInput } = require('./action-input');

async function installExecutionGuard(context, runtime) {
  if (typeof context.tool?.transform !== 'function') throw new Error('xor requires OpenCode decoded tool execution transforms. Upgrade OpenCode before loading xor.');
  const wrapped = new WeakSet();
  const active = new AsyncLocalStorage();
  return context.tool.transform((editor) => {
    for (const definition of editor.list()) {
      if (wrapped.has(definition.execute)) continue;
      editor.update(definition.id, (tool) => {
        const execute = tool.execute;
        const guarded = (args, execution) => {
          const identity = JSON.stringify([execution.sessionID, execution.id, definition.id, snapshotActionInput(args)]);
          if (active.getStore() === identity) return execute(args, execution);
          return runtime.runAction({
            tool: definition.id,
            args,
            sessionID: execution.sessionID,
            callID: execution.id,
            signal: execution.signal,
            execute: (checked, signal) => active.run(identity, () => execute(checked, { ...execution, signal })),
          });
        };
        wrapped.add(guarded);
        tool.execute = guarded;
      });
    }
  });
}

module.exports = { installExecutionGuard };
