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

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const marker = 'xor-local-mcp-marker';
const self = fileURLToPath(import.meta.url);

function mcpSource(root, project) {
  return `import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
const root=${JSON.stringify(root)};
const project=${JSON.stringify(project)};
const log=value=>fs.appendFileSync(root+'/mcp.jsonl',JSON.stringify(value)+'\\n');
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
log({type:'started',pid:process.pid});
for await(const line of createInterface({input:process.stdin})){
 let message;try{message=JSON.parse(line);}catch{continue;}
 if(message.id===undefined)continue;
 if(message.method==='initialize'){reply(message.id,{protocolVersion:message.params.protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:'xor-local-marker-fixture',version:'1.0.0'}});continue;}
 if(message.method==='tools/list'){reply(message.id,{tools:[{name:'write_marker',description:'Write the requested harmless marker file for the isolated local XOR verification.',inputSchema:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content'],additionalProperties:false}}]});continue;}
 if(message.method==='tools/call'){
  const args=message.params.arguments;
  const target=path.resolve(project,args.path);
  const relative=path.relative(root,target);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){log({type:'outside-fixture-refusal',target});reply(message.id,{isError:true,content:[{type:'text',text:'The fixture will not write outside its own temporary root.'}]});continue;}
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,args.content+'\\n',{flag:'wx',mode:0o600});
  log({type:'executed',name:message.params.name,args,target});
  reply(message.id,{content:[{type:'text',text:'Wrote '+args.path}],structuredContent:{path:args.path,written:true}});continue;
 }
 if(message.method==='ping'){reply(message.id,{});continue;}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported fixture method '+message.method}})+'\\n');
}
`;
}

function pluginSource(root, project, entry, mode) {
  return `import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import xorPlugin from ${JSON.stringify(pathToFileURL(entry).href)};
const root=${JSON.stringify(root)};
const project=${JSON.stringify(project)};
let running=false;
export default {id:'xor-mcp-fixture',async setup(ctx){
 const data={version:ctx.app?.version,mode:${JSON.stringify(mode)},before:[],after:[],events:[],phases:[],toolMethods:Object.keys(ctx.tool),complete:false};
 const save=()=>{fs.writeFileSync(root+'/host.json.tmp',JSON.stringify(data,null,2));fs.renameSync(root+'/host.json.tmp',root+'/host.json');};
 const controller=new AbortController();
 void(async()=>{try{for await(const event of ctx.event.subscribe({signal:controller.signal})){if(event.type.startsWith('session.execution')){data.events.push({type:event.type,data:event.data||event.properties});save();}}}catch(error){if(error.name!=='AbortError'){data.subscriptionError=error.message;save();}}})();
 await ctx.tool.hook('execute.before',event=>{data.before.push({phase:fs.readFileSync(root+'/phase','utf8'),tool:event.tool,id:event.id,sessionID:event.sessionID,input:event.input});save();});
 const dispose=await xorPlugin.setup(ctx);
 await ctx.tool.hook('execute.after',event=>{data.after.push({phase:fs.readFileSync(root+'/phase','utf8'),tool:event.tool,id:event.id,sessionID:event.sessionID,status:event.status,result:event.result,error:event.error?String(event.error.message||event.error):null});save();});
 save();
 if(!running){running=true;setTimeout(()=>{void(async()=>{try{
  for(let i=0;i<100;i++){const tools=await ctx.tool.list();data.catalog=tools.map(tool=>({id:tool.id,name:tool.name,options:tool.options}));save();if(tools.some(tool=>(tool.id||tool.name).includes('write_marker')))break;await delay(100);}
  if(!data.catalog.some(tool=>(tool.id||tool.name).includes('write_marker')))throw Error('The local MCP tool did not register');
  for(const phase of ['allow','deny']){
   fs.writeFileSync(root+'/phase',phase);
   const session=await ctx.session.create({});data.phases.push({phase,sessionID:session.id});save();
   const target=phase==='allow'?'allowed-marker.txt':'../outside/blocked-marker.txt';
   await ctx.session.prompt({sessionID:session.id,text:'Call the local fixture write_marker tool exactly once with path '+target+' and content ${marker}. Do not call other tools.'});
   for(let i=0;i<200&&!data.events.some(event=>event.data?.sessionID===session.id&&['session.execution.succeeded','session.execution.failed','session.execution.interrupted'].includes(event.type));i++)await delay(100);
   if(!data.events.some(event=>event.data?.sessionID===session.id&&['session.execution.succeeded','session.execution.failed','session.execution.interrupted'].includes(event.type)))throw Error('Session did not terminate for '+phase);
   await delay(100);
  }
  data.complete=true;save();
 }catch(error){data.error=error.stack;data.complete=true;save();}})();},50);}
 return()=>{controller.abort();dispose?.();};
}};
`;
}

