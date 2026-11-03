'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { TOPICS, summarizePairs } = require('../../xor/prototype/permission-fix-pairs');
const { digest, reviewPacket, REVIEW_INSTRUCTION_HASH } = require('../../xor/prototype/checker-data');

const inventory = path.resolve(__dirname, '../../docs/checker-tool-inventory.json');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-permission-pairs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'study');
  const prepared = spawnSync(process.execPath, [path.resolve(__dirname, '../../xor/prototype/permission-fix-pairs.js'), 'prepare', inventory, directory], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  const rows = fs.readFileSync(path.join(directory, 'proposals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const packets = reviewPacket(rows);
  const reviews = ['first', 'second'].map((model) => ({ model, modelFamily: model, instructionHash: REVIEW_INSTRUCTION_HASH, inputHash: digest(packets), decisions: rows.map((row, index) => ({ id: row.id, inputHash: packets[index].inputHash, verdict: row.pairRole === 'safe' ? 'approve' : 'deny' })) }));
  return { directory, rows, reviews, packets };
}

test('the real preparation and integrity CLIs freeze balanced native pairs without altering the snapshot', (t) => {
  const context = fixture(t);
  assert.equal(context.rows.length, 270);
  for (const topic of TOPICS) {
    for (const agent of ['opencode', 'claude-code', 'codex']) {
      for (const split of ['train', 'validation', 'test']) {
        const rows = context.rows.filter((row) => row.topic === topic && row.agent === agent && row.split === split);
        assert.equal(rows.filter((row) => row.pairRole === 'harmful').length, 3);
        assert.equal(rows.filter((row) => row.pairRole === 'safe').length, 3);
      }
    }
  }
  const hashFiles = () => Object.fromEntries(fs.readdirSync(context.directory).map((name) => [name, digest(fs.readFileSync(path.join(context.directory, name), 'utf8'))]));
  const before = hashFiles();
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/verify-checker-data.js'), path.join(context.directory, 'inventory.json'), context.directory], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.integrity, 'passed');
  assert.equal(report.currentProductionBuilderMatches, true);
  assert.equal(report.trainingEligible, false);
  assert.deepEqual(hashFiles(), before);
});

test('paired report separates harmful approvals, safe refusals, invalid outputs and runtime failures', (t) => {
  const context = fixture(t);
  const harmful = context.rows.filter((row) => row.pairRole === 'harmful').slice(0, 2);
  const safe = context.rows.filter((row) => row.pairRole === 'safe').slice(0, 2);
  const observation = (row, extra) => ({ id: row.id, inputHash: context.packets.find((packet) => packet.id === row.id).inputHash, ...extra });
  const report = summarizePairs(context.directory, context.reviews, [observation(harmful[0], { verdict: 'approve' }), observation(safe[0], { verdict: 'deny' }), observation(harmful[1], { verdict: null }), observation(safe[1], { error: 'runner unavailable' })]);
  assert.equal(report.topics['subshell-protected-redirect'].harmfulApprovals, 1);
  assert.equal(report.topics['subshell-protected-redirect'].safeRefusals, 1);
  assert.equal(report.topics['subshell-protected-redirect'].invalidOutputs, 1);
  assert.equal(report.topics['subshell-protected-redirect'].runtimeFailures, 1);
  assert.equal(report.accepted, 270);
  assert.equal(report.trainingEligible, false);
});

test('one review dispute excludes the entire related family and its safe counterparts', (t) => {
  const context = fixture(t);
  context.reviews[1].decisions[0].verdict = 'ask';
  const report = summarizePairs(context.directory, context.reviews);
  assert.equal(report.accepted, 264);
  assert.equal(report.excluded, 6);
  assert.equal(report.quarantinedFamilies.length, 1);
});

test('evaluation rows must identify exact independently agreed inputs', (t) => {
  const context = fixture(t);
  assert.throws(() => summarizePairs(context.directory, context.reviews, [{ id: context.rows[0].id, inputHash: '0'.repeat(64), verdict: 'approve' }]), /differs/);
  context.reviews[0].inputHash = '0'.repeat(64);
  assert.throws(() => summarizePairs(context.directory, context.reviews), /Review envelope/);
});


test('the explicit redirect repair preserves the original frozen study and requests fresh review', (t) => {
  const context = fixture(t);
  const before = digest(fs.readFileSync(path.join(context.directory, 'proposals.jsonl'), 'utf8'));
  const destination = path.join(path.dirname(context.directory), 'repair');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../xor/prototype/permission-fix-pairs.js'), 'prepare-redirect-repair', inventory, destination], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).cases, 54);
  assert.equal(digest(fs.readFileSync(path.join(context.directory, 'proposals.jsonl'), 'utf8')), before);
  const rows = fs.readFileSync(path.join(destination, 'proposals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.every((row) => row.topic === 'failed-redirect-variable' && row.preference.text.includes('separate confirmation')));
  assert.equal(new Set(rows.map((row) => row.family)).size, 9);
});

test('bounded retained-cache controls freeze twelve inert training inputs and preserve existing files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-training-controls-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const retained = ['build/cache', 'records/cache', 'out/cache', 'history/cache'];
  for (const directory of retained) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, directory, 'retained.txt'), directory);
  }
  const oldLabels = path.join(root, 'previous-owner-labels.json');
  fs.writeFileSync(oldLabels, JSON.stringify({ verdict: 'approve', source: 'preserved-owner-decision' }));
  const oldBytes = fs.readFileSync(oldLabels, 'utf8');
  const destination = path.join(root, 'controls');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../xor/prototype/permission-fix-pairs.js'), 'prepare-training-controls', inventory, destination], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).cases, 12);
  const rows = fs.readFileSync(path.join(destination, 'proposals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(new Set(rows.map(row => row.family)).size, 2);
  assert.ok(rows.every(row => row.split === 'train' && row.trainingEligible === false));
  for (const agent of ['opencode', 'claude-code', 'codex']) {
    assert.equal(rows.filter(row => row.agent === agent && row.pairRole === 'harmful').length, 2);
    assert.equal(rows.filter(row => row.agent === agent && row.pairRole === 'safe').length, 2);
  }
  const plan = JSON.parse(fs.readFileSync(path.join(destination, 'bounded-plan.json'), 'utf8'));
  assert.deepEqual(plan.reviewBounds, { inputsPerModel: 12, batchSize: 2, maximumRequestsPerModel: 6, retriesAllowed: 0, newCasesAllowed: 0 });
  assert.equal(plan.modelTrainingAllowed, false);
  const packet = JSON.parse(fs.readFileSync(path.join(destination, 'review-packet.json'), 'utf8'));
  assert.ok(packet.requests.every(request => Object.keys(request).sort().join(',') === 'id,inputHash,query,tools,version'));
  const verified = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/verify-checker-data.js'), path.join(destination, 'inventory.json'), destination], { encoding: 'utf8' });
  assert.equal(verified.status, 2, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).integrity, 'passed');
  assert.equal(fs.readFileSync(oldLabels, 'utf8'), oldBytes);
  for (const directory of retained) assert.equal(fs.readFileSync(path.join(root, directory, 'retained.txt'), 'utf8'), directory);
});
