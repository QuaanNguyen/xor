'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { fakeGateManifest } = require('../fixtures/fake-gate');

const repository = path.resolve(__dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, cwd, env) {
  const result = spawnSync(npm, args, { cwd, env, encoding: 'utf8', timeout: 180000, shell: process.platform === 'win32' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test('packed npm local and global installations run setup and preserve owner settings on repeat', { timeout: 300000 }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-npm-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pack = path.join(root, 'pack');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  for (const directory of [pack, project, bin]) fs.mkdirSync(directory);
  const command = path.join(bin, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  const openCodeFixture = path.resolve(__dirname, '../fixtures/fake-opencode.js');
  fs.writeFileSync(command, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${openCodeFixture}" %*\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${openCodeFixture}" "$@"\n`, { mode: 0o755 });
  const fixture = fakeGateManifest(path.join(root, 'artifacts'));
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    XDG_CONFIG_HOME: path.join(root, 'config'),
    XDG_DATA_HOME: path.join(root, 'data'),
    XOR_GATE_ROOT: path.join(root, 'gate'),
    XOR_GATE_MANIFEST: fixture.file,
    XOR_OPENCODE_COMMAND: command,
    XOR_CONFIG_ROOT: path.join(root, 'xor'),
    npm_config_cache: path.join(root, 'npm-cache'),
  };
  const npmVersion = spawnSync(npm, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout;
  const scriptPolicy = Number.parseInt(npmVersion, 10) >= 12;
  const preference = path.join(env.XOR_CONFIG_ROOT, 'preference.json');
  const settings = path.join(env.XOR_CONFIG_ROOT, 'config.json');
  fs.mkdirSync(env.XOR_CONFIG_ROOT);
  fs.writeFileSync(preference, '{"text":"Keep the owner rules."}\n');
  fs.writeFileSync(settings, '{"schema_version":4,"pet":{"enabled":false,"scale":1.125}}\n');
  const before = [preference, settings].map((file) => fs.readFileSync(file, 'utf8'));
  const report = JSON.parse(run(['pack', '--json', '--pack-destination', pack], repository, env).stdout);
  const tarball = path.join(pack, (Array.isArray(report) ? report[0] : Object.values(report)[0]).filename);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ private: true, ...(scriptPolicy ? { allowScripts: { ['file:' + tarball]: true } } : {}) }));
  for (const args of [
    ['install', '--ignore-scripts=false', tarball],
    ['install', '--global', '--ignore-scripts=false', '--prefix', path.join(root, 'prefix'), tarball],
    ['rebuild', '--ignore-scripts=false', '@quaannguyen/xor'],
  ]) {
    const installEnv = scriptPolicy && args.includes('--global') ? { ...env, npm_config_allow_scripts: 'file:' + tarball } : env;
    const result = run(args, project, installEnv);
    const installed = path.join(env.XDG_CONFIG_HOME, 'opencode', 'plugins', 'xor');
    assert.ok(fs.existsSync(path.join(installed, 'index.mjs')), result.stdout + result.stderr);
    assert.ok(fs.existsSync(path.join(installed, 'xor', 'lib', 'session.js')));
    assert.deepEqual([preference, settings].map((file) => fs.readFileSync(file, 'utf8')), before);
  }
});
