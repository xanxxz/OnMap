#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_VALUES = Object.freeze({
  API_BASE_URL: 'https://api.balakovo-go.ru/api',
  SOCKET_URL: 'https://api.balakovo-go.ru',
  REALTIME_ENABLED: 'true',
});

function parseEnv(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(entries, match[1])) {
      throw new Error('Invalid or duplicate setting in Release env file.');
    }

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[match[1]] = value;
  }

  return entries;
}

function validateEntries(entries) {
  const keys = Object.keys(entries).sort();
  const expectedKeys = Object.keys(EXPECTED_VALUES).sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      'Release env must contain only API_BASE_URL, SOCKET_URL, and REALTIME_ENABLED.',
    );
  }

  for (const [key, expected] of Object.entries(EXPECTED_VALUES)) {
    if (entries[key] !== expected) {
      throw new Error(`${key} must use the approved production value.`);
    }
    if (key !== 'REALTIME_ENABLED') {
      let parsed;
      try {
        parsed = new URL(entries[key]);
      } catch {
        throw new Error(`${key} must be a valid HTTPS URL.`);
      }
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'api.balakovo-go.ru' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(`${key} must use the approved HTTPS host without credentials.`);
      }
    }
  }

  return true;
}

function validateFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const entries = parseEnv(fs.readFileSync(absolutePath, 'utf8'));
  validateEntries(entries);
  return true;
}

if (require.main === module) {
  const envFile = process.argv[2] || path.resolve(__dirname, '../.env.production');
  try {
    validateFile(envFile);
    process.stdout.write('Mobile Release env validated.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseEnv, validateEntries, validateFile };
