'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const test = require('node:test');
const inventory = require('../../docs/checker-tool-inventory.json');
const { requestFor, validatePartitions, proposals, coverage } = require('../../xor/prototype/checker-data');

const validator = new Ajv({ strict: false });
const tool = (name) => inventory.tools.find((entry) => entry.agent === 'opencode' && entry.name === name);

test('current image inputs preserve reference and output limits without treating the old name as current', () => {
  const image = tool('experimental_image_generate');
  assert.equal(image.release, '2.2.5');
  assert.equal(image.previousNames[0].name, 'image_generate');
  assert.equal(image.previousNames[0].release, '2.2.1');
  assert.equal(tool('image_generate'), undefined);
  const valid = validator.compile(image.inputSchema);
  assert.equal(valid({ prompt: 'Draw a local project icon.', images: ['art/icon.png'], path: 'art/result.png' }), true);
  for (const input of [{ prompt: '' }, { prompt: 'Draw an icon.', images: [] }, { prompt: 'Draw an icon.', images: Array(9).fill('art/icon.png') }]) assert.equal(valid(input), false);
  assert.equal(image.integrationVerified, false);
});

test('schedule inputs preserve mutually exclusive triggers and executable condition shapes', () => {
  const create = tool('opencode.schedule_create');
  const valid = validator.compile(create.inputSchema);
  for (const input of [{ when: { in: '20 minutes' }, prompt: 'Review the report.' }, { until: { run: 'test -f build/report.txt', changes: true }, prompt: 'Review the report.' }, { when: { every: '1 hour' }, if: { code: 'return runs > 2;' }, ends: { times: 3 }, prompt: 'Review the report.' }]) assert.equal(valid(input), true);
  for (const input of [{ prompt: '' }, { when: { in: '20 minutes', every: '1 hour' }, prompt: 'Review.' }, { if: { run: 'echo ok', code: 'return true;' }, prompt: 'Review.' }, { ends: { times: 0 }, prompt: 'Review.' }, { ends: { times: 1.5 }, prompt: 'Review.' }]) assert.equal(valid(input), false);
  const request = requestFor({ tool: create.name, args: { until: { run: 'touch hidden-side-effect' }, prompt: 'Review.' }, preference: { text: 'Do not write files.' }, userMessage: 'Inspect the project.' });
  assert.match(request.query, /touch hidden-side-effect/);
  assert.equal(create.integrationVerified, false);
});

test('schedule controls use the pinned session-owned schedule identity contract', () => {
  for (const name of ['pause', 'resume', 'delete']) {
    const entry = tool('opencode.schedule_' + name);
    const valid = validator.compile(entry.inputSchema);
    assert.equal(valid({ id: 'sch_weather' }), true);
    assert.equal(valid({ id: 'weather' }), false);
    assert.equal(valid({}), false);
    assert.equal(entry.integrationVerified, false);
  }
  assert.equal(validator.compile(tool('opencode.schedule_list').inputSchema)({}), true);
});

test('refreshed contracts enter existing coverage checks without implying reviewed data or runtime coverage', () => {
  const refresh = inventory.refreshes.find((entry) => entry.agent === 'opencode' && entry.release === '2.2.5');
  assert.equal(refresh.schemaLibrary, 'effect@4.0.6');
  assert.ok(refresh.sources.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  const rows = proposals(inventory);
  validatePartitions(rows);
  const report = coverage(inventory, []);
  for (const name of ['experimental_image_generate', 'opencode.schedule_create', 'opencode.schedule_list', 'opencode.schedule_pause', 'opencode.schedule_resume', 'opencode.schedule_delete']) {
    assert.ok(report.missing.some((gap) => gap.startsWith('opencode:' + name + ':')));
    assert.equal(tool(name).schemaVerified, true);
    assert.equal(tool(name).integrationVerified, false);
  }
});
