import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginUrl = pathToFileURL(path.join(here, '../../plugin/xor.js')).href;
const pluginModule = await import(pluginUrl);
const { xor } = pluginModule;

process.env.XOR_NO_PET = '1';

async function withWorkdir(run) {
  const previousListeners = new Set(process.listeners('beforeExit'));
  const previousConfigRoot = process.env.XOR_CONFIG_ROOT;
  const workdir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xor-plugin-')));
  process.env.XOR_CONFIG_ROOT = path.join(workdir, 'owner-settings');
  try {
    return await run(workdir);
  } finally {
    for (const listener of process.listeners('beforeExit')) if (!previousListeners.has(listener)) listener();
    if (previousConfigRoot === undefined) delete process.env.XOR_CONFIG_ROOT;
    else process.env.XOR_CONFIG_ROOT = previousConfigRoot;
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

function gateDouble(respond = () => ({ verdict: 'allow' })) {
  const calls = [];
  const gate = async (input) => {
    calls.push(input);
    return respond(input);
  };
  gate.calls = calls;
  return gate;
}

function writePreference(workdir, value) {
  fs.mkdirSync(path.join(workdir, '.xor'), { recursive: true });
  fs.writeFileSync(path.join(workdir, '.xor', 'preference.json'), typeof value === 'string' ? value : JSON.stringify(value));
}

function writeRetiredProtocol(workdir, relative, value) {
  fs.mkdirSync(path.dirname(path.join(workdir, relative)), { recursive: true });
  fs.writeFileSync(path.join(workdir, relative), JSON.stringify(value));
}

test('a folder without a Preference uses the shipped default and writes nothing', async () => {
  await withWorkdir(async (workdir) => {
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {} }, { gate });

    await hooks['chat.message'](
      { sessionID: 'one' },
      { message: {}, parts: [{ type: 'text', text: 'fix the parser' }, { type: 'text', text: 'injected', synthetic: true }] },
    );
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'one' }, { args: { filePath: 'src/parser.js' } });

    assert.equal(gate.calls.length, 1);
    assert.equal(gate.calls[0].userMessage, 'fix the parser');
    assert.match(gate.calls[0].preference.text, /Act like a normal harness\. Follow the user's request without adding restrictions\./);
    assert.deepEqual(Object.keys(gate.calls[0].preference).sort(), ['done_criteria', 'text']);
    assert.equal(fs.existsSync(path.join(workdir, '.xor')), false);
  });
});

test('a partial Preference keeps the shipped text for its missing fields', async () => {
  await withWorkdir(async (workdir) => {
    writePreference(workdir, { purpose: 'Documentation only.', ask: 'pushing or deploying' });
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {} }, { gate });
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'one' }, { args: { filePath: 'README.md' } });

    const { preference } = gate.calls[0];
    assert.match(preference.text, /Documentation only/);
    assert.match(preference.text, /pushing or deploying/);
    assert.match(preference.text, /Sending project contents off the machine/);
  });
});

test('an unreadable or invalid Preference blocks the session until a person fixes it', async () => {
  await withWorkdir(async (workdir) => {
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {} }, { gate });
    const before = hooks['tool.execute.before'];

    for (const broken of ['{', '[]', JSON.stringify({ read_paths: ['**'] }), JSON.stringify({ allow: 7 })]) {
      writePreference(workdir, broken);
      await assert.rejects(
        before({ tool: 'read', sessionID: 'one' }, { args: { filePath: 'README.md' } }),
        (error) => {
          assert.match(error.message, /Governing rule: preference_validity/);
          assert.match(error.message, /Fix the Preference at/);
          return true;
        },
      );
    }
    assert.equal(gate.calls.length, 0);

    writePreference(workdir, { purpose: 'Fixed by the owner.' });
    await before({ tool: 'read', sessionID: 'one' }, { args: { filePath: 'README.md' } });
    assert.match(gate.calls.at(-1).preference.text, /Fixed by the owner/);
  });
});

