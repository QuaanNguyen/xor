'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { snapshotActionInput } = require('../../xor/lib/action-input');

test('decoded JSON arguments retain their values in a private snapshot', () => {
  const original = { path: 'file.txt', options: { offset: 0, enabled: false, tags: ['one', null] } };
  const checked = snapshotActionInput(original);
  assert.deepEqual(checked, original);
  original.options.tags.push('changed');
  assert.deepEqual(checked.options.tags, ['one', null]);
  const lookup = Object.assign(Object.create(null), { path: 'file.txt' });
  const copiedLookup = snapshotActionInput(lookup);
  assert.equal(Object.getPrototypeOf(copiedLookup), null);
  assert.equal(copiedLookup.path, 'file.txt');
  assert.deepEqual(snapshotActionInput(JSON.parse('{"__proto__":{"path":"value"}}')), JSON.parse('{"__proto__":{"path":"value"}}'));
});

test('values that JSON cannot describe exactly cannot reach an executor', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, -0, 1n, () => {}, new Date(), { path: undefined }, { value: Symbol('x') }, cycle, Array(1), { get path() { throw new Error('getter executed'); } }]) {
    assert.throws(() => snapshotActionInput(value), /Tool arguments/);
  }
});
