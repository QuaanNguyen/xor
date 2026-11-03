'use strict';

const { installPlugin } = require('./install-plugin');

async function postinstall() {
  try {
    const result = await installPlugin({ verifyOpenCode: true });
    process.stdout.write(`XOR is ready in OpenCode: ${result.dest}\n`);
    return result;
  } catch (error) {
    throw new Error(`XOR setup failed: ${error.message}\nCorrect the reported problem, then run xor install to retry setup.`);
  }
}

if (require.main === module) {
  postinstall().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { postinstall };
