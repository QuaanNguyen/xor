'use strict';

function snapshotActionInput(value) {
  const seen = new Set();
  function copy(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item) && !Object.is(item, -0)) return item;
    if (typeof item !== 'object' || item === null || seen.has(item)) throw new Error('Tool arguments must contain independent JSON values without cycles or unsupported values');
    seen.add(item);
    const array = Array.isArray(item);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('Tool arguments must use plain JSON objects');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Tool arguments cannot contain symbol properties');
    const result = array ? [] : Object.create(Object.getPrototypeOf(item));
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Tool arguments cannot contain hidden properties or accessors');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) throw new Error('Tool arrays cannot contain named properties');
      Object.defineProperty(result, key, { value: copy(descriptor.value), enumerable: true, writable: true, configurable: true });
    }
    if (array && Object.keys(result).length !== item.length) throw new Error('Tool arguments cannot contain sparse arrays');
    return result;
  }
  return copy(value);
}

module.exports = { snapshotActionInput };
