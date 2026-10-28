import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli =
  process.env.PLAYWRIGHT_CLI ||
  path.join(homedir(), '.codex/skills/playwright/scripts/playwright_cli.sh');
const session = 'onmap-redesign-qa';
const run = args => {
  const r = spawnSync(cli, ['--session', session, ...args], {
    cwd: path.dirname(root),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.error)
    throw new Error(
      'Playwright CLI unavailable. Set PLAYWRIGHT_CLI to its executable wrapper.',
    );
  const output = r.stdout + r.stderr;
  if (r.status || output.includes('### Error')) {
    const start = output.lastIndexOf('### Error');
    process.stderr.write((start >= 0 ? output.slice(start) : output) + '\n');
    process.exit(1);
  }
  return output;
};
spawnSync(cli, ['--session', session, 'close'], { encoding: 'utf8' });
run(['open', 'http://127.0.0.1:4173', '--headed']);
const fixture = (
  await readFile(path.join(root, 'test/browser-fixture.mjs'), 'utf8')
).replace('export default ', '');
const scenario = (
  await readFile(path.join(root, 'test/browser-scenario.mjs'), 'utf8')
).replace('export default ', '');
const edges = (
  await readFile(path.join(root, 'test/browser-edge-cases.mjs'), 'utf8')
).replace('export default ', '');
const visual = (
  await readFile(path.join(root, 'test/browser-visual-cases.mjs'), 'utf8')
).replace('export default ', '');
const polish = (
  await readFile(path.join(root, 'test/browser-polish-cases.mjs'), 'utf8')
).replace('export default ', '');
const execution = process.argv.includes('--controls-only')
  ? 'const fixture=await installFixture(page);await page.reload();const polish=await runPolishCases(page,fixture);if(errors.length)throw new Error(errors.join("; "));return {polish,uncaughtJsErrors:errors.length};'
  : 'const fixture=await installFixture(page);await page.reload();const main=await runScenario(page,fixture);const edge=await runEdgeCases(page,fixture);const polishFixture=await installFixture(page);await page.reload();const polish=await runPolishCases(page,polishFixture);const visualFixture=await installFixture(page);await page.reload();const visual=await runVisualCases(page,visualFixture);if(errors.length)throw new Error(errors.join("; "));return {main,edge,polish,visual,uncaughtJsErrors:errors.length};';
const output = run([
  'run-code',
  `async(page)=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));${fixture}\n${scenario}\n${edges}\n${visual}\n${polish}\n${execution}}`,
]);
const result = output.indexOf('### Result');
if (result < 0)
  throw new Error(
    'Browser run interrupted before returning results: ' + output.slice(-1800),
  );
console.log(
  result >= 0
    ? output.slice(
        result,
        output.indexOf('### Ran', result) > result
          ? output.indexOf('### Ran', result)
          : result + 1500,
      )
    : 'Browser scenario completed.',
);
