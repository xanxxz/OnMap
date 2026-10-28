/** @param {string} raw */
export function apiUrl(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Нужен HTTPS URL backend без пароля и query-параметров');
  return url.href.replace(/\/$/, '');
}
export class ApiError extends Error {
  constructor(message, status = 0, messages = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
  }
}
export class OwnerApi {
  #token = '';
  #base = '';
  #retryKeys = new Map();
  /** @param {string} base @param {string} token */
  connect(base, token) {
    this.#base = apiUrl(base);
    this.#token = token.trim();
  }
  disconnect() {
    this.#token = '';
    this.#base = '';
    this.#retryKeys.clear();
  }
  get connected() {
    return Boolean(this.#token);
  }
  /** @param {string} path @param {{method?:string, body?:unknown, key?:string, blob?:boolean}} [options] */
  async request(path, options = {}) {
    if (!this.connected) throw new Error('Войдите с токеном владельца');
    const headers = new Headers({ Authorization: `Bearer ${this.#token}` });
    const method = options.method ?? 'GET';
    let signature;
    if (method !== 'GET') {
      let key = options.key;
      if (!key) {
        let payload = JSON.stringify(options.body ?? null);
        if (options.body instanceof FormData) {
          const parts = [];
          for (const [name, value] of options.body) {
            parts.push([
              name,
              typeof value === 'string'
                ? value
                : Array.from(
                    new Uint8Array(
                      await crypto.subtle.digest(
                        'SHA-256',
                        await value.arrayBuffer(),
                      ),
                    ),
                  ).join(','),
            ]);
          }
          payload = JSON.stringify(parts);
        }
        signature = JSON.stringify([method, path, payload]);
        key = this.#retryKeys.get(signature) ?? crypto.randomUUID();
        if (this.#retryKeys.size >= 64)
          this.#retryKeys.delete(this.#retryKeys.keys().next().value);
        this.#retryKeys.set(signature, key);
      }
      headers.set('Idempotency-Key', key);
    }
    let body;
    if (options.body instanceof FormData) body = options.body;
    else if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
    let response;
    try {
      response = await fetch(`${this.#base}/owner-admin${path}`, {
        method,
        headers,
        body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ApiError(
        'Не удалось связаться с backend. Проверьте соединение и повторите запрос.',
      );
    }
    if (!response.ok) {
      if (signature && response.status < 500) this.#retryKeys.delete(signature);
      if (response.status === 401) this.disconnect();
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        Array.isArray(data.message)
          ? data.message.join('. ')
          : (data.message ?? `Ошибка HTTP ${response.status}`),
        response.status,
        Array.isArray(data.message)
          ? data.message
          : [data.message].filter(Boolean),
      );
    }
    const result = await (options.blob ? response.blob() : response.json());
    if (signature) this.#retryKeys.delete(signature);
    return result;
  }
  async rotate() {
    const session = await this.request('/session/rotate', { method: 'POST' });
    this.#token = session.token;
    return session.expiresAt;
  }
}
/** @param {Date|string} value @param {string} timeZone */
export function localDateTime(value, timeZone) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = key => p.find(x => x.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part(
    'hour',
  )}:${part('minute')}`;
}
/** Convert an explicit city-local date, not the computer's time zone. @param {string} value @param {string} timeZone */
export function cityDateToIso(value, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new Error('Укажите дату и время');
  const nominal = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  for (const shift of [-86400000, 0, 86400000]) {
    const text =
      offset
        .formatToParts(new Date(nominal + shift))
        .find(p => p.type === 'timeZoneName')?.value ?? '';
    const o = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(text);
    const minutes =
      text === 'GMT'
        ? 0
        : o
          ? (o[1] === '+' ? 1 : -1) * (+o[2] * 60 + +(o[3] ?? 0))
          : NaN;
    if (!Number.isFinite(minutes)) continue;
    const date = new Date(nominal - minutes * 60000);
    if (localDateTime(date, timeZone) === value) return date.toISOString();
  }
  throw new Error('Такого местного времени нет в часовом поясе города');
}