test('a retired Protocol only contributes done criteria while no Preference exists', async () => {
  await withWorkdir(async (workdir) => {
    writeRetiredProtocol(workdir, '.opencode/protocol.json', {
      done_criteria: [{ id: 'parser-exists', checks: [{ type: 'file_exists', path: 'src/parser.js' }] }],
    });
    const gate = gateDouble();
    const events = path.join(workdir, 'events.jsonl');
    process.env.XOR_EVENTS = events;
    try {
      const hooks = await xor({
        directory: workdir,
        client: {
          session: {
            messages: async () => [{
              info: { id: 'done', role: 'assistant', finish: 'stop', time: { completed: Date.now() } },
              parts: [{ text: 'Done.' }],
            }],
          },
        },
      }, { gate });

      await hooks['tool.execute.before']({ tool: 'edit', sessionID: 'one' }, { args: { filePath: 'src/parser.js', oldString: 'a', newString: 'b' } });
      await hooks['tool.execute.before']({ tool: 'bash', sessionID: 'one' }, { args: { command: 'node --version' } });
      assert.equal(gate.calls.length, 2);
      assert.deepEqual(gate.calls[0].preference.done_criteria.map(({ id }) => id), ['parser-exists']);

      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'one' } } });
      const verdict = fs.readFileSync(events, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((event) => event.type === 'verdict').at(-1);
      assert.equal(verdict.status, 'fail');
      assert.match(verdict.reason, /src\/parser\.js/);
      assert.match(fs.readFileSync(path.join(workdir, '.opencode', 'protocol.json'), 'utf8'), /parser-exists/);
    } finally {
      delete process.env.XOR_EVENTS;
    }
  });
});

test('the plugin remediates completion claims and resets after a Preference correction', async () => {
  await withWorkdir(async (workdir) => {
    writePreference(workdir, {
      done_criteria: [{
        id: 'parser-fixed',
        claim_mentions: ['parser'],
        claim_verbs: ['fixed'],
        checks: [{ type: 'file_exists', path: 'src/parser.js' }],
      }],
    });
    const prompts = [];
    let completion = 0;
    const gate = gateDouble();
    const hooks = await xor({
      directory: workdir,
      client: {
        session: {
          messages: async () => [{
            info: { id: `completion-${++completion}`, role: 'assistant', finish: 'stop', time: { completed: Date.now() } },
            parts: [{ text: 'Parser fixed.' }],
          }],
          promptAsync: async (value) => prompts.push(value),
        },
      },
    }, { gate });

    async function complete() {
      await hooks.event({ event: { type: 'session.status', properties: { sessionID: 'two', status: 'busy' } } });
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'two', status: 'idle' } } });
      await new Promise((resolve) => setImmediate(resolve));
    }

    await complete();
    await complete();
    await complete();

    assert.equal(prompts.length, 3);
    assert.match(prompts[2].body.parts[0].text, /Tell the user/i);

    await hooks['chat.message']({ sessionID: 'two' }, { parts: [{ type: 'text', text: prompts[2].body.parts[0].text }] });
    await assert.rejects(
      hooks['tool.execute.before']({ tool: 'edit', sessionID: 'two' }, { args: { filePath: 'src/parser.js' } }),
      /stopped this session/i,
    );

    fs.mkdirSync(path.join(workdir, 'src'));
    fs.writeFileSync(path.join(workdir, 'src', 'parser.js'), 'export const parser = true;\n');
    writePreference(workdir, { done_criteria: [{ id: 'parser-exists', checks: [{ type: 'file_exists', path: 'src/parser.js' }] }] });

    await hooks['tool.execute.before']({ tool: 'edit', sessionID: 'two' }, { args: { filePath: 'src/parser.js' } });
    assert.equal(gate.calls.at(-1).userMessage, '', 'xor feedback is not treated as the owner speaking');
  });
});

test('a Preference change made during an agent tool run is quarantined', async () => {
  await withWorkdir(async (workdir) => {
    writePreference(workdir, { purpose: 'First purpose.' });
    const hooks = await xor({ directory: workdir, client: {} }, { gate: gateDouble() });
    const before = hooks['tool.execute.before'];
    const after = hooks['tool.execute.after'];

    await before({ tool: 'bash', sessionID: 'three' }, { args: { command: 'node script.js' } });
    writePreference(workdir, { purpose: 'Rewritten by a script.' });
    await after({ tool: 'bash', sessionID: 'three' }, { output: '' });

    await assert.rejects(
      before({ tool: 'edit', sessionID: 'three' }, { args: { filePath: 'lib/a.js' } }),
      /changed during an agent tool/i,
    );

    writePreference(workdir, { purpose: 'Corrected by the owner.' });
    await before({ tool: 'edit', sessionID: 'three' }, { args: { filePath: 'lib/a.js' } });
  });
});

