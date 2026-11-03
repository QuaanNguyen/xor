#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

if (process.argv.includes('--version')) {
  process.stdout.write('opencode v2.2.5\n');
} else if (process.argv.includes('serve')) {
  let activating = false;
  let failed;
  const server = http.createServer((request, response) => {
    if (!activating) {
      activating = true;
      const entry = path.join(process.env.XDG_CONFIG_HOME, 'opencode', 'plugins', 'xor-diagnostic', 'index.mjs');
      import(pathToFileURL(entry).href).then((module) => module.default.setup({
        app: { version: '2.2.5' },
        location: { directory: process.cwd() },
        tool: { hook: async () => ({ dispose() {} }) },
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
