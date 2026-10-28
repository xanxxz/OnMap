import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminServer, HOST, PORT } from '../server.mjs';
import { request } from 'node:http';
const localRequest = (url, host) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      { headers: host ? { Host: host } : {} },
      response => {
        let text = '';
        response.on('data', chunk => (text += chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: new Headers(response.headers),
            json: async () => JSON.parse(text),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
test('binds only loopback and rejects credential URLs', () => {
  assert.equal(HOST, '127.0.0.1');
  assert.equal(PORT, 4173);
  assert.throws(() => createAdminServer('http://remote/api'));
  assert.throws(() => createAdminServer('https://user:password@remote/api'));
});
test('guards Host header against DNS rebinding; exposes only the nonsecret config', async () => {
  const server = createAdminServer('https://mock.example/api');
  await new Promise(resolve => server.listen(0, HOST, resolve));
  const address = server.address();
  try {
    const base = `http://${HOST}:${address.port}`;
    const rejected = await localRequest(base + '/config.json');
    assert.equal(rejected.status, 403);
    const config = await localRequest(base + '/config.json', `${HOST}:${PORT}`);
    assert.deepEqual(await config.json(), {
      apiUrl: 'https://mock.example/api',
    });
    assert(
      config.headers
        .get('Content-Security-Policy')
        .includes("frame-ancestors 'none'"),
    );
    assert.equal(config.headers.get('Cache-Control'), 'no-store');
    const env = await localRequest(base + '/.env', `${HOST}:${PORT}`);
    assert.equal(env.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
