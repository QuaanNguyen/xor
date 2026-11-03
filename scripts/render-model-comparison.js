'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/experiments/model-0.1.5-results.json')));
const groups = [
  ['Policy and permission rules', 'policy-validation'],
  ['Historical controls', 'historical-validation'],
  ['Deletion and confirmation additions', 'deletion-development'],
];
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const elements = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="430" viewBox="0 0 960 430" role="img" aria-labelledby="title description">',
  '<title id="title">XOR 0.1.4 baseline versus 0.1.5 model</title>',
  '<desc id="description">Correct decisions on inspected development cases. Policy 96 versus 97 of 100. Historical 115 versus 116 of 122. Deletion additions 21 versus 19 of 27. Training fit is excluded. The new model introduces five unsafe approvals.</desc>',
  '<rect width="960" height="430" fill="#F5FBFF"/>',
  '<g font-family="Arial, sans-serif" fill="#16324A">',
  '<text x="28" y="36" font-size="23" font-weight="700">Correct decisions on development controls</text>',
  '<rect x="28" y="56" width="14" height="14" fill="#94A3B8"/><text x="50" y="68" font-size="15">0.1.4 baseline</text>',
  '<rect x="220" y="56" width="14" height="14" fill="#4AAEED"/><text x="242" y="68" font-size="15">0.1.5 released model</text>',
];
for (let index = 0; index < groups.length; index += 1) {
  const [label, key] = groups[index];
  const suite = report.suites[key];
  const members = report.rows.filter((row) => row.suites.includes(key));
  const y = 104 + index * 91;
  elements.push(`<text x="28" y="${y + 24}" font-size="16">${escape(label)}</text>`);
  for (const [offset, side, color] of [[0, 'baseline', '#94A3B8'], [29, 'candidate', '#4AAEED']]) {
    const result = suite[side];
    assert.equal(result.cases, members.length);
    assert.equal(result.correct, members.filter((row) => row[side].length === 5 && row[side].every((verdict) => verdict === row.expected)).length);
    const percentage = 100 * result.correct / result.cases;
    elements.push(`<rect x="350" y="${y + offset}" width="460" height="21" fill="#E6EEF4"/>`);
    elements.push(`<rect x="350" y="${y + offset}" width="${(4.6 * percentage).toFixed(2)}" height="21" fill="${color}"/>`);
    elements.push(`<text x="822" y="${y + offset + 16}" font-size="14">${result.correct}/${result.cases} (${percentage.toFixed(1)}%)</text>`);
  }
}
elements.push('<text x="28" y="389" font-size="15">Inspected development data. Five native rounds per case. Suites overlap.</text>');
elements.push('<text x="28" y="414" font-size="15">0.1.5 introduces five unsafe approvals. Frozen test data remains unscored.</text></g></svg>');
fs.writeFileSync(path.join(root, 'docs/model-0.1.5-comparison.svg'), elements.join('\n') + '\n');
process.stdout.write('Model comparison matches all three saved development suites.\n');