test('the latest user message is read from the session when the hook missed it', async () => {
  await withWorkdir(async (workdir) => {
    const gate = gateDouble();
    const hooks = await xor({
      directory: workdir,
      client: {
        session: {
          messages: async () => [
            { info: { role: 'user' }, parts: [{ type: 'text', text: 'first request' }] },
            { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'working' }] },
            { info: { role: 'user' }, parts: [{ type: 'text', text: 'second request' }] },
          ],
        },
      },
    }, { gate });
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'four' }, { args: { filePath: 'README.md' } });
    assert.equal(gate.calls[0].userMessage, 'second request');
  });
});

test('without a retrieved Gate every call is refused with the install remedy', async () => {
  await withWorkdir(async (workdir) => {
    process.env.XOR_GATE_ROOT = path.join(workdir, 'no-gate');
    try {
      const hooks = await xor({ directory: workdir, client: {} });
      await assert.rejects(
        hooks['tool.execute.before']({ tool: 'read', sessionID: 'five' }, { args: { filePath: 'README.md' } }),
        (error) => {
          assert.match(error.message, /Governing rule: gate_unavailable/);
          assert.match(error.message, /(?:xor|xor) install/);
          return true;
        },
      );
    } finally {
      delete process.env.XOR_GATE_ROOT;
    }
  });
});

test('OpenCode V2 applies the xor to live tool input', async () => {
  await withWorkdir(async (workdir) => {
    const previous = process.env.XOR_NO_PET;
    process.env.XOR_NO_PET = '1';
    try {
      writePreference(workdir, { purpose: 'Documentation work.' });
      process.env.XOR_GATE_ROOT = path.join(workdir, 'no-gate');
      const registered = {};
      assert.equal(pluginModule.default.id, 'xor');
      const cleanup = await pluginModule.default.setup({
        app: { version: "2.0.32" },
        location: { directory: workdir },
        session: { context: async () => [] },
        tool: {
          hook: async (name, callback) => {
            registered[name] = callback;
          },
        },
        event: {
          subscribe() {
            return (async function* () {})();
          },
        },
      });
      await assert.rejects(
        registered['execute.before']({
          tool: 'edit',
          sessionID: 'session-v2',
          agent: 'build',
          messageID: 'msg-1',
          id: 'call-1',
          input: { path: '.opencode/protocol.json', update: true },
        }),
        /Decided by: folder boundary/i,
      );
      await assert.rejects(
        registered['execute.before']({
          tool: 'read',
          sessionID: 'session-v2',
          id: 'call-2',
          input: { path: 'README.md' },
        }),
        /gate_unavailable/i,
      );
      assert.equal(fs.readdirSync(path.join(process.env.XOR_CONFIG_ROOT, 'verdicts')).length, 2);
      cleanup();
    } finally {
      delete process.env.XOR_GATE_ROOT;
      if (previous === undefined) delete process.env.XOR_NO_PET;
      else process.env.XOR_NO_PET = previous;
    }
  });
});


