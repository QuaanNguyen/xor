'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SOURCES = {
  'schema.ts': ['packages/schema/src/schema.ts', 'fc76a9937980e518343e1ae49661316fbbfbd8a34bd44701874bedaa2319b8f2'],
  'tool.ts': ['packages/core/src/tool.ts', 'ed25447604cae9518d3cb9b15e8271da12c2b29a2ccfd73951a6f5ea558b11fd'],
  'schedule.ts': ['packages/core/src/tool/plugin/schedule.ts', '8e4a17b995ae61f9bcfdc97ac99c198808d515f3cc691b66427c93ccb662c154'],
  'schedule-schema.ts': ['packages/schema/src/schedule.ts', '7201bd97af4d9facd8dfb0d7d269eb1763b1e7b52466bc412ed1efce0874c9a3'],
  'image-generate.ts': ['packages/core/src/tool/plugin/image-generate.ts', '249f93ee7777bf93c025f97709c26ef7b0facf14842a37c8805a122d935cbdec'],
  'image-generate-2.2.1.ts': ['packages/core/src/tool/plugin/image-generate.ts', 'b33ffcfef9e30b6b942ae79fab6b56ac12aaf7d526b764d27576043cf76f3da2', '2.2.1'],
  'image-generate-2.2.2.ts': ['packages/core/src/tool/plugin/image-generate.ts', '249f93ee7777bf93c025f97709c26ef7b0facf14842a37c8805a122d935cbdec', '2.2.2'],
};

function strip(value, context = '') {
  if (Array.isArray(value)) return value.map((item) => strip(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => ['properties', 'definitions', '$defs', 'patternProperties'].includes(context) || !['description', 'title', '$schema', 'default', 'examples'].includes(key)).map(([key, item]) => [key, strip(item, key)]));
}

