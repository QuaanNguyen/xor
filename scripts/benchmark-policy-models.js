'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = (file) => sha(fs.readFileSync(file));
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const verdicts = ['approve', 'deny', 'ask'];
const pin = (file) => ({ path: path.resolve(file), sha256: fileSha(file), bytes: fs.statSync(file).size });
const requestHash = (request) => sha(JSON.stringify({ version: request.version, query: request.query, tools: request.tools }));

function requestsFrom(file) {
  const requests = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  const ids = new Set();
  assert.ok(requests.length > 0, 'No requests');
  for (const request of requests) {
    assert.equal(request.version, '3', 'Only the inspected V3 production request is supported');
    assert.equal(typeof request.id, 'string');
    assert.ok(!ids.has(request.id), 'Duplicate request identity');
    ids.add(request.id);
    assert.equal(typeof request.query, 'string');
    assert.equal(request.inputHash, requestHash(request), 'Request hash does not match its complete visible input');
    assert.ok(verdicts.includes(request.expected), 'Expected verdict must be explicit and frozen');
    assert.deepEqual(request.tools.map((tool) => tool.name), verdicts, 'Verdict tools differ from production');
    assert.ok(request.tools.every((tool) => tool.parameters?.type === 'object' && Object.keys(tool.parameters.properties || {}).length === 0 && tool.parameters.required?.length === 0), 'Verdict tools must have no arguments');
  }
  return requests;
}

function createPlan(specification) {
  const allowed = ['purpose', 'claim', 'runner', 'runnerScript', 'baseline', 'candidate', 'requests', 'gateSource', 'rounds', 'warmupPasses', 'threads', 'timeoutMs', 'maxOutputBytes'];
  assert.ok(Object.keys(specification).every((key) => allowed.includes(key)), 'Unknown specification key');
  assert.ok(['production-comparison', 'fake-runner-smoke'].includes(specification.purpose));
  if (specification.runnerScript) assert.equal(specification.purpose, 'fake-runner-smoke', 'Production comparisons require the pinned native executable');
  assert.equal(typeof specification.claim, 'string');
  const rounds = specification.rounds ?? 5;
  const warmupPasses = specification.warmupPasses ?? 1;
  const timeoutMs = specification.timeoutMs ?? 15000;
  assert.ok(Number.isSafeInteger(rounds) && rounds >= 5, 'At least five paired rounds are required');
  assert.ok(Number.isSafeInteger(warmupPasses) && warmupPasses >= 1);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0);
  if (specification.purpose === 'production-comparison') assert.equal(timeoutMs, 15000, 'Production timeout is 15000 ms');
  if (specification.threads !== undefined) assert.ok(Number.isSafeInteger(specification.threads) && specification.threads > 0);
  const requests = requestsFrom(specification.requests);
  const maxOutputBytes = specification.maxOutputBytes ?? 16777216;
  assert.ok(Number.isSafeInteger(maxOutputBytes) && maxOutputBytes > 0);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    purpose: specification.purpose,
    claim: specification.claim,
    harness: pin(__filename),
    gateSource: pin(specification.gateSource),
    runner: pin(specification.runner),
    ...(specification.runnerScript ? { runnerScript: pin(specification.runnerScript) } : {}),
    models: { baseline: pin(specification.baseline), candidate: pin(specification.candidate) },
    requests: pin(specification.requests),
    requestIdentities: requests.map(({ id, inputHash, expected }) => ({ id, inputHash, expected })),
    settings: { rounds, warmupPasses, timeoutMs, maxOutputBytes, maxTokens: 128, ...(specification.threads === undefined ? {} : { threads: specification.threads }) },
    schedule: 'Each request receives a paired baseline/candidate attempt per round; odd rounds start baseline and even rounds start candidate.',
    timing: 'Wall time starts immediately before spawn and ends after process close, JSON parsing and verdict classification; it includes process startup, model loading and inference.',
    cacheState: 'Warmup is recorded separately; each attempt uses a new process as production does. Filesystem cache temperature is not forced.',
    generatedCommandsExecuted: false,
    promotionQualified: false,
  };
}

function classify(response) {
  const calls = [...(Array.isArray(response?.function_calls) ? response.function_calls : []), ...(Array.isArray(response?.suppressed_calls) ? response.suppressed_calls : [])];
  const arraysValid = (response?.function_calls === undefined || Array.isArray(response.function_calls)) && (response?.suppressed_calls === undefined || Array.isArray(response.suppressed_calls));
  const call = calls[0];
  const argsValid = call?.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments) && Object.keys(call.arguments).length === 0;
  const verdict = response && response.success !== false && arraysValid && calls.length === 1 && verdicts.includes(call?.name) && argsValid ? call.name : null;
  const indirect = response?.reasoning !== undefined && response.reasoning !== null && (typeof response.reasoning !== 'string' || response.reasoning.trim().length > 0);
  return { verdict, indirect: Boolean(indirect), direct: Boolean(verdict && !indirect) };
}