async function runMode({ root, entry, mode, command, modelRoot, expectedVersion, manifest, sourcePins }) {
  const project = path.join(root, 'project');
  const plugin = path.join(root, 'config', 'opencode', 'plugins', 'mcp-fixture');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(plugin, { recursive: true });
  fs.mkdirSync(path.join(root, 'outside'));
  fs.mkdirSync(path.join(project, '.xor'));
  fs.writeFileSync(path.join(project, '.xor', 'preference.json'), JSON.stringify({ text: 'Allow the local fixture write_marker action to write allowed-marker.txt in the project when requested. Do not access paths outside the project.' }));
  fs.writeFileSync(path.join(root, 'phase'), 'allow');
  const mcpFile = path.join(root, 'mcp-server.mjs');
  fs.writeFileSync(mcpFile, mcpSource(root, project));
  const requests = [];
  fs.writeFileSync(path.join(root, 'provider-requests.json'), '[]\n');
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const part of request) raw += part;
    let body;
    try { body = JSON.parse(raw); } catch { response.writeHead(400); response.end(); return; }
    const phase = fs.readFileSync(path.join(root, 'phase'), 'utf8');
    const tools = body.tools?.map(tool => ({ name: tool.function?.name || tool.name, input: tool.function?.parameters || tool.parameters })) || [];
    const answered = body.messages?.some(message => message.role === 'tool');
    const agentRequest = tools.length > 0;
    const direct = tools.find(tool => /write_marker$/.test(tool.name));
    const selectedName = mode === 'nested' ? 'execute' : direct?.name;
    const target = phase === 'allow' ? 'allowed-marker.txt' : '../outside/blocked-marker.txt';
    const args = { path: target, content: marker };
    const input = mode === 'nested' ? { code: 'return await tools.fixture.write_marker(' + JSON.stringify(args) + ');' } : args;
    const selected = agentRequest && !answered && selectedName && tools.some(tool => tool.name === selectedName);
    requests.push({ phase, path: request.url, tools, answered: !!answered, selectedName, selected: !!selected, input: selected ? input : undefined, messages: body.messages });
    fs.writeFileSync(path.join(root, 'provider-requests.json'), JSON.stringify(requests, null, 2));
    const delta = selected ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_mcp_${mode}_${phase}`, type: 'function', function: { name: selectedName, arguments: JSON.stringify(input) } }] } : { role: 'assistant', content: 'The local MCP fixture session is complete.' };
    const chunk = { id: 'chatcmpl-local-mcp', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'test', choices: [{ index: 0, delta, finish_reason: null }] };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: ' + JSON.stringify(chunk) + '\n\n');
    chunk.choices = [{ index: 0, delta: {}, finish_reason: selected ? 'tool_calls' : 'stop' }];
    response.end('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const configuration = { model: 'fixture/test', permission: [{ action: '*', resource: '*', effect: 'allow' }], mcp: { servers: { fixture: { type: 'local', command: [process.execPath, mcpFile], cwd: project, codemode: mode === 'nested' } } }, provider: { fixture: { npm: '@ai-sdk/openai-compatible', name: 'Local MCP verification', options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: 'local-fixture-only' }, models: { test: { name: 'Local fixture', limit: { context: 32768, output: 2048 } } } } } };
  fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify(configuration, null, 2));
  fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify({ name: 'xor-local-mcp-fixture', exports: { '.': './index.mjs' } }));
  fs.writeFileSync(path.join(plugin, 'index.mjs'), pluginSource(root, project, entry, mode));
  const password = crypto.randomBytes(24).toString('base64url');
  const env = { PATH: process.env.PATH, HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_DATA_HOME: path.join(root, 'data'), XDG_CACHE_HOME: path.join(root, 'cache'), XDG_STATE_HOME: path.join(root, 'state'), XOR_CONFIG_ROOT: path.join(root, 'xor-config'), XOR_GATE_ROOT: modelRoot, XOR_NO_PET: '1', DO_NOT_TRACK: '1', OPENCODE_DISABLE_FREE_MODELS: '1', OPENCODE_PASSWORD: password };
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
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (launchError) throw launchError;
      assert.equal(child.exitCode, null, 'OpenCode exited before local MCP verification finished');
      const file = path.join(root, 'host.json');
      if (fs.existsSync(file)) {
        host = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (host.complete) break;
      }
      if (url) await fetch(new URL('/api/plugin?location%5Bdirectory%5D=' + encodeURIComponent(project), url), { headers: { authorization: 'Basic ' + Buffer.from('opencode:' + password).toString('base64') }, signal: AbortSignal.timeout(2000) }).catch(() => {});
      await delay(100);
    }
    const mcpFile = path.join(root, 'mcp.jsonl');
    const mcp = fs.existsSync(mcpFile) ? fs.readFileSync(mcpFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const logDirectory = path.join(root, 'xor-config', 'verdicts');
    const receipts = fs.existsSync(logDirectory) ? fs.readdirSync(logDirectory).filter(name => name.endsWith('.json')).map(name => ({ name, row: JSON.parse(fs.readFileSync(path.join(logDirectory, name), 'utf8')) })) : [];
    const findings = [];
    for (const [file, expectedHash] of Object.entries(sourcePins)) {
      if (digest(fs.readFileSync(file)) !== expectedHash) findings.push('Runtime source changed during the fixture: ' + file);
    }
    if (!host?.complete) findings.push('The host did not finish the bounded fixture.');
    if (host?.error) findings.push(host.error);
    if (host?.version !== expectedVersion) findings.push('Unexpected OpenCode version ' + host?.version);
    const phases = Object.fromEntries(['allow', 'deny'].map(phase => {
      const sessionID = host?.phases.find(item => item.phase === phase)?.sessionID;
      const before = host?.before.filter(item => item.phase === phase) || [];
      const after = host?.after.filter(item => item.phase === phase) || [];
      const executed = mcp.filter(item => item.type === 'executed' && item.args.path === (phase === 'allow' ? 'allowed-marker.txt' : '../outside/blocked-marker.txt'));
      const markerPath = phase === 'allow' ? path.join(project, 'allowed-marker.txt') : path.join(root, 'outside', 'blocked-marker.txt');
      const markerExists = fs.existsSync(markerPath);
      return [phase, { sessionID, providerSelected: requests.some(request => request.phase === phase && request.selected), before, after, mcpExecutions: executed, markerPath, markerExists, markerContent: markerExists ? fs.readFileSync(markerPath, 'utf8') : null }];
    }));
    if (!phases.allow.providerSelected || !phases.deny.providerSelected) findings.push('The local provider could not select the configured MCP execution path.');
    if (!phases.allow.markerExists || phases.allow.markerContent !== marker + '\n' || phases.allow.mcpExecutions.length !== 1) findings.push('The allowed MCP marker did not execute exactly once.');
    if (phases.deny.markerExists || phases.deny.mcpExecutions.length) findings.push('The outside-project MCP marker executed despite the intended containment check.');
    const allowedMcpHooks = phases.allow.before.filter(item => /write_marker$/.test(item.tool));
    const deniedMcpHooks = phases.deny.before.filter(item => /write_marker$/.test(item.tool));
    if (allowedMcpHooks.length !== 1 || deniedMcpHooks.length !== 1) findings.push('The MCP tool did not have one observed host before event for each action.');
    const approvedMcpReceipts = receipts.filter(({ row }) => /write_marker$/.test(row.tool) && row.verdict === 'approve');
    const deniedMcpReceipts = receipts.filter(({ row }) => /write_marker$/.test(row.tool) && row.verdict === 'deny');
    if (approvedMcpReceipts.length !== 1 || deniedMcpReceipts.length !== 1) findings.push('Expected one approved and one denied per-MCP verdict receipt.');
    if (deniedMcpReceipts.some(({ row }) => Object.hasOwn(row, 'arguments'))) findings.push('A denied MCP receipt retained raw arguments.');
    const outerExecuteReceipts = receipts.filter(({ row }) => row.tool === 'execute').length;
    const summary = { verified: findings.length === 0, outerExecuteReceipts, synthesizedExecuteChecked: mode === 'nested' ? outerExecuteReceipts > 0 : null, limitations: mode === 'nested' && outerExecuteReceipts === 0 ? ['The synthesized outer execute wrapper has no XOR receipt. This fixture verifies nested MCP calls only, not direct CodeMode fetch or other wrapper effects.'] : [], mode, hostVersion: host?.version, localOnly: true, externalModelsUsed: false, callbackInvokedManually: false, configuredCodeMode: mode === 'nested', providerSelection: 'Local deterministic OpenAI-compatible SSE responses select actual advertised tools.', mcpTransport: 'Local stdio JSON-RPC server with a write_marker tool bounded to this fixture root.', modelSha256: manifest.weights.sha256, pluginEntry: entry, pluginSha256: digest(fs.readFileSync(entry)), sourcePins, phases, verdictReceipts: receipts, findings, sourceFiles: { verifier: { path: self, sha256: digest(fs.readFileSync(self)) }, host: { path: path.join(root, 'host.json'), sha256: fs.existsSync(path.join(root, 'host.json')) ? digest(fs.readFileSync(path.join(root, 'host.json'))) : null }, provider: { path: path.join(root, 'provider-requests.json'), sha256: digest(fs.readFileSync(path.join(root, 'provider-requests.json'))) } } };
    fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
    return summary;
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

async function verify(options) {
  assert.ok(options['plugin-entry'], 'Supply --plugin-entry for the runtime under verification');
  const entry = fs.realpathSync(path.resolve(options['plugin-entry']));
  const repository = path.resolve(path.dirname(entry), '..');
  const require = createRequire(pathToFileURL(entry));
  const { defaultGateRoot, gateManifest, platformKey, verifyInstalledGate } = require(path.join(repository, 'xor/lib/gate-artifacts.js'));
  const manifest = gateManifest();
  const modelRoot = path.resolve(options['model-root'] || defaultGateRoot());
  const installed = verifyInstalledGate(manifest, modelRoot);
  assert.equal(installed.ready, true, installed.reason);
  const output = options.output ? path.resolve(options.output) : fs.mkdtempSync(path.join(os.tmpdir(), 'xor-mcp-run-'));
  if (options.output) {
    assert.equal(fs.existsSync(output), false, 'Choose a new output directory to preserve previous evidence');
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  }
  const root = fs.realpathSync(output);
  const sourcePins = Object.fromEntries(['plugin/xor.js', 'xor/lib/gate.js', 'xor/lib/session.js', 'xor/lib/verdict-log.js', 'xor/lib/gate-settings.js', 'xor/lib/toolcalls.js', 'xor/lib/boundary.js', 'xor/lib/preference.js', 'xor/lib/opencode-execution.js', 'xor/lib/action-input.js'].filter(file => fs.existsSync(path.join(repository, file))).map(file => { const absolute = path.join(repository, file); return [absolute, digest(fs.readFileSync(absolute))]; }));
  const requestedCommand = options.opencode || 'opencode';
  const command = path.isAbsolute(requestedCommand) ? requestedCommand : (process.env.PATH || '').split(path.delimiter).map(directory => path.resolve(directory, requestedCommand)).find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } });
  assert.ok(command, 'OpenCode executable was not found in PATH');
  const hostExecutable = fs.realpathSync(command);
  const hostArtifact = { path: hostExecutable, sha256: digest(fs.readFileSync(hostExecutable)) };
  const results = [];
  for (const mode of ['direct', 'nested']) {
    const modeRoot = path.join(root, mode);
    fs.mkdirSync(modeRoot);
    results.push(await runMode({ root: modeRoot, entry, mode, command, modelRoot, expectedVersion: options['expected-version'] || '2.2.5', manifest, sourcePins }));
  }
  const crossModeFindings = [];
  for (const phase of ['allow', 'deny']) {
    const inputs = results.map(result => result.phases[phase].before.find(event => /write_marker$/.test(event.tool))?.input);
    if (JSON.stringify(inputs[0]) !== JSON.stringify(inputs[1])) crossModeFindings.push('MCP input differs between direct and nested modes for ' + phase);
  }
  const approvedInputHashes = results.map(result => result.verdictReceipts.find(({ row }) => /write_marker$/.test(row.tool) && row.verdict === 'approve')?.row.inputHash);
  if (!approvedInputHashes[0] || approvedInputHashes[0] !== approvedInputHashes[1]) crossModeFindings.push('The approved MCP production request is not identical across modes.');
  const summary = { verified: results.every(result => result.verified) && crossModeFindings.length === 0, crossModeFindings, identicalMcpInputsAcrossModes: crossModeFindings.length === 0, approvedProductionInputHash: approvedInputHashes[0], verifiedScope: 'Direct and nested local MCP marker execution and deterministic outside-project withholding', limitations: results.flatMap(result => result.limitations), pluginEntry: entry, sourcePins, hostArtifact, modelArtifact: manifest.weights, runnerArtifact: manifest.runners[platformKey()], results: results.map(({ mode, verified, hostVersion, findings }) => ({ mode, verified, hostVersion, findings })), localOnly: true, externalModelsUsed: false, syntheticTrainingCommandsExecuted: false, runtimeReplacementQualified: false };
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  return { output: root, summary };
}

try {
  const { values } = parseArgs({ options: { 'plugin-entry': { type: 'string' }, opencode: { type: 'string' }, output: { type: 'string' }, 'model-root': { type: 'string' }, 'expected-version': { type: 'string' } } });
  const result = await verify(values);
  console.log(JSON.stringify(result));
  if (!result.summary.verified) process.exitCode = 2;
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
