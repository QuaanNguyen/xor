'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { startControlServer, sendControl } = require('../../pet/control');

test('alternate paths to one settings directory preserve live control discovery', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-control-alias-'));
  const actual = path.join(workspace, 'actual');
  const alias = path.join(workspace, 'alias');
  fs.mkdirSync(actual);
  fs.symlinkSync(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const root = path.join(actual, 'new-config');
  const aliasedRoot = path.join(alias, 'new-config');
  let applied = 0;
  const server = startControlServer(() => { applied++; return true; }, aliasedRoot);
  t.after(() => {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  assert.equal(await server.ready, true);
  assert.equal(await sendControl({ action: 'reload' }, root), true);
  assert.equal(await sendControl({ action: 'reload' }, aliasedRoot), true);
  assert.equal(await sendControl({ action: 'reload' }, root), true);
  assert.equal(applied, 3);
  assert.equal(fs.readdirSync(path.join(root, 'pet-controls')).length, 1);
});