async function refresh(sourceDirectory, dependencyDirectory, inventoryFile, outputFile) {
  const source = {};
  const receipts = Object.entries(SOURCES).map(([file, [upstream, sha256, version = '2.2.5']]) => {
    const bytes = fs.readFileSync(path.join(sourceDirectory, file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sha256, `Pinned source differs: ${file}`);
    source[file] = bytes.toString('utf8');
    return { file, sourceUrl: `https://github.com/anomalyco/opencode/blob/v${version}/${upstream}`, sha256, release: version };
  });
  const dependency = (name) => path.resolve(dependencyDirectory, 'node_modules', name);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dependency('effect'), 'package.json'))).version, '4.0.6');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dependency('typescript'), 'package.json'))).version, '6.0.2');
  const ts = require(dependency('typescript'));
  const effect = await import(pathToFileURL(path.join(dependency('effect'), 'dist/index.js')).href);
  const ast = (file) => ts.createSourceFile(file, source[file], ts.ScriptTarget.Latest, true);
  const declarations = (file, names) => {
    const tree = ast(file);
    const found = [];
    for (const statement of tree.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (names.includes(declaration.name.getText(tree))) found.push(`const ${declaration.getText(tree)};`);
      }
    }
    assert.equal(found.length, names.length, `Schema declarations changed in ${file}`);
    return found.join('\n');
  };
  const evaluate = (code, names, values = {}) => {
    const javascript = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true } }).outputText;
    return new Function('effect', ...Object.keys(values), `const { Schema, Option, SchemaGetter } = effect;\n${javascript}\nreturn {${names.join(',')}};`)(effect, ...Object.values(values));
  };
  const helpers = declarations('schema.ts', ['PositiveInt', 'optional', 'withStatics', 'statics']);
  const schedule = evaluate(helpers + '\n' + declarations('schedule-schema.ts', ['ID', 'DurationString', 'zone', 'In', 'At', 'Every', 'Cron', 'Ends', 'absent', 'WhenInput', 'ShellConditionInput', 'CodeConditionInput', 'ConditionInput', 'Request']), ['ID', 'Request']);
  const scheduleInputs = evaluate(declarations('schedule.ts', ['IDInput']), ['IDInput'], { Schedule: schedule });
  const image = evaluate(declarations('image-generate.ts', ['name', 'Input']), ['name', 'Input']);
  const oldImage = evaluate(declarations('image-generate-2.2.1.ts', ['name', 'Input']), ['name', 'Input']);
  const schema = (input) => {
    const document = effect.Schema.toJsonSchemaDocument(input);
    return strip({ ...document.schema, $defs: document.definitions });
  };
  const tools = [];
  const add = (name, input, file, examples, requests, extra = {}) => tools.push({ agent: 'opencode', name, release: '2.2.5', checkedAt: '2026-11-03', sourceUrl: receipts.find((item) => item.file === file).sourceUrl, sourceSha256: SOURCES[file][1], inputSchema: schema(input), schemaVerified: true, hookable: true, integrationVerified: false, gap: 'The pinned source registers an ordinary tool and a before-execution hook. Real direct and nested interception, native verdicts, and feature-specific availability remain unverified.', examples, requests, ...extra });
  add(image.name, image.Input, 'image-generate.ts', [{ prompt: 'Create a blue line drawing of a fictional weather station.', path: 'art/weather.png' }, { prompt: 'Simplify this fictional transit icon.', images: ['art/transit.png'], path: 'art/transit-simple.png' }, { prompt: 'Draw a fictional library sign.', path: 'art/library.png' }], ['Create the requested weather-station illustration.', 'Edit the local transit icon as requested.', 'Create a library sign for this project.'], { availability: 'Registered when an image model is available unless explicitly disabled. The tool is outside Code Mode.', previousNames: [{ name: oldImage.name, release: '2.2.1', sourceUrl: receipts.find((item) => item.file === 'image-generate-2.2.1.ts').sourceUrl, sourceSha256: SOURCES['image-generate-2.2.1.ts'][1] }] });
  const tree = ast('schedule.ts');
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'add' && ts.isObjectLiteralExpression(node.arguments[0])) {
      const properties = new Map(node.arguments[0].properties.filter(ts.isPropertyAssignment).map((property) => [property.name.getText(tree), property.initializer]));
      if (properties.has('input')) {
        const name = properties.get('name').text;
        const options = properties.get('options');
        const namespace = options.properties.find((property) => property.name.getText(tree) === 'namespace').initializer.text;
        const expression = properties.get('input').getText(tree);
        const input = new Function('Schema', 'Schedule', 'IDInput', `return (${expression});`)(effect.Schema, schedule, scheduleInputs.IDInput);
        const examples = name.endsWith('_create') ? [{ when: { in: '20 minutes' }, prompt: 'Review the local weather report.' }, { when: { every: '1 hour' }, if: { run: 'test -f build/report.txt' }, ends: { times: 3 }, prompt: 'Review the generated report.' }, { until: { code: 'return runs > 2;' }, prompt: 'Review the completed local task.' }] : name.endsWith('_list') ? [{}, {}, {}] : [{ id: 'sch_weather' }, { id: 'sch_transit' }, { id: 'sch_library' }];
        add(`${namespace}.${name}`, input, 'schedule.ts', examples, [`Perform the requested ${name} operation for the weather task.`, `Perform the requested ${name} operation for the transit task.`, `Perform the requested ${name} operation for the library task.`], { schemaDependencies: receipts.filter((item) => ['schedule-schema.ts', 'schema.ts'].includes(item.file)), availability: 'Requires experimental.schedules. Registered in the opencode Code Mode namespace. Shell and Code Mode conditions may run unattended; their individual interception remains unverified.' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(tools.length, 6);
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const identities = new Set(tools.map((tool) => `${tool.agent}:${tool.name}`));
  inventory.tools = [...inventory.tools.filter((tool) => !identities.has(`${tool.agent}:${tool.name}`)), ...tools];
  const receipt = { agent: 'opencode', release: '2.2.5', checkedAt: '2026-11-03', scope: 'Image generation and schedule tools only; the remainder retains its original source dates.', schemaLibrary: 'effect@4.0.6', schemaCompiler: '@typescript/typescript6@6.0.2', sources: receipts };
  inventory.refreshes = [...(inventory.refreshes || []).filter((entry) => entry.agent !== receipt.agent || entry.release !== receipt.release || entry.scope !== receipt.scope), receipt];
  fs.writeFileSync(outputFile, JSON.stringify(inventory, null, 2) + '\n');
  return { addedOrRefreshed: tools.map((tool) => tool.name), totalTools: inventory.tools.length, integrationVerified: false };
}

if (require.main === module) refresh(...process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { refresh };
