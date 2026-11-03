import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { defaultGateRoot, gateManifest, verifyInstalledGate } = require('../xor/lib/gate-artifacts');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function verify(options) {
  const command = options.opencode || 'opencode';
  const expectedVersion = options['expected-version'] || '2.2.5';
  const manifest = gateManifest();
  const modelRoot = path.resolve(options['model-root'] || defaultGateRoot());
  const installed = verifyInstalledGate(manifest, modelRoot);
  assert.equal(installed.ready, true, installed.reason);
  const output = options.output ? path.resolve(options.output) : fs.mkdtempSync(path.join(os.tmpdir(), 'xor-host-lifecycle-'));
  if (options.output) {
    assert.equal(fs.existsSync(output), false, 'Choose a new output directory to preserve previous evidence');
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  }
  const root = fs.realpathSync(output);
  const project = path.join(root, 'project');
  const plugin = path.join(root, 'config', 'opencode', 'plugins', 'lifecycle');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(plugin, { recursive: true });
  const marker = 'xor-local-host-lifecycle-marker';
  fs.writeFileSync(path.join(project, 'allowed.txt'), marker + '\n');
  fs.mkdirSync(path.join(project, '.xor'));
  fs.writeFileSync(path.join(project, '.xor', 'preference.json'), JSON.stringify({ text: 'Allow reading allowed.txt and creating marker-interrupt.txt or marker-timeout.txt when requested to verify the XOR plugin. Deny all other actions.' }));
  const receiptFile = path.join(root, 'host.json');
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const part of request) raw += part;
    let body;
    try { body = JSON.parse(raw); } catch { response.writeHead(400); response.end(); return; }
    const phase = fs.readFileSync(path.join(root, 'phase'), 'utf8');
    const answered = body.messages?.some(message => message.role === 'tool');
    const agentRequest = Array.isArray(body.tools) && body.tools.length > 0;
    requests.push({ phase, path: request.url, agentRequest, toolResultPresent: !!answered });
    const selected = agentRequest && !answered;
    const delta = selected
      ? { role: 'assistant', tool_calls: [{ index: 0, id: 'call_host_' + phase, type: 'function', function: { name: ['interrupt', 'timeout'].includes(phase) ? 'shell' : 'read', arguments: JSON.stringify(['interrupt', 'timeout'].includes(phase) ? { command: 'printf ran > marker-' + phase + '.txt', description: 'Create the harmless lifecycle test marker' } : { path: 'allowed.txt' }) } }] }
      : { role: 'assistant', content: 'The local fixture check is complete.' };
    const chunk = { id: 'chatcmpl-local', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'test', choices: [{ index: 0, delta, finish_reason: null }] };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: ' + JSON.stringify(chunk) + '\n\n');
    chunk.choices = [{ index: 0, delta: {}, finish_reason: selected ? 'tool_calls' : 'stop' }];
    response.end('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  fs.writeFileSync(path.join(root, 'phase'), 'normal');
  fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ model: 'fixture/test', provider: { fixture: { npm: '@ai-sdk/openai-compatible', name: 'Local lifecycle fixture', options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'local-fixture-only' }, models: { test: { name: 'Local fixture', limit: { context: 16384, output: 1024 } } } } } }));
  fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify({ name: 'xor-host-lifecycle', exports: { '.': './index.mjs' } }));
  fs.writeFileSync(path.join(plugin, 'index.mjs'), `import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import xorPlugin from ${JSON.stringify(pathToFileURL(path.join(repository, 'plugin', 'xor.js')).href)};
const root=${JSON.stringify(root)};
const project=${JSON.stringify(project)};
const marker=${JSON.stringify(marker)};
let running=false;
export default {id:'xor-host-lifecycle',async setup(ctx){
 const data={version:ctx.app?.version,readRoot:fs.realpathSync(ctx.location.directory),toolMethods:Object.keys(ctx.tool),toolExecuteAvailable:typeof ctx.tool.execute==='function',events:[],before:[],after:[],phases:[],complete:false};
 assert.equal(data.readRoot,project);
 const save=()=>fs.writeFileSync(root+'/host.json',JSON.stringify(data,null,2));
 const controller=new AbortController();
 void(async()=>{try{for await(const event of ctx.event.subscribe({signal:controller.signal})){if(event.type.startsWith('session.execution')){data.events.push({type:event.type,data:event.data||event.properties,at:performance.now()});save();}}}catch(error){if(error.name!=='AbortError'){data.subscriptionError=error.message;save();}}})();
 await ctx.tool.hook('execute.before',event=>{
  const phase=fs.readFileSync(root+'/phase','utf8');
  if(['interrupt','timeout'].includes(phase)){assert.equal(event.tool,'shell');assert.equal(event.input.command,'printf ran > marker-'+phase+'.txt');}else{assert.equal(event.tool,'read');assert.deepEqual(event.input,{path:'allowed.txt'});}
  data.before.push({phase,keys:Object.keys(event),tool:event.tool,id:event.id,callID:event.callID,sessionID:event.sessionID,signalAvailable:!!event.signal,at:performance.now()});save();
  if(phase==='interrupt')setTimeout(()=>{void ctx.session.interrupt({sessionID:event.sessionID,resume:false}).then(value=>{data.interruptResult=value;save();},error=>{data.interruptError=error.message;save();});},20);
  if(phase==='reload')setTimeout(()=>{data.reloadStartedAt=performance.now();save();void ctx.tool.reload().then(()=>{data.reloadReturnedAt=performance.now();save();},error=>{data.reloadError=error.message;save();});},5);
 });
 const dispose=await xorPlugin.setup(ctx);
 await ctx.tool.hook('execute.after',event=>{data.after.push({phase:fs.readFileSync(root+'/phase','utf8'),tool:event.tool,id:event.id,status:event.status,markerObserved:JSON.stringify(event.result).includes(marker),at:performance.now()});save();});
 save();
 if(!running){running=true;setTimeout(()=>{void(async()=>{try{
  for(const phase of ['normal','interrupt','timeout','reload']){
   fs.writeFileSync(root+'/phase',phase);
   const settings=project+'/.xor/settings.json';
   if(phase==='timeout')fs.writeFileSync(settings,JSON.stringify({gate_timeout_ms:1}));else fs.rmSync(settings,{force:true});
   const session=await ctx.session.create({});data.phases.push({phase,sessionID:session.id});save();
   await ctx.session.prompt({sessionID:session.id,text:['interrupt','timeout'].includes(phase)?'Create marker-'+phase+'.txt to verify the XOR plugin.':'Read allowed.txt to verify the XOR plugin.'});
   for(let i=0;i<150&&!data.events.some(event=>event.data?.sessionID===session.id&&['session.execution.succeeded','session.execution.failed','session.execution.interrupted'].includes(event.type));i++)await delay(100);
   assert.ok(data.events.some(event=>event.data?.sessionID===session.id&&['session.execution.succeeded','session.execution.failed','session.execution.interrupted'].includes(event.type)),'Session did not terminate: '+phase);
   await delay(100);
  }
  data.complete=true;save();
 }catch(error){data.error=error.stack;data.complete=true;save();}})();},50);}
 return()=>{controller.abort();dispose?.();};
}};
`);
  const password = crypto.randomBytes(24).toString('base64url');
  const env = { PATH: process.env.PATH, HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_CACHE_HOME: path.join(root, 'cache'), XDG_STATE_HOME: path.join(root, 'state'), XOR_CONFIG_ROOT: path.join(root, 'xor-config'), XOR_GATE_ROOT: modelRoot, XOR_NO_PET: '1', DO_NOT_TRACK: '1', OPENCODE_DISABLE_FREE_MODELS: '1', OPENCODE_PASSWORD: password };
  if (process.env.XOR_GATE_MANIFEST) env.XOR_GATE_MANIFEST = process.env.XOR_GATE_MANIFEST;
  fs.mkdirSync(env.TMPDIR);
  const child = spawn(command, ['serve', '--stdio', '--port', '0'], { cwd: project, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => fs.appendFileSync(path.join(root, 'stderr.log'), chunk));
  const lines = createInterface({ input: child.stdout });
  let url;
  let launchError;
  child.on('error', error => { launchError = error; });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  lines.on('line', line => { try { const value = JSON.parse(line); if (value.url) url = value.url; } catch {} });
  try {
    let host;
    for (let attempt = 0; attempt < 700; attempt++) {
      if (launchError) throw launchError;
      assert.equal(child.exitCode, null, 'OpenCode exited before verification finished');
      if (fs.existsSync(receiptFile)) {
        host = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
        if (host.complete) break;
      }
      if (url) await fetch(new URL('/api/plugin?location%5Bdirectory%5D=' + encodeURIComponent(project), url), { headers: { authorization: 'Basic ' + Buffer.from('opencode:' + password).toString('base64') }, signal: AbortSignal.timeout(2000) }).catch(() => {});
      await delay(100);
    }
    assert.equal(host?.complete, true, 'Host did not complete the bounded lifecycle check');
    assert.equal(host.error, undefined, host.error);
    assert.equal(host.subscriptionError, undefined, host.subscriptionError);
    assert.equal(host.version, expectedVersion);
    assert.equal(host.before.length, 4);
    assert.ok(host.before.every(event => typeof event.id === 'string' && event.id.length > 0));
    for (const phase of ['normal', 'reload']) {
      const result = host.after.find(event => event.phase === phase);
      assert.equal(result?.status, 'completed', phase);
      assert.equal(result?.markerObserved, true, phase);
    }
    for (const phase of ['interrupt', 'timeout']) {
      assert.equal(host.after.some(event => event.phase === phase), false, phase);
      assert.equal(fs.existsSync(path.join(project, 'marker-' + phase + '.txt')), false, 'Blocked shell marker must not exist: ' + phase);
    }
    assert.equal(host.interruptResult?.interrupted, true);
    assert.ok(host.events.some(event => event.type === 'session.execution.interrupted' && event.data.reason === 'user'));
    const reloading = host.before.find(event => event.phase === 'reload');
    const reloaded = host.after.find(event => event.phase === 'reload');
    assert.ok(host.reloadStartedAt >= reloading.at && host.reloadReturnedAt >= host.reloadStartedAt && host.reloadReturnedAt < reloaded.at, 'The tool call must remain pending across tool registry reload');
    const directory = path.join(root, 'xor-config', 'verdicts');
    const receipts = fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => ({ name, row: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }));
    assert.equal(receipts.length, 4);
    assert.ok(receipts.every(({ row }) => row.modelSha256 === manifest.weights.sha256 && row.agentVersion === expectedVersion));
    assert.equal(receipts.filter(({ row }) => row.verdict === 'approve').length, 2);
    assert.equal(receipts.filter(({ row }) => row.verdict === 'deny').length, 2);
    assert.ok(receipts.some(({ row }) => row.verdict === 'deny' && row.timing.timeoutMs === 1));
    assert.ok(receipts.filter(({ row }) => row.verdict === 'deny').every(({ row }) => !Object.hasOwn(row, 'arguments')));
    const summary = { verified: true, hostVersion: host.version, toolSelection: 'A local deterministic OpenAI-compatible response fixture supplied fixed agent read and harmless shell-marker calls. No external language model was used.', checker: 'The pinned native Needle runner checked each proposed action.', modelSha256: manifest.weights.sha256, readRoot: host.readRoot, markerObserved: true, actualHostHooks: true, callbackInvokedManually: false, actualPayloadKeys: host.before[0].keys, toolExecuteAvailable: host.toolExecuteAvailable, outcomes: { normalReadCompleted: true, interruptedShellCompleted: false, interruptedShellMarkerExists: false, interruptionEvent: 'session.execution.interrupted', interruptionReason: 'user', oneMillisecondDeadlineShellCompleted: false, deadlineShellMarkerExists: false, effectiveDeadlineMs: 1, toolRegistryReloadOverlappedPendingCall: true, readCompletedAfterRegistryReload: true, fullPluginModuleReloadTested: false }, verdictReceipts: { count: receipts.length, approved: 2, denied: 2, deniedArgumentsRetained: false }, providerRequests: requests, sourceHashes: Object.fromEntries(['scripts/verify-opencode-lifecycle.mjs', 'plugin/xor.js', 'xor/lib/gate.js', 'xor/lib/session.js', 'xor/lib/verdict-log.js', 'xor/lib/gate-settings.js', 'xor/lib/opencode-execution.js', 'xor/lib/action-input.js', 'xor/lib/toolcalls.js', 'xor/lib/boundary.js'].map(file => [file, digest(fs.readFileSync(path.join(repository, file)))])), hostReceiptSha256: digest(fs.readFileSync(receiptFile)), limitations: ['The test exercises a tool registry reload while checking a call. It does not establish behavior during full plugin-module replacement.', 'Direct or nested MCP, schedules, and goal sessions are not tested.'] };
    fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
    return { output: root, summary };
  } finally {
    lines.close();
    child.stdin.end();
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    force.unref();
    await exited;
    clearTimeout(force);
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  const { values } = parseArgs({ options: { opencode: { type: 'string' }, output: { type: 'string' }, 'model-root': { type: 'string' }, 'expected-version': { type: 'string' } } });
  const result = await verify(values);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