test('OpenCode V2 tagged messages preserve user intent and completion evidence', async () => {
  await withWorkdir(async (workdir) => {
    const previousEvents = process.env.XOR_EVENTS;
    const eventsFile = path.join(workdir, 'events.jsonl');
    process.env.XOR_EVENTS = eventsFile;
    fs.writeFileSync(path.join(workdir, 'output.txt'), 'ready');
    writePreference(workdir, { done_criteria: [{ id: 'output', claim_mentions: ['output'], checks: [{ type: 'file_exists', path: 'output.txt' }] }] });
    const gate = gateDouble();
    const registered = {};
    let cleanup;
    try {
      cleanup = await pluginModule.default.setup({
        app: { version: '2.2.5' },
        location: { directory: workdir },
        session: { context: async () => [
          { id: 'user', type: 'user', text: 'Read output.txt.' },
          { id: 'feedback', type: 'synthetic', text: 'Injected feedback.' },
          { id: 'assistant', type: 'assistant', finish: 'stop', time: { completed: Date.now() }, content: [
            { type: 'reasoning', text: 'Hidden reasoning.' },
            { type: 'text', text: 'I fixed the output.' },
          ] },
        ] },
        tool: { hook: async (name, callback) => { registered[name] = callback; } },
        event: { subscribe: async function* () {
          yield { type: 'session.idle', sessionID: 'current' };
        } },
      }, { gate });
      await registered['execute.before']({ tool: 'read', sessionID: 'current', input: { path: 'output.txt' } });
      assert.equal(gate.calls[0].userMessage, 'Read output.txt.');
      await new Promise((resolve) => setImmediate(resolve));
      const events = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse);
      assert.ok(events.some((event) => event.type === 'verdict' && event.status === 'pass'));
    } finally {
      cleanup?.();
      if (previousEvents === undefined) delete process.env.XOR_EVENTS;
      else process.env.XOR_EVENTS = previousEvents;
    }
  });
});

test('retired restrictions withhold tools until the owner migrates them', async () => {
  await withWorkdir(async (workdir) => {
    writeRetiredProtocol(workdir, '.opencode/protocol.json', { task: 'Documentation only.', write_paths: ['docs/**'], deny_commands: ['git push'] });
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {} }, { gate });
    await assert.rejects(hooks['tool.execute.before']({ tool: 'edit', sessionID: 'one' }, { args: { path: 'src/parser.js', oldString: 'a', newString: 'b' } }), /migrate/);
    assert.equal(gate.calls.length, 0);
    const { migrate } = await import('../../scripts/migrate.js');
    migrate({ workdir, configRoot: path.join(workdir, 'owner-config'), ownerPolicyPath: path.join(workdir, 'owner-policy.json') });
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'one' }, { args: { path: 'docs/parser.md' } });
    assert.match(gate.calls[0].preference.text, /Documentation only/);
    assert.match(gate.calls[0].preference.text, /docs\/\*\*/);
    assert.match(gate.calls[0].preference.text, /git push/);
  });
});

test('V2 namespaced worktree removal cannot delete the Preference directory', async () => {
  await withWorkdir(async (workdir) => {
    writePreference(workdir, { text: 'Keep the project instructions intact.' });
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {} }, { gate });
    await assert.rejects(hooks['tool.execute.before']({ tool: 'opencode.worktree_remove', sessionID: 'one' }, { args: { directory: '.xor', force: true } }), /Governing rule: preference/);
    assert.equal(gate.calls.length, 0);
  });
});

test('unsupported OpenCode versions refuse plugin startup before registering tools', async () => {
  for (const version of ['1.19.2', '2.0.25', '2.0.29', '2.0.30-beta.1', undefined]) {
    let registered = false;
    await assert.rejects(pluginModule.default.setup({
      app: { version },
      tool: { hook: async () => { registered = true; } },
    }), version?.startsWith('1.') ? /opencode upgrade --major/ : /2\.0\.30/);
    assert.equal(registered, false);
  }
});

