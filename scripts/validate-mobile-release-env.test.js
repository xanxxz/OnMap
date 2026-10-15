const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseEnv, validateEntries, validateFile } = require('./validate-mobile-release-env');
const { validateGeneratedConfigContents } = require('./validate-ios-release-config');

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

test('accepts only the generated native iOS config with production endpoints', () => {
  assert.throws(
    () => validateGeneratedConfigContents(
      '@"API_BASE_URL":@"http://localhost:4000/api"',
      productionEnv,
    ),
    /Native Release config does not contain the approved API_BASE_URL/,
  );
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
  const podfile = fs.readFileSync(path.resolve(__dirname, '../ios/Podfile'), 'utf8');
  const releaseBlock = project.match(/\/\* Release \*\/ = \{[\s\S]*?name = Release;/)?.[0];
  const debugBlock = project.match(/\/\* Debug \*\/ = \{[\s\S]*?name = Debug;/)?.[0];

  assert.match(gradle, /envConfigFiles\s*=\s*\[release:\s*"\.env\.production"\]/);
  assert.match(gradle, /name == "preReleaseBuild"/);
  assert.match(releaseBlock || '', /ENVFILE = \.env\.production;/);
  assert.doesNotMatch(debugBlock || '', /ENVFILE\s*=/);
  assert.match(project, /validate-mobile-release-env\.js/);
  assert.match(scheme, /CONFIGURATION.*Release[\s\S]*ENVFILE.*\.env\.production/);
  assert.match(podfile, /pod_target\.name == 'react-native-config'[\s\S]*build_configuration\.name == 'Release' \? '\.env\.production' : '\.env'/);
  assert.match(project, /validate-ios-release-config\.js/);
});

test('Android Release application ID matches iOS Release while Debug remains separately installable', () => {
  const gradle = fs.readFileSync(path.resolve(__dirname, '../android/app/build.gradle'), 'utf8');
  const project = fs.readFileSync(
    path.resolve(__dirname, '../ios/RoadRadar.xcodeproj/project.pbxproj'),
    'utf8',
  );
  const releaseBlock = project.match(/\/\* Release \*\/ = \{[\s\S]*?name = Release;/)?.[0];
  const debugBuildType = gradle.match(/buildTypes\s*\{\s*debug\s*\{([\s\S]*?)\n\s*\}/)?.[1];

  assert.match(gradle, /namespace "com\.roadradar\.app"/);
  assert.match(gradle, /applicationId "com\.onmap\.app"/);
  assert.match(debugBuildType || '', /applicationIdSuffix "\.dev"/);
  assert.match(releaseBlock || '', /PRODUCT_BUNDLE_IDENTIFIER = com\.onmap\.app;/);
  assert.match(gradle, /apply plugin: "com\.google\.gms\.google-services"/);
  assert.doesNotMatch(gradle, /if \(file\("google-services\.json"\)\.exists\(\)\)/);
  assert.match(gradle, /processDebugGoogleServices[\s\S]*src\/debug\/google-services\.json/);
  assert.equal((gradle.match(/firebase-messaging:/g) || []).length, 1);
});
