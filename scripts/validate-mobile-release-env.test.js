const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseEnv, validateEntries, validateFile } = require('./validate-mobile-release-env');

const productionEnv = {
  API_BASE_URL: 'https://api.balakovo-go.ru/api',
  SOCKET_URL: 'https://api.balakovo-go.ru',
  REALTIME_ENABLED: 'true',
};

test('validates the checked-in production endpoint configuration', () => {
  const file = path.resolve(__dirname, '../.env.production');
  assert.equal(validateFile(file), true);
});

test('rejects HTTP and localhost endpoints', () => {
  assert.throws(
    () => validateEntries({ ...productionEnv, API_BASE_URL: 'http://api.balakovo-go.ru/api' }),
    /API_BASE_URL/,
  );
  assert.throws(
    () => validateEntries({ ...productionEnv, SOCKET_URL: 'http://localhost:4000' }),
    /SOCKET_URL/,
  );
});

test('rejects an unapproved host and unexpected variables such as API keys', () => {
  assert.throws(
    () => validateEntries({ ...productionEnv, API_BASE_URL: 'https://localhost/api' }),
    /API_BASE_URL/,
  );
  assert.throws(
    () => validateEntries({ ...productionEnv, MAPTILER_API_KEY: 'not-a-real-key' }),
    /only API_BASE_URL/,
  );
});

test('parses only the intended public settings from the release env file', () => {
  const entries = parseEnv(fs.readFileSync(path.resolve(__dirname, '../.env.production'), 'utf8'));
  assert.deepEqual(entries, productionEnv);
});

test('Android and iOS Release select production env without changing Debug selection', () => {
  const gradle = fs.readFileSync(path.resolve(__dirname, '../android/app/build.gradle'), 'utf8');
  const project = fs.readFileSync(
    path.resolve(__dirname, '../ios/RoadRadar.xcodeproj/project.pbxproj'),
    'utf8',
  );
  const scheme = fs.readFileSync(
    path.resolve(__dirname, '../ios/RoadRadar.xcodeproj/xcshareddata/xcschemes/RoadRadar.xcscheme'),
    'utf8',
  );
  const releaseBlock = project.match(/\/\* Release \*\/ = \{[\s\S]*?name = Release;/)?.[0];
  const debugBlock = project.match(/\/\* Debug \*\/ = \{[\s\S]*?name = Debug;/)?.[0];

  assert.match(gradle, /envConfigFiles\s*=\s*\[release:\s*"\.env\.production"\]/);
  assert.match(gradle, /name == "preReleaseBuild"/);
  assert.match(releaseBlock || '', /ENVFILE = \.env\.production;/);
  assert.doesNotMatch(debugBlock || '', /ENVFILE\s*=/);
  assert.match(project, /validate-mobile-release-env\.js/);
  assert.match(scheme, /CONFIGURATION.*Release[\s\S]*ENVFILE.*\.env\.production/);
});