test('auto-accept preserves each parallel refusal, owner question and allowed call', async () => {
  for (const autoAccept of [false, true]) {
    await withWorkdir(async (workdir) => {
      const eventsFile = path.join(workdir, 'events.jsonl');
      process.env.XOR_EVENTS = eventsFile;
      const registered = {};
      const executed = [];
      let nativeApprovalRequests = 0;
      const nativePermission = { assert: async () => { nativeApprovalRequests++; } };
      try {
        writePreference(workdir, { text: 'Read project files. Do not delete old worktrees. Ask before removing the review worktree.' });
        const gate = gateDouble(({ call }) => ({ verdict: call.args.directory === 'review' ? 'ask' : call.tool === 'opencode.worktree_remove' ? 'disallow' : 'allow' }));
        const cleanup = await pluginModule.default.setup({
          app: { version: '2.0.32' },
          location: { directory: workdir },
          session: { context: async () => [] },
          permission: nativePermission,
          tool: { hook: async (name, callback) => { registered[name] = callback; } },
        }, { gate });
        const calls = [
          { callID: 'protected', tool: 'edit', input: { path: '.xor/preference.json', oldString: 'a', newString: 'b' } },
          { callID: 'denied', tool: 'opencode.worktree_remove', input: { directory: 'old' } },
          { callID: 'question', tool: 'opencode.worktree_remove', input: { directory: 'review' } },
          { callID: 'allowed', tool: 'read', input: { path: 'README.md' } },
        ];
        const results = await Promise.allSettled(calls.map(async (call) => {
          await registered['execute.before']({ ...call, sessionID: 'parallel' });
          if (!autoAccept) await nativePermission.assert();
          executed.push(call.callID);
          await registered['execute.after']({ ...call, sessionID: 'parallel', result: 'done' });
        }));
        assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected', 'rejected', 'fulfilled']);
        assert.match(results[0].reason.message, /Governing rule: preference/);
        assert.match(results[0].reason.message, /Target: \.xor/);
        assert.match(results[1].reason.message, /Governing rule: gate/);
        assert.match(results[1].reason.message, /Target: old/);
        assert.match(results[2].reason.message, /holding this action for the owner/);
        assert.deepEqual(executed, ['allowed']);
        assert.equal(nativeApprovalRequests, autoAccept ? 0 : 1);
        assert.equal(gate.calls.length, 3);
        const actions = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse).filter((e) => ['excursion', 'ask', 'action'].includes(e.type));
        assert.deepEqual(actions.map((e) => [e.type, e.rule, e.petState]).sort(), [
          ['action', null, 'allowed'], ['ask', 'gate', 'asking'], ['excursion', 'gate', 'refused'], ['excursion', 'preference', 'refused'],
        ].sort());
        assert.equal(new Set(actions.map((e) => e.detail.actionId)).size, 4);
        cleanup();
      } finally {
        delete process.env.XOR_EVENTS;
      }
    });
  }
});


test('disposing the plugin cancels pending checks even if a custom gate later approves', async () => {
  await withWorkdir(async (workdir) => {
    let entered;
    const checking = new Promise((resolve) => { entered = resolve; });
    let finish;
    const gate = async ({ signal }) => {
      entered(signal);
      return new Promise((resolve) => { finish = resolve; });
    };
    const hooks = await xor({ directory: workdir, client: {} }, { gate });
    const pending = hooks['tool.execute.before']({ tool: 'read', sessionID: 'cancelled' }, { args: { path: 'notes.txt' } });
    const rejected = assert.rejects(pending, /cancelled/);
    const signal = await checking;
    hooks.dispose();
    assert.equal(signal.aborted, true);
    finish({ verdict: 'allow' });
    await rejected;
  });
});


test('session deletion cancels an active check even when the Preference becomes invalid', async () => {
  await withWorkdir(async (workdir) => {
    let entered;
    const checking = new Promise((resolve) => { entered = resolve; });
    let finish;
    const hooks = await xor({ directory: workdir, client: {} }, { gate: async ({ signal }) => {
      entered(signal);
      return new Promise((resolve) => { finish = resolve; });
    } });
    const pending = hooks['tool.execute.before']({ tool: 'read', sessionID: 'deleted' }, { args: { path: 'notes.txt' } });
    const rejected = assert.rejects(pending, /cancelled/);
    const signal = await checking;
    writePreference(workdir, '{');
    await hooks.event({ event: { type: 'session.deleted', properties: { sessionID: 'deleted' } } });
    assert.equal(signal.aborted, true);
    finish({ verdict: 'allow' });
    await rejected;
    hooks.dispose();
  });
});

