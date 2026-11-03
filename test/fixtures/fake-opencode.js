#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

if (process.argv.includes('--version')) {
  process.stdout.write('opencode v2.2.5\n');
} else if (process.argv.includes('serve')) {
  let activating = false;
  let failed;
  const definitions = new Map([['read', { id: 'read', name: 'read', execute: async (input) => ({ output: fs.readFileSync(input.path, 'utf8') }) }]]);
  const server = http.createServer((request, response) => {
    if (!activating) {
      activating = true;
      const entry = path.join(process.env.XDG_CONFIG_HOME, 'opencode', 'plugins', 'xor-diagnostic', 'index.mjs');
      import(pathToFileURL(entry).href).then((module) => module.default.setup({
        app: { version: '2.2.5' },
        location: { directory: process.cwd() },
        tool: {
          list: async () => [...definitions.values()],
          hook: async () => ({ dispose() {} }),
          async transform(callback) {
            callback({
              list: () => [...definitions.values()],
              update(id, update) {
                const tool = { ...definitions.get(id) };
                update(tool);
                definitions.set(id, tool);
              },
            });
            return { dispose() {} };
          },
        },
        session: {
          create: async () => ({ id: 'ses_diagnostic' }),
          prompt: async () => ({ id: 'msg_diagnostic' }),
          context: async () => [{ id: 'msg_diagnostic', type: 'user', content: [{ type: 'text', text: 'Read diagnostic.txt for the XOR installation diagnostic.' }] }],
          remove: async () => {},
        },
      })).catch((error) => { failed = error.message; });
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: failed ? [{ id: 'xor-diagnostic', state: { status: 'failed', error: failed } }] : [] }));
  });
  server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }) + '\n'));
  process.stdin.resume();
  process.stdin.on('end', () => server.close());
  process.on('SIGTERM', () => server.close());
} else {
  process.stdout.write('{}\n');
}
