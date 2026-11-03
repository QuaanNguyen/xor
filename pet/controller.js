'use strict';

const { readConfig } = require('../xor/lib/config');
const { startControlServer } = require('./control');

function createPetController({ bus, launch, root, onError = () => {} }) {
  let child = null;
  let closed = false;
  let queue = Promise.resolve();
  let server = null;

  function stop() {
    const previous = child;
    child = null;
    previous?.stdin?.end();
    previous?.kill();
  }

  function start() {
    return new Promise((resolve) => {
      try {
        child = launch();
        if (!child) return resolve(false);
        const current = child;
        current.once('spawn', () => resolve(!closed && child === current));
        current.once('exit', (code) => {
          if (child === current) {
            child = null;
            if (code !== 0) onError(new Error(`The pet process exited with status ${code}. Run xor debug.`));
          }
          resolve(false);
        });
        current.once('error', (error) => {
          if (child === current) child = null;
          onError(error);
          resolve(false);
        });
      } catch (error) {
        child = null;
        onError(error);
        resolve(false);
      }
    });
  }

  async function refresh() {
    if (closed) return false;
    const loaded = readConfig(root);
    if (loaded.error) {
      stop();
      onError(loaded.error);
      return false;
    }
    const { enabled, scale } = loaded.config.pet;
    if (!enabled) {
      stop();
      return true;
    }
    if (process.env.XOR_NO_PET === '1') return false;
    if (!child && !await start()) return false;
    if (closed) return false;
    bus.emit({
      type: 'control', status: 'ok', petState: 'calm', summary: `Pet size ${scale * 100}%`,
      detail: { action: 'size', scale, percent: scale * 100 },
    });
    return true;
  }

  function reload() {
    const next = queue.then(refresh).catch((error) => { onError(error); return false; });
    queue = next;
    return next;
  }

  bus.sink = (event) => {
    if (child?.stdin?.writable && !child.stdin.destroyed) child.stdin.write(JSON.stringify(event) + '\n');
  };
  if (process.env.XOR_NO_PET !== '1') {
    try {
      server = startControlServer((control) => control?.action === 'reload' ? reload() : false, root, onError);
    } catch (error) {
      onError(error);
    }
    void reload();
  }
  return {
    ready: server?.ready || Promise.resolve(false),
    close() {
      if (closed) return;
      closed = true;
      server?.close();
      stop();
      bus.sink = null;
    },
  };
}

module.exports = { createPetController };
