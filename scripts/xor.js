#!/usr/bin/env node
'use strict';

const { installPlugin } = require('./install-plugin');
const { migrate } = require('./migrate');
const { handlePreference } = require('./preference');
const { handlePet } = require('./pet');
const { runDiagnostics } = require('./debug');

function usage() {
  return `Usage: xor <command>

Commands:
  install                    Repair OpenCode setup and retrieve the Needle Gate
  migrate                    Move this folder from the retired Protocol and profiles to a Preference
  preference [--all]         Edit the folder Preference or global fallback
  preference --remove        Remove this folder override
  pet on|off                 Enable or disable the Pet globally
  pet <percent>|reset        Persist and apply the Pet size
  debug                      Check the installed OpenCode integration
  help                       Show this help
`;
}

function handleMigrate() {
  const report = migrate();
  process.stdout.write(report.wrotePreference
    ? `Wrote the Preference at ${report.preferenceFile}${report.carriedDoneCriteria ? ` with ${report.carriedDoneCriteria} done criteria from the retired Protocol` : ''}.\n`
    : `Kept the Preference at ${report.preferenceFile}.\n`);
  for (const file of report.removed) process.stdout.write(`Removed ${file}.\n`);
  if (report.configFile) process.stdout.write(`Removed retired profiles from ${report.configFile}; Pet size was kept.\n`);
  if (!report.removed.length && !report.configFile) process.stdout.write('No retired Protocol or profile files were found.\n');
}

async function handleInstall() {
  console.log('Installing xor into OpenCode global plugins…');
  const result = await installPlugin({ verifyOpenCode: true });
  console.log('Plugin entry:  ' + result.dest);
  console.log('Package:       ' + result.packageDir + '  (xor + pet)');
  console.log('Pet runtime:   ' + (
    process.platform === 'darwin'
      ? result.petDir + '/native/pet-host'
      : result.petDir + '/node_modules'
  ));
  console.log('Gate:             ' + (result.gateDir || result.verifierDir) + ((result.gateReused || result.verifierReused) ? '  (already verified)' : ''));
  console.log('Done. Open any project with: opencode <path>');
}

async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }
  if (command === 'preference') return handlePreference(args.slice(1));
  if (command === 'debug' && args.length === 1) {
    const report = await runDiagnostics();
    if (!report.ok) process.exitCode = 1;
    return report;
  }
  if (command === 'pet') return handlePet(args.slice(1));
  if (command === 'migrate' && args.length === 1) return handleMigrate();
  if (command === 'install' && args.length === 1) return handleInstall();
  throw new Error(usage());
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = { main, usage };
