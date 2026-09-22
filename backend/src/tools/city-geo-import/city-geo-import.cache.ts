import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class CityGeoImportCache {
  constructor(
    private readonly root: string,
    private readonly refresh: boolean,
  ) {}

  async getOrLoad<T>(
    namespace: string,
    identity: unknown,
    loader: () => Promise<T>,
  ): Promise<T> {
    const key = createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex');
    const path = join(this.root, namespace, `${key}.json`);

    if (!this.refresh) {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as T;
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }

    const value = await loader();
    await atomicJsonWrite(path, value);
    return value;
  }
}

export const atomicJsonWrite = async (
  path: string,
  value: unknown,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
};

const isMissingFile = (error: unknown): boolean =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  error.code === 'ENOENT';
