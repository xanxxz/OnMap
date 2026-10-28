import { mkdir, cp, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root, 'dist/vendor'), { recursive: true });
await cp(path.join(root, 'src'), path.join(root, 'dist'), { recursive: true });
for (const file of ['maplibre-gl.js', 'maplibre-gl.css'])
  await copyFile(
    path.join(root, 'node_modules/maplibre-gl/dist', file),
    path.join(root, 'dist/vendor', file),
  );
await copyFile(
  path.join(root, 'node_modules/maplibre-gl/LICENSE.txt'),
  path.join(root, 'dist/vendor/MAPLIBRE-LICENSE.txt'),
);
await copyFile(
  path.join(root, 'FONT-LICENSE.txt'),
  path.join(root, 'dist/FONT-LICENSE.txt'),
);
for (const file of ['api.js', 'app.js', 'index.html']) {
  const source = await readFile(path.join(root, 'dist', file), 'utf8');
  if (
    /onmap_owner_[A-Za-z0-9_-]{43}|BEGIN PRIVATE KEY|TELEGRAM_SESSION=/.test(
      source,
    )
  )
    throw new Error('Unexpected credential in output');
}
console.log('Local owner console built. No credentials embedded.');
