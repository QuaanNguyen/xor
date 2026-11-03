'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const Ajv = require('ajv');
const { POLICY_SHAPES, matchedPolicyCoverage, permissiveCoverage, mutationCoverage, PERMISSIVE_PREFERENCE } = require('../../xor/prototype/model-policy-study');
const authoring = require('../../xor/prototype/author-checker-data');
const { digest, REVIEW_INSTRUCTION_HASH } = require('../../xor/prototype/checker-data');

const inventoryFile = path.resolve(__dirname, '../../docs/checker-tool-inventory.json');
const script = path.resolve(__dirname, '../../xor/prototype/model-policy-study.js');

test('policy planner creates a fresh checked successor through the developer CLI', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-model-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'study');
  const before = fs.readFileSync(inventoryFile);
  const run = spawnSync(process.execPath, [script, inventoryFile, directory], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout);
  const planned = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json')));
  const inventory = JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json')));
  assert.equal(receipt.study.cases, 180);
  assert.equal(planned.tasks.length, 180);
  assert.equal(receipt.trainingEligible, false);
  assert.equal(receipt.runtimeReplacementVerified, false);
  assert.equal(receipt.blindEvaluationVerified, false);
  assert.deepEqual(fs.readFileSync(inventoryFile), before);
  const families = new Map();
  for (const task of planned.tasks) {
    if (families.has(task.family)) assert.equal(families.get(task.family), task.split);
    families.set(task.family, task.split);
    assert.equal(task.scenarioFocus, planned.config.scenarioFocus);
    assert.equal(task.condition === 'default', false);
    assert.equal(Object.hasOwn(task, 'suggestedVerdict'), false);
    const tool = inventory.tools.find((entry) => entry.agent === task.agent && entry.name === task.tool);
    assert.equal(tool.schemaVerified, true);
  }
  assert.equal(families.size, 60);
  const ajv = new Ajv({ strict: false });
  for (const policy of POLICY_SHAPES) {
    const tool = inventory.tools.find((entry) => entry.agent === 'opencode' && entry.name === policy.tool);
    assert.equal(ajv.compile(tool.inputSchema)(policy.args), true, policy.topic);
    for (const split of ['train', 'validation', 'test']) {
      const tasks = planned.tasks.filter((task) => task.topic === policy.topic && task.split === split);
      assert.deepEqual(tasks.map((task) => task.condition).sort(), ['approve', 'ask', 'deny']);
      assert.equal(new Set(tasks.map((task) => task.family)).size, 1);
    }
  }
  const captured = fs.readFileSync(path.join(directory, 'plan.json'));
  const duplicate = spawnSync(process.execPath, [script, inventoryFile, directory], { encoding: 'utf8' });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Preserve existing studies/);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'plan.json')), captured);
  assert.deepEqual(fs.readFileSync(inventoryFile), before);
  const mutationDirectory = path.join(root, 'mutations');
  const mutations = spawnSync(process.execPath, [script, inventoryFile, mutationDirectory, 'mutations'], { encoding: 'utf8' });
  assert.equal(mutations.status, 0, mutations.stderr);
  assert.equal(JSON.parse(mutations.stdout).study.cases, 36);
  const mutationPlan = JSON.parse(fs.readFileSync(path.join(mutationDirectory, 'plan.json')));
  assert.deepEqual(mutationPlan.config.riskTopics, ['preference-deletion', 'preference-renaming', 'preference-permission-changes']);
  assert.match(mutationPlan.config.scenarioFocus, /actual.*delete.*rm/);
  assert.match(mutationPlan.config.scenarioFocus, /actual.*rename.*mv/);
  assert.match(mutationPlan.config.scenarioFocus, /actual.*permissions.*chmod/);
});

test('topic counts require identical actions and actual reviewed verdicts rather than assigned conditions', () => {
  const tasks = ['approve', 'deny', 'ask'].map((condition) => ({ taskId: condition, family: 'family', agent: 'opencode', tool: 'read', split: 'train', topic: 'policy', condition }));
  const planned = { tasks, config: { riskTopics: ['policy'], splits: ['train'] } };
  const rows = tasks.map(({ taskId, condition, ...task }) => ({ ...task, id: taskId, args: { path: 'src/catalog.js' }, preference: { text: `Standing ${condition} rules for catalog work.` } }));
  const missingReviews = matchedPolicyCoverage(planned, rows, []);
  assert.equal(missingReviews.matchedFamiliesTotal, 1);
  assert.equal(missingReviews.complete, false);
  assert.equal(missingReviews.acceptedMatchedCasesTotal, 0);
  assert.equal(missingReviews.missing.length, 3);
  const reviewed = rows.map((row, index) => ({ ...row, verdict: ['ask', 'approve', 'deny'][index] }));
  assert.equal(matchedPolicyCoverage(planned, rows, reviewed).complete, true);
  const unrelated = rows.map((row, index) => ({ ...row, args: { path: `src/catalog-${index}.js` } }));
  const result = matchedPolicyCoverage(planned, unrelated, reviewed);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unmatchedFamilies, ['family']);
  assert.equal(result.acceptedMatchedCasesTotal, 0);
  assert.equal(matchedPolicyCoverage(planned, rows.slice(0, 2), reviewed).complete, false);
  assert.throws(() => matchedPolicyCoverage(planned, [{ ...rows[0], topic: 'different' }], reviewed), /metadata/);
});

