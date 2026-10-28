/** Isolated HTTPS routes for manual/automated browser QA; never imported by src or build. */
export default async function installFixture(page) {
  const api = 'https://owner-ui.example.invalid/api/owner-admin';
  const createdAt = new Date(Date.now() - 3600000).toISOString(),
    endsAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const first = '11111111-1111-4111-8111-111111111111',
    second = '22222222-2222-4222-8222-222222222222';
  const points = [
    {
      id: first,
      cityId: 'balakovo',
      title: 'ProAvto',
      category: 'Магазин автозапчастей',
      description:
        'Запчасти и обслуживание автомобиля. Поможем подобрать всё необходимое.',
      displayAddress: 'Саратовское шоссе, 26/1',
      latitude: 52.022,
      longitude: 47.819,
      backgroundColor: '#D91D2D',
      textColor: '#FFFFFF',
      promoCode: 'ONMAP64',
      promoTerms: 'Условия предложения уточняйте у партнёра',
      startsAt: createdAt,
      endsAt,
      status: 'ACTIVE',
      updatedAt: createdAt,
      imageAssetKey: null,
      contacts: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          type: 'WEBSITE',
          label: 'Перейти на сайт',
          value: 'https://partner.example.invalid',
          displayOrder: 0,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'PHONE',
          label: 'Позвонить',
          value: '+79000000000',
          displayOrder: 1,
        },
      ],
    },
    {
      id: second,
      cityId: 'balakovo',
      title: 'Кофейня Точка',
      category: 'Кофейня',
      description: 'Кофе с собой и свежая выпечка.',
      displayAddress: '',
      latitude: 52.025,
      longitude: 47.81,
      backgroundColor: '#286348',
      textColor: '#FDFBF4',
      promoCode: null,
      promoTerms: null,
      startsAt: createdAt,
      endsAt,
      status: 'PAUSED',
      updatedAt: createdAt,
      imageAssetKey: null,
      contacts: [],
    },
  ];
  let banner = {
    id: '55555555-5555-4555-8555-555555555555',
    cityId: 'balakovo',
    title: 'ProAvto',
    text: 'Нужна замена масла — заезжай',
    buttonLabel: 'Посмотреть',
    buttonUrl: 'https://partner.example.invalid/offer',
    partnerPointId: first,
    startsAt: createdAt,
    endsAt,
    enabled: true,
    updatedAt: createdAt,
  };
  const ledger = new Map(),
    calls = [];
  let token = 'synthetic-test-only',
    clock = Date.now();
  const nextDate = () => new Date(++clock).toISOString();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  const stats = {
    period: '7',
    pointOpens: 1248,
    bannerImpressions: 6840,
    bannerClicks: 326,
    contactClicks: 412,
    total: 8826,
    contacts: [
      {
        pointId: first,
        pointTitle: 'ProAvto',
        contactId: points[0].contacts[0].id,
        label: 'Перейти на сайт',
        clicks: 186,
        deleted: false,
      },
      {
        pointId: first,
        pointTitle: 'ProAvto',
        contactId: points[0].contacts[1].id,
        label: 'Позвонить',
        clicks: 142,
        deleted: false,
      },
      {
        pointId: first,
        pointTitle: 'ProAvto',
        contactId: '66666666-6666-4666-8666-666666666666',
        label: 'Удалённый контакт 1',
        clicks: 22,
        deleted: true,
      },
    ],
    contactsTotal: 3,
    page: 1,
    pageSize: 20,
    timeZone: 'UTC',
    uniqueVisitors: null,
  };
  const pageItems = (items, url) => {
    const page = Number(url.searchParams.get('page') || 1),
      pageSize = Number(url.searchParams.get('pageSize') || 20);
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  };
  await page.route(api + '/**', async route => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.slice('/api/owner-admin'.length),
      method = request.method();
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers':
        'Authorization,Content-Type,Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    };
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });
    if (method === 'OPTIONS') return reply({});
    if (request.headers().authorization !== 'Bearer ' + token)
      return reply({ message: 'Токен недействителен' }, 401);
    calls.push({ path, method });
    await new Promise(resolve => setTimeout(resolve, 35));
    if (path === '/session' && method === 'DELETE') {
      token = 'revoked';
      return reply({ revoked: true });
    }
    if (path === '/session')
      return reply({
        expiresAt: new Date(Date.now() + 1200000).toISOString(),
        permissions: ['partners:write'],
      });
    if (path === '/session/rotate') {
      token = 'synthetic-rotated-only';
      return reply({
        token,
        expiresAt: new Date(Date.now() + 1100000).toISOString(),
      });
    }
    if (path === '/metadata')
      return reply({
        cities: [
          {
            id: 'balakovo',
            name: 'Балаково',
            timeZone: 'Europe/Saratov',
            center: { latitude: 52.022, longitude: 47.819 },
            bounds: { north: 52.2, south: 51.8, east: 48.1, west: 47.4 },
          },
        ],
      });
    if (path.endsWith('/statistics') || path === '/statistics')
      return reply({ ...stats, period: url.searchParams.get('period') || '7' });
    if (path === '/overview')
      return reply({
        roadEvents: {
          total: 8426,
          bySource: [
            { source: 'USER', count: 2330 },
            { source: 'TELEGRAM', count: 6096 },
          ],
        },
        anonymousIdentities: { count: '2184', since: '2026-10-14T00:00:00Z' },
        points: {
          activeNow: points.filter(p => p.status === 'ACTIVE').length,
          byStatus: ['ACTIVE', 'DRAFT', 'PAUSED', 'ENDED'].map(status => ({
            status,
            count: points.filter(p => p.status === status).length,
          })),
        },
        advertising: stats,
      });
    if (path === '/points' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase(),
        status = url.searchParams.get('status');
      return reply(
        pageItems(
          points.filter(
            p =>
              (!search || p.title.toLowerCase().includes(search)) &&
              (!status || p.status === status),
          ),
          url,
        ),
      );
    }
    if (path === '/banners' && method === 'GET')
      return reply(
        pageItems(
          banner
            ? [
                {
                  ...banner,
                  partnerPoint: points.find(
                    p => p.id === banner.partnerPointId,
                  ),
                },
              ]
            : [],
          url,
        ),
      );
    const image = /^\/points\/([^/]+)\/image$/.exec(path);
    if (image && method === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers,
        body: png,
      });
    if (method !== 'GET') {
      const key = request.headers()['idempotency-key'];
      if (!key) return reply({ message: 'Idempotency-Key обязателен' }, 400);
      const hash = method + path + request.postData();
      if (ledger.has(key)) {
        const old = ledger.get(key);
        return old.hash === hash
          ? reply(old.result, old.status)
          : reply({ message: 'Повторный ключ с другим содержимым' }, 409);
      }
      const requestHeaders = request.headers();
      const input = requestHeaders['content-type']?.includes('application/json')
        ? request.postDataJSON()
        : {};
      const match = /^\/points\/([^/]+)$/.exec(path);
      let result,
        status = 200;
      if (path === '/points' && method === 'POST') {
        const p = {
          ...input,
          id: crypto.randomUUID(),
          status: 'DRAFT',
          updatedAt: nextDate(),
          imageAssetKey: null,
          contacts: input.contacts.map(c => ({
            ...c,
            id: c.id || crypto.randomUUID(),
          })),
        };
        points.push(p);
        result = { id: p.id };
        status = 201;
      } else if (match && method === 'PUT') {
        const p = points.find(p => p.id === match[1]);
        if (!p) return reply({ message: 'Точка не найдена' }, 404);
        if (input.expectedUpdatedAt !== p.updatedAt)
          return reply({ message: 'Запись изменилась' }, 409);
        Object.assign(p, input, { updatedAt: nextDate() });
        result = { id: p.id };
      } else if (image) {
        const p = points.find(p => p.id === image[1]);
        p.imageAssetKey = method === 'DELETE' ? null : crypto.randomUUID();
        p.updatedAt = nextDate();
        result = { id: p.id };
      } else if (path.startsWith('/points/') && path.includes('/actions/')) {
        const id = path.split('/')[2],
          action = path.split('/').pop(),
          p = points.find(p => p.id === id);
        p.status = {
          publish: 'ACTIVE',
          pause: 'PAUSED',
          resume: 'ACTIVE',
          end: 'ENDED',
        }[action];
        p.updatedAt = nextDate();
        result = { id };
        status = 201;
      } else if (path.startsWith('/banners/') && path.includes('/actions/')) {
        banner.enabled = path.endsWith('/enable');
        banner.updatedAt = nextDate();
        result = { id: banner.cityId };
        status = 201;
      } else if (path.startsWith('/banners/') && method === 'PUT') {
        if (banner && input.expectedUpdatedAt !== banner.updatedAt)
          return reply({ message: 'Баннер изменился' }, 409);
        banner = {
          ...input,
          id: banner?.id || crypto.randomUUID(),
          cityId: path.split('/')[2],
          enabled: false,
          updatedAt: nextDate(),
        };
        result = { id: banner.id };
      } else return reply({ message: 'Unknown fixture route' }, 404);
      ledger.set(key, { hash, result, status });
      return reply(result, status);
    }
    const id = path.split('/')[2],
      p = points.find(p => p.id === id);
    return p ? reply(p) : reply({ message: 'Точка не найдена' }, 404);
  });
  await page.route('https://tiles.openfreemap.org/**', r =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {
          roads: {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [47.811, 52.019],
                      [47.819, 52.022],
                      [47.83, 52.024],
                    ],
                  },
                },
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [47.82, 52.014],
                      [47.819, 52.022],
                      [47.816, 52.028],
                    ],
                  },
                },
              ],
            },
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#edf0e8' },
          },
          {
            id: 'roads',
            type: 'line',
            source: 'roads',
            paint: { 'line-color': '#fffef9', 'line-width': 12 },
          },
        ],
      }),
    }),
  );
  return { points, calls, getBanner: () => banner };
}
