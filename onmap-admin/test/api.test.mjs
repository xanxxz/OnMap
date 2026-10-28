import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnerApi, apiUrl, cityDateToIso, localDateTime } from '../src/api.js';
import { readFile } from 'node:fs/promises';
test('requires HTTPS without embedded credentials', () => {
  for (const value of [
    'http://127.0.0.1/api',
    'https://name:password@host/api',
    'https://host/api?token=x',
  ])
    assert.throws(() => apiUrl(value));
  assert.equal(apiUrl('https://example.com/api/'), 'https://example.com/api');
});
test('keeps credentials in memory, passes owner authorization and preserves an explicit retry key', async () => {
  const api = new OwnerApi();
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: 'one' }), { status: 200 });
  };
  try {
    api.connect('https://mock.example/api', 'test-only');
    await api.request('/points', {
      method: 'POST',
      body: { title: 'one' },
      key: 'repeat-key',
    });
    await api.request('/points', {
      method: 'POST',
      body: { title: 'one' },
      key: 'repeat-key',
    });
    assert.equal(
      calls[0].options.headers.get('Authorization'),
      'Bearer test-only',
    );
    assert.equal(
      calls[0].options.headers.get('Idempotency-Key'),
      calls[1].options.headers.get('Idempotency-Key'),
    );
    assert.equal(JSON.stringify(api), '{}');
    api.disconnect();
    await assert.rejects(() => api.request('/points'));
  } finally {
    globalThis.fetch = saved;
  }
});
test('expires session after server rejects it, sanitizes no token into a URL', async () => {
  const api = new OwnerApi();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert(!url.includes('test-only'));
    return new Response(JSON.stringify({ message: 'Expired' }), {
      status: 401,
    });
  };
  try {
    api.connect('https://mock.example/api', 'test-only');
    await assert.rejects(() => api.request('/session'), /Expired/);
    assert.equal(api.connected, false);
  } finally {
    globalThis.fetch = original;
  }
});
test('converts date with city IANA timezone independently from the computer', () => {
  assert.equal(
    cityDateToIso('2026-10-28T12:30', 'Europe/Saratov'),
    '2026-10-28T08:30:00.000Z',
  );
  assert.equal(
    localDateTime('2026-10-28T08:30:00Z', 'Europe/Saratov'),
    '2026-10-28T12:30',
  );
  assert.throws(() => cityDateToIso('2026-02-30T12:00', 'Europe/Saratov'));
});
test('does not persist credentials or count preview/read as mobile interactions', async () => {
  for (const file of ['api.js', 'app.js']) {
    const source = await readFile(
      new URL('../src/' + file, import.meta.url),
      'utf8',
    );
    assert(
      !/localStorage|sessionStorage|document\.cookie|partner-placements\/interaction/.test(
        source,
      ),
    );
  }
  const html = await readFile(
    new URL('../src/index.html', import.meta.url),
    'utf8',
  );
  assert(html.includes('type="password"'));
  assert(html.includes('autocomplete="off"'));
});

test('reuses generated mutation key after a network error', async () => {
  const client = new OwnerApi();
  client.connect('https://mock.example/api', 'test-only');
  const original = globalThis.fetch;
  const keys = [];
  globalThis.fetch = async (_url, options) => {
    keys.push(options.headers.get('Idempotency-Key'));
    if (keys.length === 1) throw new Error('network');
    return new Response(JSON.stringify({ id: 'one' }), { status: 200 });
  };
  try {
    await assert.rejects(() =>
      client.request('/points/one/actions/pause', { method: 'POST' }),
    );
    await client.request('/points/one/actions/pause', { method: 'POST' });
    assert.equal(keys[0], keys[1]);
  } finally {
    globalThis.fetch = original;
  }
});

test('keeps HTTP status and validation messages for inline errors and conflict recovery', async () => {
  const { ApiError } = await import('../src/api.js');
  const client = new OwnerApi();
  client.connect('https://mock.example/api', 'test-only');
  const original = globalThis.fetch;
  try {
    for (const status of [400, 409]) {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            message: ['title must be shorter than or equal to 160 characters'],
          }),
          { status },
        );
      await assert.rejects(
        () =>
          client.request('/points/one', {
            method: 'PUT',
            body: { title: 'one' },
          }),
        error =>
          error instanceof ApiError &&
          error.status === status &&
          error.messages[0].startsWith('title'),
      );
      assert.equal(client.connected, true);
    }
  } finally {
    globalThis.fetch = original;
  }
});