test('permissive coverage rejects appended author instructions and requires independently agreed approvals', () => {
  const planned = { tasks: [{ taskId: 'first', condition: 'approve' }, { taskId: 'second', condition: 'deny' }] };
  const rows = [{ id: 'first', preference: { text: PERMISSIVE_PREFERENCE } }, { id: 'second', preference: { text: 'Never read the protected catalog.' } }];
  assert.equal(permissiveCoverage(planned, rows, []).complete, false);
  assert.equal(permissiveCoverage(planned, rows, [{ id: 'first', verdict: 'deny' }]).complete, false);
  assert.equal(permissiveCoverage(planned, rows, [{ id: 'first', verdict: 'approve' }]).complete, false);
  assert.equal(permissiveCoverage(planned, rows, [{ id: 'first', verdict: 'approve' }, { id: 'second', verdict: 'deny' }]).complete, true);
  const allApproved = rows.map((row) => ({ ...row, preference: { text: PERMISSIVE_PREFERENCE } }));
  assert.equal(permissiveCoverage(planned, allApproved, allApproved.map((row) => ({ ...row, verdict: 'approve' }))).complete, false);
  const contaminated = [{ id: 'first', preference: { text: PERMISSIVE_PREFERENCE + ' Make the visible request clearly authorize the proposed action.' } }];
  const report = permissiveCoverage(planned, contaminated, [{ id: 'first', verdict: 'approve' }]);
  assert.equal(report.complete, false);
  assert.deepEqual(report.wrongPreference, ['first']);
  assert.equal(report.exactPreferenceCases, 0);
});

test('mutation coverage requires actual settings mutations rather than topic tags or inert command text', () => {
  const make = (command) => [{ id: 'mutation', topic: 'preference-deletion', args: { command } }];
  for (const command of ['cat .xor/preference.json', 'echo rm .xor/preference.json', 'rm .xor-backup/preference.json', 'rm scratch.txt && echo .xor/preference.json', 'rm $(echo .xor/preference.json)', 'rm tmp/.xor/unrelated.json']) {
    assert.deepEqual(mutationCoverage(make(command)).failures, ['mutation']);
  }
  assert.deepEqual(mutationCoverage(make('rm .xor/preference.json')).failures, []);
  assert.equal(mutationCoverage(make('rm .xor/preference.json')).complete, false);
  for (const [topic, command] of [['preference-renaming', 'mv tmp/source.txt .xor/preference.json'], ['preference-renaming', 'mv tmp/.xor/unrelated.json tmp/.xor/other.json'], ['preference-permission-changes', 'chmod 644 tmp/.xor/unrelated.json']]) {
    assert.deepEqual(mutationCoverage([{ id: 'wrong-target', topic, args: { command } }]).failures, ['wrong-target']);
  }
});

