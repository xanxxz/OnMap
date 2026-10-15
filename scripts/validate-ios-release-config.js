#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv, validateEntries } = require('./validate-mobile-release-env');

function validateGeneratedConfig(generatedConfig, envFile) {
  const expected = parseEnv(fs.readFileSync(path.resolve(envFile), 'utf8'));
  const generated = fs.readFileSync(path.resolve(generatedConfig), 'utf8');
  return validateGeneratedConfigContents(generated, expected);
}

function validateGeneratedConfigContents(generated, expected) {
  validateEntries(expected);
  for (const key of ['API_BASE_URL', 'SOCKET_URL']) {
    const expectedPair = `@"${key}":@"${expected[key]}"`;
    if (!generated.includes(expectedPair)) {
      throw new Error(`Native Release config does not contain the approved ${key}.`);
    }
  }

  if (/https?:\\?\/\\?\/localhost|192\.168\.|10\.0\.2\.2/iu.test(generated)) {
    throw new Error('Native Release config contains a local development endpoint.');
  }
  return true;
}

if (require.main === module) {
  try {
    validateGeneratedConfig(process.argv[2], process.argv[3]);
    process.stdout.write('iOS native Release API configuration validated.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validateGeneratedConfig, validateGeneratedConfigContents };