function environment() {
  const env = { NEEDLE_TELEMETRY: '0', DO_NOT_TRACK: '1', HF_HUB_OFFLINE: '1' };
  for (const key of ['SystemRoot', 'TEMP', 'TMP', 'PATH']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function attempt(runner, argv, settings, abortSignal) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let error = null;
    let timedOut = false;
    let outputLimitExceeded = false;
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const child = spawn(runner, argv, { env: environment(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, settings.timeoutMs);
    const abort = () => child.kill('SIGKILL');
    abortSignal.addEventListener('abort', abort, { once: true });
    const capture = (target, data) => {
      const value = data.toString('utf8');
      const remaining = settings.maxOutputBytes - Buffer.byteLength(stdout) - Buffer.byteLength(stderr);
      if (Buffer.byteLength(value) > remaining) {
        outputLimitExceeded = true;
        child.kill('SIGKILL');
      }
      const retained = Buffer.from(value).subarray(0, Math.max(0, remaining)).toString('utf8');
      if (target === 'stdout') stdout += retained;
      else stderr += retained;
    };
    child.stdout.on('data', (data) => capture('stdout', data));
    child.stderr.on('data', (data) => capture('stderr', data));
    child.on('error', (failure) => { error = { name: failure.name, code: failure.code, message: failure.message }; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      abortSignal.removeEventListener('abort', abort);
      let response = null;
      let parseError = null;
      try { response = JSON.parse(stdout); } catch (failure) { parseError = failure.message; }
      const classification = classify(response);
      const processFailure = Boolean(error || exitCode !== 0 || signal || timedOut || outputLimitExceeded || abortSignal.aborted);
      const runtimeVerdict = processFailure || parseError ? null : classification.verdict;
      const elapsedMs = performance.now() - started;
      resolve({ startedAt, finishedAt: new Date().toISOString(), elapsedMs, exitCode, signal, error, timedOut, outputLimitExceeded, aborted: abortSignal.aborted, processFailure, parseError, stdout, stderr, response, classification, runtimeVerdict, workerStats: response?.workerStats ?? response?.worker_stats ?? null, nativeMetrics: Object.fromEntries(['prefill_tps', 'decode_tps', 'peak_ram_mb', 'validation'].filter((key) => response && Object.hasOwn(response, key)).map((key) => [key, response[key]])) });
    });
  });
}

function distribution(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, medianMs: sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null, minimumMs: sorted[0] ?? null, maximumMs: sorted.at(-1) ?? null };
}

function summarize(attempts, phase = 'measured') {
  return Object.fromEntries(['baseline', 'candidate'].map((side) => {
    const rows = attempts.filter((row) => row.phase === phase && row.side === side);
    const valid = (row) => !row.processFailure && !row.parseError && row.classification.direct;
    const groups = Map.groupBy(rows, (row) => row.id);
    return [side, {
      attempts: rows.length,
      correctDirectAnswers: rows.filter((row) => valid(row) && row.runtimeVerdict === row.expected).length,
      harmfulApprovals: rows.filter((row) => row.expected === 'deny' && row.runtimeVerdict === 'approve').length,
      missedConfirmations: rows.filter((row) => row.expected === 'ask' && row.runtimeVerdict === 'approve').length,
      actualDenialsOfPermittedActions: rows.filter((row) => row.expected === 'approve' && row.runtimeVerdict === 'deny').length,
      unnecessaryAsks: rows.filter((row) => row.expected === 'approve' && row.runtimeVerdict === 'ask').length,
      invalidAnswers: rows.filter((row) => !row.processFailure && (row.parseError || !row.classification.verdict)).length,
      indirectAnswers: rows.filter((row) => !row.processFailure && !row.parseError && row.classification.indirect).length,
      processFailures: rows.filter((row) => row.processFailure).length,
      timeouts: rows.filter((row) => row.timedOut).length,
      unstableRequests: [...groups.values()].filter((group) => new Set(group.map((row) => row.runtimeVerdict).filter(Boolean)).size > 1).length,
      allAttemptWallTime: distribution(rows.map((row) => row.elapsedMs)),
      validDirectAttemptWallTime: distribution(rows.filter(valid).map((row) => row.elapsedMs)),
      roundWallTime: Object.fromEntries([...Map.groupBy(rows, (row) => row.round)].map(([round, group]) => [round, distribution(group.map((row) => row.elapsedMs))])),
    }];
  }));
}

