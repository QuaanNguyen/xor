'use strict';

const { readConfig } = require('../xor/lib/config');
const { startControlServer } = require('./control');

function createPetController({ bus, launch, root, onError = () => {} }) {
  let child = null;
  let closed = false;

  function stop() {
    const previous = child;
    child = null;
    previous?.stdin?.end();
    previous?.kill();
  }

  function refresh() {
    if (closed) return false;
    const loaded = readConfig(root);
    if (loaded.error) {
      stop();
      onError(loaded.error);
      return false;
    }
    const { enabled, scale } = loaded.config.pet;
    if (!enabled || process.env.XOR_NO_PET === '1') {
      stop();
      return true;
    }
    if (!child) {
      child = launch();
      if (!child) return false;
      const current = child;
      current.once('exit', () => { if (child === current) child = null; });
      current.once('error', (error) => {
        if (child === current) child = null;
        onError(error);
      });
    }
    bus.emit({
      type: 'control', status: 'ok', petState: 'calm', summary: `Pet size ${scale * 100}%`,
      detail: { action: 'size', scale, percent: scale * 100 },
    });
    return true;
  }

  bus.sink = (event) => {
    if (child?.stdin?.writable && !child.stdin.destroyed) child.stdin.write(JSON.stringify(event) + '\n');
  };
  const server = startControlServer((control) => control?.action === 'reload' && refresh(), root);
  refresh();
  return {
    ready: server.ready,
    close() {
      if (closed) return;
      closed = true;
      server.close();
      stop();
      bus.sink = null;
    },
  };
}

module.exports = { createPetController };