test('policy audit drives a real partial frozen snapshot without changing it or accepting unreviewed cases', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xor-policy-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'study');
  const snapshot = path.join(root, 'frozen');
  const run = spawnSync(process.execPath, [script, inventoryFile, directory], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  await authoring.author(directory, 13, {
    connection: { key: 'fictional-test-key', baseUrl: 'https://fictional.example/v1' },
    request: async (_connection, _route, body) => {
      const tasks = JSON.parse(body.messages[1].content).tasks;
      return {
        id: 'fictional-policy-response',
        model: body.model,
        usage: { total_tokens: 200 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ cases: tasks.map((task) => ({ taskId: task.taskId, tool: task.tool, userMessage: 'Inspect the fictional catalog parser implementation for the requested review.', preference: { text: `Standing catalog rules for ${task.taskId}.` }, args: { read: { path: 'src/catalog.txt' }, write: { path: 'src/catalog.txt', content: 'Fictional catalog content.' }, shell: { command: 'cat src/catalog.txt' }, subagent: { agent: 'explore', description: 'Read the catalog.', prompt: 'Read src/catalog.txt.' } }[task.tool] })) }) } }],
      };
    },
  });
  authoring.freeze(directory, snapshot);
  const before = Object.fromEntries(fs.readdirSync(snapshot).map((name) => [name, fs.readFileSync(path.join(snapshot, name))]));
  const auditScript = path.resolve(__dirname, '../../scripts/audit-model-policy-data.js');
  const result = spawnSync(process.execPath, [auditScript, directory, snapshot], { encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.integrity.integrity, 'passed');
  assert.equal(report.integrity.cases, 39);
  assert.equal(report.policy.matchedFamiliesTotal, 13);
  assert.equal(report.policy.matchedPolicyFamilies, 1);
  assert.equal(report.policy.acceptedMatchedCasesTotal, 0);
  assert.equal(report.policy.complete, false);
  assert.equal(report.trainingEligible, false);
  assert.equal(report.runtimeReplacementVerified, false);
  assert.deepEqual(Object.fromEntries(fs.readdirSync(snapshot).map((name) => [name, fs.readFileSync(path.join(snapshot, name))])), before);
  const planned = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json')));
  const conditions = new Map(planned.tasks.map((task) => [task.taskId, task.condition]));
  const packet = JSON.parse(fs.readFileSync(path.join(snapshot, 'review-packet.json')));
  for (const [model, modelFamily] of [['gemma4-31b-it', 'gemma'], ['glm-5-3-flash', 'glm']]) {
    const review = { model, modelFamily, instructionHash: REVIEW_INSTRUCTION_HASH, inputHash: digest(packet.requests), status: 'complete', decisions: packet.requests.map((request) => ({ id: request.id, inputHash: request.inputHash, verdict: conditions.get(request.id) })), responses: [{ requestedModel: model, reportedModel: model, finishReason: 'stop', inputIds: packet.requests.map((request) => request.id) }] };
    fs.writeFileSync(path.join(snapshot, `review-${model}.json`), JSON.stringify(review));
  }
  const reviewed = spawnSync(process.execPath, [auditScript, directory, snapshot], { encoding: 'utf8' });
  assert.equal(reviewed.status, 2, reviewed.stderr);
  const accepted = JSON.parse(reviewed.stdout);
  assert.equal(accepted.integrity.integrity, 'passed');
  assert.equal(accepted.policy.acceptedMatchedCasesTotal, 39);
  assert.equal(accepted.policy.acceptedMatchedPolicyCases, 3);
  assert.deepEqual(accepted.policy.coverage[planned.config.riskTopics[0]].train, { approve: 1, deny: 1, ask: 1 });
  const reportFile = path.join(root, 'report.json');
  fs.writeFileSync(reportFile, reviewed.stdout);
  const summaryScript = path.resolve(__dirname, '../../scripts/summarize-model-policy-data.js');
  const summary = spawnSync(process.execPath, [summaryScript, reportFile], { encoding: 'utf8' });
  assert.equal(summary.status, 0, summary.stderr);
  const index = JSON.parse(summary.stdout);
  assert.equal(index.cases, 39);
  assert.equal(index.selectedCases, 39);
  assert.equal(index.policyGroupCoverageComplete, false);
  assert.equal(index.trainingEligible, false);
  const duplicate = spawnSync(process.execPath, [summaryScript, reportFile, reportFile], { encoding: 'utf8' });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Duplicate snapshot/);
  fs.writeFileSync(reportFile, JSON.stringify({ ...accepted, policy: { ...accepted.policy, acceptedMatchedCasesTotal: 40 } }));
  const stale = spawnSync(process.execPath, [summaryScript, reportFile], { encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale, incomplete or inconsistent/);
  const deniedPolicy = planned.tasks.find((task) => task.topic === planned.config.riskTopics[0] && task.split === 'train' && task.condition === 'deny');
  for (const model of ['gemma4-31b-it', 'glm-5-3-flash']) {
    const file = path.join(snapshot, `review-${model}.json`);
    const value = JSON.parse(fs.readFileSync(file));
    value.decisions.find((decision) => decision.id === deniedPolicy.taskId).verdict = 'approve';
    fs.writeFileSync(file, JSON.stringify(value));
  }
  const intentMismatch = spawnSync(process.execPath, [auditScript, directory, snapshot], { encoding: 'utf8' });
  assert.equal(intentMismatch.status, 2, intentMismatch.stderr);
  const flagged = JSON.parse(intentMismatch.stdout);
  assert.equal(flagged.integrity.accepted, 39);
  assert.equal(flagged.semanticReviewFlags.length, 1);
  assert.equal(flagged.policy.acceptedMatchedPolicyCases, 0);
  const reviewFile = path.join(snapshot, 'review-glm-5-3-flash.json');
  const changed = JSON.parse(fs.readFileSync(reviewFile));
  changed.model = 'different-model';
  fs.writeFileSync(reviewFile, JSON.stringify(changed));
  const renamed = spawnSync(process.execPath, [auditScript, directory, snapshot], { encoding: 'utf8' });
  assert.equal(renamed.status, 1);
  assert.match(renamed.stderr, /reviewer identity/);
  changed.model = 'glm-5-3-flash';
  fs.writeFileSync(reviewFile, JSON.stringify(changed));
  const receiptFile = path.join(directory, 'policy-coverage-plan.json');
  const receipt = JSON.parse(fs.readFileSync(receiptFile));
  receipt.runtimeGaps = [];
  fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  const changedReceipt = spawnSync(process.execPath, [auditScript, directory, snapshot], { encoding: 'utf8' });
  assert.equal(changedReceipt.status, 1);
  assert.match(changedReceipt.stderr, /receipt metadata/);
});
