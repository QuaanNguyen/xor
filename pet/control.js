'use strict';

const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { defaultConfigRoot } = require('../xor/lib/config');

function controlDirectory(root) {
  return path.join(root, 'pet-controls');
}

function controlSocketPath(root = defaultConfigRoot(), id = 'legacy') {
  const scope = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\xor-pet-${scope}-${id}`
    : path.join(os.tmpdir().length <= 25 ? os.tmpdir() : '/tmp', `xor-pet-${scope}-${id}.sock`);
}

function sendOne(control, root, id) {
  return new Promise((resolve) => {
    const socket = net.createConnection(controlSocketPath(root, id));
    let finished = false;
    const finish = (applied) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(applied);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('error', (error) => {
      if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
        try { fs.unlinkSync(path.join(controlDirectory(root), id)); } catch {}
      }
      finish(false);
    });
    socket.once('data', (result) => finish(result.toString() === 'ok'));
    socket.once('end', () => finish(false));
    socket.once('close', () => finish(false));
    socket.once('connect', () => socket.end(JSON.stringify(control) + '\n'));
  });
}

async function sendControl(control, root = defaultConfigRoot()) {
  let ids;
  try {
    ids = fs.readdirSync(controlDirectory(root)).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const results = await Promise.all(ids.map((id) => sendOne(control, root, id)));
  return results.some(Boolean);
}

function startControlServer(onControl, root = defaultConfigRoot(), onError = () => {}) {
  const id = randomUUID();
  const socket = controlSocketPath(root, id);
  const registry = path.join(controlDirectory(root), id);
  fs.mkdirSync(controlDirectory(root), { recursive: true, mode: 0o700 });
  const connections = new Set();
  let closed = false;
  let settleReady;
  const ready = new Promise((resolve) => { settleReady = resolve; });
  const server = net.createServer({ allowHalfOpen: true }, (connection) => {
    connections.add(connection);
    connection.unref();
    connection.setTimeout(1000, () => connection.destroy());
    connection.setEncoding('utf8');
    let input = '';
    connection.on('error', () => {});
    connection.on('close', () => connections.delete(connection));
    connection.on('data', (chunk) => {
      input += chunk;
      if (input.length > 4096) connection.destroy();
    });
    connection.on('end', () => {
      Promise.resolve().then(() => onControl(JSON.parse(input)))
        .then((accepted) => { if (!connection.destroyed) connection.end(accepted === true ? 'ok' : 'denied'); })
        .catch(() => { if (!connection.destroyed) connection.end('denied'); });
    });
  });
  server.unref();
  server.on('error', (error) => {
    settleReady(false);
    onError(error);
  });
  server.listen(socket, () => {
    if (closed) return;
    try {
      if (process.platform !== 'win32') fs.chmodSync(socket, 0o600);
      fs.writeFileSync(registry, '', { mode: 0o600 });
      settleReady(true);
    } catch (error) {
      server.close();
      if (process.platform !== 'win32') { try { fs.unlinkSync(socket); } catch {} }
      settleReady(false);
      onError(error);
    }
  });
  return {
    ready,
    close() {
      if (closed) return;
      closed = true;
      settleReady(false);
      for (const connection of connections) connection.destroy();
      server.close();
      try { fs.unlinkSync(registry); } catch {}
      if (process.platform !== 'win32') {
        try { fs.unlinkSync(socket); } catch {}
      }
    },
  };
}

module.exports = { controlSocketPath, sendControl, startControlServer };