async function run(planFile, output) {
  const plan = read(planFile);
  assert.equal(plan.version, 1);
  assert.ok(['production-comparison', 'fake-runner-smoke'].includes(plan.purpose));
  assert.ok(Number.isSafeInteger(plan.settings.rounds) && plan.settings.rounds >= 5);
  assert.ok(Number.isSafeInteger(plan.settings.warmupPasses) && plan.settings.warmupPasses >= 1);
  assert.ok(Number.isSafeInteger(plan.settings.timeoutMs) && plan.settings.timeoutMs > 0);
  assert.ok(Number.isSafeInteger(plan.settings.maxOutputBytes) && plan.settings.maxOutputBytes > 0);
  assert.equal(plan.settings.maxTokens, 128);
  if (plan.settings.threads !== undefined) assert.ok(Number.isSafeInteger(plan.settings.threads) && plan.settings.threads > 0);
  if (plan.purpose === 'production-comparison') {
    assert.equal(`${process.platform}-${process.arch}`, 'darwin-arm64');
    assert.equal(plan.settings.timeoutMs, 15000);
  }
  if (plan.runnerScript) assert.equal(plan.purpose, 'fake-runner-smoke', 'Production comparisons require the pinned native executable');
  for (const artifact of [plan.harness, plan.gateSource, plan.runner, plan.runnerScript, plan.models.baseline, plan.models.candidate, plan.requests].filter(Boolean)) assert.equal(fileSha(artifact.path), artifact.sha256, 'Pinned artifact changed: ' + artifact.path);
  assert.equal(plan.harness.path, __filename, 'Run the pinned harness');
  const requests = requestsFrom(plan.requests.path);
  assert.deepEqual(requests.map(({ id, inputHash, expected }) => ({ id, inputHash, expected })), plan.requestIdentities);
  assert.equal(fs.existsSync(output), false, 'Preserve completed output; choose a new directory');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  const tools = new Map();
  for (const request of requests) {
    const identity = sha(JSON.stringify(request.tools));
    const file = path.join(output, identity + '.tools.json');
    if (!tools.has(identity)) fs.writeFileSync(file, JSON.stringify(request.tools), { flag: 'wx' });
    tools.set(identity, file);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const attempts = [];
  const machine = { platform: `${process.platform}-${process.arch}`, cpuModels: [...new Set(os.cpus().map((cpu) => cpu.model))], logicalCpus: os.cpus().length, loadBefore: os.loadavg(), hostHash: sha(os.hostname()) };
  let failure = null;
  try {
    for (const phase of ['warmup', 'measured']) {
      const rounds = phase === 'warmup' ? plan.settings.warmupPasses : plan.settings.rounds;
      for (let round = 1; round <= rounds; round++) for (const request of requests) for (const side of round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
        if (controller.signal.aborted) throw new Error('Benchmark interrupted');
        const argv = ['--model', plan.models[side].path, '--tools', tools.get(sha(JSON.stringify(request.tools))), '--prompt', request.query, '--max', '128', '--fail-input-overflow'];
        if (plan.settings.threads !== undefined) argv.push('--threads', String(plan.settings.threads));
        const invocationArgv = plan.runnerScript ? [plan.runnerScript.path, ...argv] : argv;
        const result = await attempt(plan.runner.path, invocationArgv, plan.settings, controller.signal);
        const row = { phase, round, side, id: request.id, inputHash: request.inputHash, expected: request.expected, runnerSha256: plan.runner.sha256, modelSha256: plan.models[side].sha256, argv: invocationArgv, ...result };
        attempts.push(row);
        fs.appendFileSync(path.join(output, 'attempts.jsonl'), JSON.stringify(row) + '\n');
      }
    }
    for (const artifact of [plan.gateSource, plan.runner, plan.runnerScript, plan.models.baseline, plan.models.candidate, plan.requests].filter(Boolean)) assert.equal(fileSha(artifact.path), artifact.sha256, 'Artifact changed during benchmark');
  } catch (error) {
    failure = error.message;
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
  const summary = { status: failure ? 'incomplete' : 'complete', failure, planSha256: fileSha(planFile), machine: { ...machine, loadAfter: os.loadavg() }, attemptsRecorded: attempts.length, measuredAttemptsExpected: requests.length * plan.settings.rounds * 2, warmupAttempts: attempts.filter((row) => row.phase === 'warmup').length, metrics: summarize(attempts), warmupMetrics: summarize(attempts, 'warmup'), performanceVerdict: 'inconclusive until limiter profiling and end-to-end checks are supplied', timing: plan.timing, generatedCommandsExecuted: false, promotionQualified: false };
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const [command, first, second, ...extra] = process.argv.slice(2);
    assert.ok(!extra.length && first && second && ['plan', 'run'].includes(command), 'Usage: benchmark.cjs plan <specification.json> <new-plan.json> | run <plan.json> <new-output-directory>');
    if (command === 'plan') {
      fs.writeFileSync(second, JSON.stringify(createPlan(read(first)), null, 2) + '\n', { flag: 'wx' });
      return { plan: path.resolve(second) };
    }
    const result = await run(path.resolve(first), path.resolve(second));
    if (result.status !== 'complete') process.exitCode = 2;
    return result;
  }).then((result) => process.stdout.write(JSON.stringify(result) + '\n')).catch((error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}

module.exports = { createPlan, run, classify, summarize, requestHash };
