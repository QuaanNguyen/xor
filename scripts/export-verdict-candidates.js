'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { withDefaults } = require('../xor/lib/preference');
const { GATE_REQUEST_VERSION } = require('../xor/lib/gate');
const { digest, reviewPacket, validatePartitions, coverage, REVIEW_INSTRUCTIONS, REVIEW_INSTRUCTION_HASH } = require('../xor/prototype/checker-data');

function exportCandidates(receiptDirectory, contextFile, inventoryFile, output) {
  assert.ok(!fs.existsSync(output), 'Preserve existing exports; choose a new directory');
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const contexts = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  assert.ok(Array.isArray(contexts), 'Supply exact owner contexts as a JSON array');
  const validator = new Ajv({ strict: false });
  addFormats(validator);
  const ids = new Set();
  const rows = contexts.map((context) => {
    assert.match(context.receiptId, /^[a-f0-9]{64}$/);
    assert.ok(!ids.has(context.receiptId), 'Duplicate receipt context');
    ids.add(context.receiptId);
    const receipt = JSON.parse(fs.readFileSync(path.join(receiptDirectory, context.receiptId + '.json'), 'utf8'));
    assert.equal(receipt.id, context.receiptId);
    assert.equal(receipt.version, 1);
    assert.equal(receipt.requestVersion, GATE_REQUEST_VERSION, 'The production request version changed');
    assert.equal(receipt.verdict, 'approve', 'Denied or unanswered calls have no retained action to export');
    const contract = inventory.tools.find((tool) => tool.agent === receipt.agent && tool.name === receipt.tool);
    assert.ok(contract?.schemaVerified && contract.inputSchema, 'A verified tool contract is required');
    assert.ok(validator.compile(contract.inputSchema)(receipt.arguments), 'Saved arguments do not match the verified tool contract');
    assert.equal(digest(JSON.stringify(receipt.arguments)), receipt.argumentsHash, 'Saved action hash differs');
    assert.equal(digest(context.userMessage), receipt.requestHash, 'Supply the exact checked user request');
    assert.equal(digest(withDefaults(context.preference)), receipt.preferenceHash, 'Supply the exact checked Preference');
    assert.ok(typeof context.userMessage === 'string' && context.userMessage.length > 0);
    assert.ok(typeof context.family === 'string' && context.family.length > 0, 'Assign a reviewed family before splitting');
    assert.ok(['train', 'validation', 'test'].includes(context.split));
    const candidate = { id: 'runtime-' + receipt.id, family: context.family, agent: receipt.agent, tool: receipt.tool, args: receipt.arguments, preference: { text: withDefaults(context.preference).text }, userMessage: context.userMessage, split: context.split, trainingEligible: false, origin: 'local-verdict-awaiting-independent-review', sourceReceiptSha256: digest(fs.readFileSync(path.join(receiptDirectory, context.receiptId + '.json'), 'utf8')) };
    assert.equal(reviewPacket([candidate])[0].inputHash, receipt.inputHash, 'The reconstructed production request differs from the checked input');
    return candidate;
  });
  assert.ok(rows.length > 0, 'No candidate contexts supplied');
  validatePartitions(rows);
  const contents = rows.map(JSON.stringify).join('\n') + '\n';
  const requests = reviewPacket(rows);
  const manifest = { requestFormatVersion: GATE_REQUEST_VERSION, inventorySha256: digest(inventory), proposalsSha256: digest(contents), requestsSha256: digest(requests), cases: rows.length, trainingEligible: false, humanVerified: false, blind: false, solJobsAllowed: false, coverage: coverage(inventory, []) };
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [name, text] of Object.entries({ 'proposals.jsonl': contents, 'review-packet.json': JSON.stringify({ instructionHash: REVIEW_INSTRUCTION_HASH, instructions: REVIEW_INSTRUCTIONS, requests }, null, 2) + '\n', 'manifest.json': JSON.stringify(manifest, null, 2) + '\n' })) {
    fs.writeFileSync(path.join(output, name), text, { flag: 'wx', mode: 0o600 });
  }
  return manifest;
}

if (require.main === module) {
  try {
    const [receipts, contexts, inventory, output] = process.argv.slice(2);
    assert.ok(output, 'Usage: node scripts/export-verdict-candidates.js <receipt-directory> <contexts.json> <inventory.json> <new-output-directory>');
    console.log(JSON.stringify(exportCandidates(receipts, contexts, inventory, output)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { exportCandidates };
