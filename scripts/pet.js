'use strict';

const { parseSizeArgument } = require('../events/size-command');
const { sendControl } = require('../pet/control');
const { readConfig, writeConfig } = require('../xor/lib/config');

async function handlePet(args) {
  const values = args[0] === 'size' ? args.slice(1) : args;
  if (values.length !== 1) throw new Error('Use xor pet on, off, <percent>, or reset.');
  const value = values[0];
  const size = parseSizeArgument(value);
  if (!['on', 'off'].includes(value) && !size) throw new Error('Pet size must be a positive finite percentage, or reset.');
  const loaded = readConfig();
  if (loaded.error) throw new Error(`xor configuration is invalid: ${loaded.error.message}`);
  if (size) loaded.config.pet.scale = size.scale;
  else loaded.config.pet.enabled = value === 'on';
  writeConfig(loaded.config);
  const applied = await sendControl({ action: 'reload' });
  const status = size ? `Pet size set to ${size.percent}%.` : `Pet mode ${value}.`;
  process.stdout.write(`${status} ${applied ? 'Applied to active sessions.' : 'Saved for future sessions.'}\n`);
}

module.exports = { handlePet };
