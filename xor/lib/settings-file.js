'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readSettingsFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let candidate = file;
    while (true) {
      let entry;
      try {
        entry = fs.lstatSync(candidate);
      } catch (ancestorError) {
        if (ancestorError.code !== 'ENOENT') throw ancestorError;
        const parent = path.dirname(candidate);
        if (parent === candidate) throw error;
        candidate = parent;
        continue;
      }
      if (entry.isSymbolicLink()) entry = fs.statSync(candidate);
      if (candidate === file || !entry.isDirectory()) throw error;
      return null;
    }
  }
}

module.exports = { readSettingsFile };