test('final verdict logging excludes denied arguments and survives retry and plugin reload', async () => {
  await withWorkdir(async (workdir) => {
    let entered;
    const checking = new Promise((resolve) => { entered = resolve; });
    let finish;
    const hooks = await xor({ directory: workdir, client: {}, version: '2.2.5' }, { gate: async () => {
      entered();
      return new Promise((resolve) => { finish = resolve; });
    } });
    const input = { tool: 'shell', sessionID: 'logged', callID: 'one' };
    const output = { args: { command: 'echo FAKE_PRIVATE_TOKEN_12' } };
    const directory = path.join(process.env.XOR_CONFIG_ROOT, 'verdicts');
    const pending = hooks['tool.execute.before'](input, output);
    const rejected = assert.rejects(pending, /refused/);
    await checking;
    assert.equal(fs.existsSync(directory), false);
    finish({ verdict: 'disallow', reason: 'FAKE_PRIVATE_TOKEN_12' });
    await rejected;
    hooks.dispose();
    const reloaded = await xor({ directory: workdir, client: {}, version: '2.2.5' }, { gate: async () => ({ verdict: 'disallow' }) });
    await assert.rejects(reloaded['tool.execute.before'](input, output), /refused/);
    reloaded.dispose();
    const files = fs.readdirSync(directory);
    assert.equal(files.length, 1);
    const contents = fs.readFileSync(path.join(directory, files[0]), 'utf8');
    assert.equal(contents.includes('FAKE_PRIVATE_TOKEN_12'), false);
    const row = JSON.parse(contents);
    assert.equal(row.agentVersion, '2.2.5');
    assert.equal(row.verdict, 'deny');
    assert.equal(Object.hasOwn(row, 'arguments'), false);
  });
});

test('owners can turn verdict logging off without skipping the checker', async () => {
  await withWorkdir(async (workdir) => {
    fs.mkdirSync(path.join(workdir, '.xor'));
    fs.writeFileSync(path.join(workdir, '.xor', 'settings.json'), JSON.stringify({ verdict_logging: false }));
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client: {}, version: '2.2.5' }, { gate });
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'off', callID: 'one' }, { args: { path: 'notes.txt' } });
    assert.equal(gate.calls.length, 1);
    assert.equal(fs.existsSync(path.join(process.env.XOR_CONFIG_ROOT, 'verdicts')), false);
    hooks.dispose();
  });
});

test('a waiting call logs the same Preference that its checker receives after another call reloads it', async () => {
  await withWorkdir(async (workdir) => {
    writePreference(workdir, { text: 'Read old rules.' });
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    let resume;
    let messages = 0;
    const client = { session: { messages: async () => {
      messages += 1;
      if (messages === 1) {
        started();
        await new Promise((resolve) => { resume = resolve; });
      }
      return [{ info: { role: 'user' }, parts: [{ type: 'text', text: 'Read notes.' }] }];
    } } };
    const gate = gateDouble();
    const hooks = await xor({ directory: workdir, client, version: '2.2.5' }, { gate });
    const first = hooks['tool.execute.before']({ tool: 'read', sessionID: 'race', callID: 'first' }, { args: { path: 'first.txt' } });
    await waiting;
    writePreference(workdir, { text: 'Read new rules.' });
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'race', callID: 'second' }, { args: { path: 'second.txt' } });
    resume();
    await first;
    const directory = path.join(process.env.XOR_CONFIG_ROOT, 'verdicts');
    const rows = fs.readdirSync(directory).map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
    const checked = gate.calls.find((call) => call.call.args.path === 'first.txt');
    const receipt = rows.find((row) => row.arguments.path === 'first.txt');
    assert.equal(receipt.preferenceHash, createHash('sha256').update(JSON.stringify(checked.preference)).digest('hex'));
    hooks.dispose();
  });
});

test('OpenCode execution interruption and failure events cancel active checks', async () => {
  for (const type of ['session.execution.interrupted', 'session.execution.failed']) {
    await withWorkdir(async (workdir) => {
      let entered;
      const checking = new Promise((resolve) => { entered = resolve; });
      let finish;
      const hooks = await xor({ directory: workdir, client: {} }, { gate: async ({ signal }) => {
        entered(signal);
        return new Promise((resolve) => { finish = resolve; });
      } });
      const pending = hooks['tool.execute.before']({ tool: 'read', sessionID: type }, { args: { path: 'notes.txt' } });
      const rejected = assert.rejects(pending, /cancelled/);
      const signal = await checking;
      await hooks.event({ event: { type, properties: { sessionID: type } } });
      assert.equal(signal.aborted, true);
      finish({ verdict: 'allow' });
      await rejected;
      hooks.dispose();
    });
  }
});
