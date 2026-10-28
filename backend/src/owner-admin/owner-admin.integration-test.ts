import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Response, Test as HttpTest } from 'supertest';
type JsonView = {
  token: string;
  id: string;
  title: string;
  total: number;
  page: number;
  pageSize: number;
  permissions: string[];
  contactsTotal: number;
  contactClicks: number;
  pointOpens: number;
  endsAt: string;
  updatedAt: string;
  imageAssetKey: string | null;
  contacts: Array<{
    id: string;
    type: string;
    label: string;
    value: string;
    displayOrder: number;
  }>;
  items: JsonView[];
  points: JsonView[];
  banner: JsonView | null;
  advertising: Record<string, number>;
  roadEvents: { total: number };
  anonymousIdentities: { count: string };
};
type JsonResponse = Omit<Response, 'body'> & { body: JsonView };
type JsonTest = Omit<HttpTest, 'then' | 'expect'> &
  PromiseLike<JsonResponse> & {
    expect(status: number): JsonTest;
    expect(field: string, value: string | RegExp): JsonTest;
  };
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import { OwnerAdminController } from './owner-admin.controller';
import { OwnerAdminService } from './owner-admin.service';
import { OwnerAdminAuthService } from './owner-admin-auth.service';
import { OwnerAdminGuard } from './owner-admin.guard';
import { TelegramOwnerPanelService } from '../integrations/telegram/moderation/telegram-owner-panel.service';
import { TelegramModerationBotService } from '../integrations/telegram/moderation/telegram-moderation-bot.service';
import { PartnerPlacementsController } from '../partner-placements/partner-placements.controller';
import { PartnerPlacementsService } from '../partner-placements/partner-placements.service';
import { PartnerStatisticsService } from '../partner-placements/partner-statistics.service';
import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';
const db = process.env.OWNER_ADMIN_TEST_DATABASE_URL;
const enabled = process.env.OWNER_ADMIN_DISPOSABLE === '1' && !!db;
(enabled ? describe : describe.skip)(
  'owner admin disposable integration',
  () => {
    let app: INestApplication,
      prisma: PrismaService,
      auth: OwnerAdminAuthService,
      token: string,
      id: string,
      bannerId: string;
    const prefix = '/api/owner-admin';
    const origin = 'http://127.0.0.1:4173';
    const get = (path: string) =>
      request(app.getHttpServer() as App)
        .get(prefix + path)
        .set('Origin', origin)
        .set('Authorization', 'Bearer ' + token) as unknown as JsonTest;
    const mutation = (
      method: 'post' | 'put' | 'delete',
      path: string,
      body: object = {},
      key: string = randomUUID(),
    ) =>
      request(app.getHttpServer() as App)
        [method](prefix + path)
        .set('Origin', origin)
        .set('Authorization', 'Bearer ' + token)
        .set('Idempotency-Key', key)
        .send(body) as unknown as JsonTest;
    const point = () => ({
      cityId: 'balakovo',
      title: 'Disposable owner point',
      category: 'Сервис',
      description: 'Тест',
      latitude: 52.02,
      longitude: 47.8,
      displayAddress: 'Тестовый адрес',
      backgroundColor: '#153D32',
      textColor: '#FDFBF4',
      promoCode: 'Test_Code',
      promoTerms: 'Тестовые условия',
      startsAt: new Date(Date.now() - 60000).toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      contacts: [
        {
          type: 'PHONE',
          label: 'Телефон 1',
          value: '+79990000000',
          displayOrder: 0,
        },
        {
          type: 'PHONE',
          label: 'Телефон 2',
          value: '+79990000001',
          displayOrder: 1,
        },
      ],
    });
    beforeAll(async () => {
      const url = new URL(db!);
      if (
        url.hostname !== '127.0.0.1' ||
        !url.pathname.startsWith('/onmap_admin_it') ||
        !url.port
      )
        throw new Error('DISPOSABLE_DATABASE_REQUIRED');
      const config = new ConfigService({
        DATABASE_URL: db,
        OWNER_ADMIN_ENABLED: 'true',
        TELEGRAM_PARTNER_OWNER_IDS: '9911001',
      });
      prisma = new PrismaService(config);
      await prisma.$connect();
      await prisma.roadEvent.deleteMany({
        where: { title: 'Owner admin synthetic event' },
      });
      // This suite only runs against its explicitly guarded disposable database.
      await prisma.ownerAdminAudit.deleteMany();
      await prisma.ownerAdminMutation.deleteMany();
      await prisma.ownerAdminSession.deleteMany();
      await prisma.partnerStatDaily.deleteMany();
      await prisma.partnerStatWindow.deleteMany();
      await prisma.partnerCityBanner.deleteMany();
      await prisma.partnerPointContact.deleteMany();
      await prisma.partnerPoint.deleteMany();
      await prisma.partnerImageAsset.deleteMany();
      await prisma.anonymousIdentityCount.deleteMany();

      const module = await Test.createTestingModule({
        controllers: [OwnerAdminController, PartnerPlacementsController],
        providers: [
          OwnerAdminService,
          OwnerAdminAuthService,
          OwnerAdminGuard,
          PartnerPlacementsService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: config },
          { provide: PartnerStatisticsService, useValue: {} },
          {
            provide: AnonymousIdentityGuard,
            useValue: { canActivate: () => false },
          },
        ],
      })
        .overrideGuard(AnonymousIdentityGuard)
        .useValue({ canActivate: () => false })
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      auth = module.get(OwnerAdminAuthService);
      token = (await auth.issue('9911001')).token;
    });
    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
    });
    const publicPoints = () =>
      request(app.getHttpServer() as App)
        .get('/api/partner-placements')
        .query({
          cityId: 'balakovo',
          west: 47.7,
          south: 51.9,
          east: 47.9,
          north: 52.1,
        }) as unknown as JsonTest;
    it('rejects absent/mobile/wrong tokens, foreign origin; accepts owner', async () => {
      for (const t of ['', 'Bearer invalid', 'Bearer v1.mobile.fake'])
        await request(app.getHttpServer() as App)
          .get(prefix + '/metadata')
          .set('Authorization', t)
          .expect(401);
      await request(app.getHttpServer() as App)
        .get(prefix + '/metadata')
        .set('Origin', 'https://wrong.example')
        .set('Authorization', 'Bearer ' + token)
        .expect(403);
      const r = await get('/session').expect(200);
      expect(r.body.permissions).toContain('partners:write');
      expect(r.body).not.toHaveProperty('token');
    });
    it('validates payload, coordinates, dates and idempotency key', async () => {
      await mutation('post', '/points', { ...point(), latitude: 80 }).expect(
        400,
      );
      await mutation('post', '/points', {
        ...point(),
        endsAt: 'not-a-date',
      }).expect(400);
      await mutation('post', '/points', {
        ...point(),
        agreedPriceKopecks: 100,
      }).expect(400);
      await mutation('post', '/points', point(), 'invalid').expect(400);
      await mutation('post', '/points', {
        ...point(),
        contacts: [
          {
            type: 'WEBSITE',
            label: 'Bad',
            value: 'javascript:alert(1)',
            displayOrder: 0,
          },
        ],
      }).expect(400);
      await mutation('post', '/points', {
        ...point(),
        startsAt: '2027-02-30T12:00:00Z',
      }).expect(400);
      expect(await prisma.partnerPoint.count()).toBe(0);
    });
    it('creates only one draft on retry; requires separate publication', async () => {
      const body = point(),
        key = randomUUID();
      const created = await mutation('post', '/points', body, key).expect(201);
      id = created.body.id;
      expect(
        (await mutation('post', '/points', body, key).expect(201)).body.id,
      ).toBe(id);
      await mutation(
        'post',
        '/points',
        { ...body, title: 'changed' },
        key,
      ).expect(409);
      expect(await prisma.partnerPoint.count()).toBe(1);
      expect((await publicPoints()).body.points).toHaveLength(0);
      expect(
        await prisma.ownerAdminAudit.count({
          where: { action: 'POINT_DRAFT' },
        }),
      ).toBe(1);
      await mutation('post', `/points/${id}/actions/publish`).expect(201);
      expect((await publicPoints()).body.points).toHaveLength(1);
    });
    it('paginates, searches and omits financial/internal data', async () => {
      await prisma.partnerPoint.update({
        where: { id },
        data: { agreedPriceKopecks: 12500n, paidAt: new Date() },
      });
      const r = await get(
        '/points?search=Disposable&status=ACTIVE&page=1&pageSize=1',
      ).expect(200);
      expect(r.body.total).toBe(1);
      expect(r.body.items).toHaveLength(1);
      expect(JSON.stringify(r.body)).not.toMatch(
        /agreedPrice|paidAt|tokenHash|identityHash|ownerTelegramId|pngBytes/,
      );
      expect(
        (await get('/points?page=2&pageSize=1').expect(200)).body.items,
      ).toHaveLength(0);
      await get('/points?pageSize=10000').expect(400);
    });
    it('preserves contact IDs on reorder; changed destination gets a new ID and private deleted history is neutral', async () => {
      let p = (await get('/points/' + id)).body;
      const old = p.contacts.map((c: { id: string }) => c.id);
      await prisma.partnerStatDaily.createMany({
        data: old.map((contactId: string, index: number) => ({
          partnerPointId: id,
          action: 'CONTACT_CLICK',
          detailId: contactId,
          day: new Date(),
          count: index + 2,
        })),
      });
      const dto = {
        ...point(),
        expectedUpdatedAt: p.updatedAt,
        contacts: [
          { ...p.contacts[1], displayOrder: 0 },
          { ...p.contacts[0], displayOrder: 1 },
        ],
      };
      await mutation('put', '/points/' + id, dto).expect(200);
      p = (await get('/points/' + id)).body;
      expect(p.contacts.map((c: { id: string }) => c.id)).toEqual([
        old[1],
        old[0],
      ]);
      await mutation('put', '/points/' + id, {
        ...dto,
        expectedUpdatedAt: p.updatedAt,
        contacts: [
          { ...p.contacts[0], value: '+79990000002', displayOrder: 0 },
        ],
      }).expect(200);
      p = (await get('/points/' + id)).body;
      expect(old).not.toContain(p.contacts[0].id);
      const stats = (
        await get(`/points/${id}/statistics?period=ALL&pageSize=1`)
      ).body;
      expect(stats.contactClicks).toBe(5);
      expect(stats.contactsTotal).toBe(2);
      expect(stats.contacts[0].label).toMatch(/^Удалённый контакт /);
      expect(JSON.stringify(stats)).not.toMatch(
        /Телефон|799900|value|tokenHash/,
      );
      expect(
        (await get(`/points/${id}/statistics?period=ALL&page=10&pageSize=1`))
          .body.contactsTotal,
      ).toBe(2);
    });
    it('rejects stale edits and controls pause/resume without resetting dates', async () => {
      const p = (await get('/points/' + id)).body;
      await mutation('put', '/points/' + id, {
        ...point(),
        expectedUpdatedAt: '2020-01-01T00:00:00Z',
      }).expect(409);
      await mutation('post', `/points/${id}/actions/pause`).expect(201);
      expect((await publicPoints()).body.points).toHaveLength(0);
      await mutation('post', `/points/${id}/actions/resume`).expect(201);
      expect((await publicPoints()).body.points).toHaveLength(1);
      expect((await get('/points/' + id)).body.endsAt).toBe(p.endsAt);
    });
    it('uses existing image normalization atomically and idempotently', async () => {
      const bytes = await sharp({
        create: { width: 40, height: 20, channels: 4, background: '#11aa55' },
      })
        .png()
        .toBuffer();
      const key = randomUUID();
      const upload = () =>
        request(app.getHttpServer() as App)
          .post(prefix + `/points/${id}/image`)
          .set('Authorization', 'Bearer ' + token)
          .set('Idempotency-Key', key)
          .attach('image', bytes, 'test.png');
      await request(app.getHttpServer() as App)
        .post(prefix + `/points/${id}/image`)
        .attach('image', bytes, 'test.png')
        .expect(401);
      await upload().expect(201);
      const stored = (await get('/points/' + id)).body.imageAssetKey;
      await upload().expect(201);
      expect((await get('/points/' + id)).body.imageAssetKey).toBe(stored);
      await request(app.getHttpServer() as App)
        .post(prefix + `/points/${id}/image`)
        .set('Authorization', 'Bearer ' + token)
        .set('Idempotency-Key', randomUUID())
        .attach('image', Buffer.from('<svg/>'), 'test.png')
        .expect(400);
      expect((await get('/points/' + id)).body.imageAssetKey).toBe(stored);
      await get(`/points/${id}/image`)
        .expect(200)
        .expect('Content-Type', /image\/png/);
    });
    it('saves banner disabled and enables it separately without changing the point', async () => {
      const old = await prisma.partnerPoint.findUniqueOrThrow({
        where: { id },
      });
      const body = {
        title: 'Test banner',
        text: 'Offer',
        buttonLabel: 'Open',
        buttonUrl: 'https://example.com',
        partnerPointId: id,
        startsAt: point().startsAt,
        endsAt: point().endsAt,
      };
      const saved = await mutation('put', '/banners/balakovo', body).expect(
        200,
      );
      bannerId = saved.body.id;
      expect((await publicPoints()).body.banner).toBeNull();
      await mutation('post', '/banners/balakovo/actions/enable').expect(201);
      expect((await publicPoints()).body.banner!.id).toBe(bannerId);
      await mutation('post', '/banners/balakovo/actions/pause').expect(201);
      expect((await publicPoints()).body.banner).toBeNull();
      await mutation('post', '/banners/balakovo/actions/enable').expect(201);
      await mutation('post', '/banners/balakovo/actions/end').expect(201);
      expect((await publicPoints()).body.banner).toBeNull();
      expect(
        (await prisma.partnerPoint.findUniqueOrThrow({ where: { id } })).endsAt,
      ).toEqual(old.endsAt);
    });
    it('aggregates only daily counters, keeps blank periods at zero and reads do not count views', async () => {
      for (const [source, status] of [
        ['USER', 'ACTIVE'],
        ['USER', 'RESOLVED'],
        ['TELEGRAM', 'RESOLVED'],
      ]) {
        await prisma.$executeRaw`INSERT INTO road_events(id,city_id,type,status,source,title,longitude,latitude,location,expires_at,updated_at)
          VALUES(${randomUUID()}::uuid,'balakovo','ACCIDENT'::"RoadEventType",${status}::"RoadEventStatus",${source}::"RoadEventSource",'Owner admin synthetic event',47.8,52.02,ST_SetSRID(ST_MakePoint(47.8,52.02),4326),NOW()+interval '1 day',NOW())`;
      }

      await prisma.partnerStatDaily.createMany({
        data: [
          {
            partnerPointId: id,
            action: 'POINT_OPEN',
            detailId: '',
            day: new Date(),
            count: 3,
          },
          {
            partnerPointId: id,
            action: 'BANNER_IMPRESSION',
            detailId: bannerId,
            day: new Date(),
            count: 5,
          },
          {
            partnerPointId: id,
            action: 'BANNER_CLICK',
            detailId: bannerId,
            day: new Date(),
            count: 2,
          },
          {
            partnerPointId: id,
            action: 'POINT_OPEN',
            detailId: '',
            day: new Date(Date.now() - 40 * 86400000),
            count: 10,
          },
        ],
      });
      await prisma.anonymousIdentityCount.create({
        data: { id: 1, count: 3n, startedAt: new Date() },
      });
      const before = await prisma.partnerStatDaily.aggregate({
        _sum: { count: true },
      });
      const r = (await get('/overview?period=7')).body;
      expect(r.roadEvents.total).toBe(3);
      expect(r.roadEvents).not.toHaveProperty('byStatus');
      expect(r.anonymousIdentities.count).toBe('3');
      expect(r.advertising).toMatchObject({
        pointOpens: 3,
        bannerImpressions: 5,
        bannerClicks: 2,
        contactClicks: 5,
      });
      expect((await get('/statistics?period=ALL')).body.pointOpens).toBe(13);
      await get('/overview?period=30').expect(200);
      expect(
        await prisma.partnerStatDaily.aggregate({ _sum: { count: true } }),
      ).toEqual(before);
      const empty = await mutation('post', '/points', {
        ...point(),
        title: 'Empty',
      });
      expect(
        (await get(`/points/${empty.body.id}/statistics?period=7`)).body.total,
      ).toBe(0);
    });
    it('keeps period boundaries in UTC and excludes future counters', async () => {
      const created = await mutation('post', '/points', {
        ...point(),
        title: 'Boundary',
      }).expect(201);
      const now = new Date();
      const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      await prisma.partnerStatDaily.createMany({
        data: [
          {
            partnerPointId: created.body.id,
            action: 'POINT_OPEN',
            detailId: '',
            day: new Date(today - 6 * 86400000),
            count: 4,
          },
          {
            partnerPointId: created.body.id,
            action: 'POINT_OPEN',
            detailId: '',
            day: new Date(today - 7 * 86400000),
            count: 7,
          },
          {
            partnerPointId: created.body.id,
            action: 'POINT_OPEN',
            detailId: '',
            day: new Date(today + 2 * 86400000),
            count: 100,
          },
        ],
      });
      expect(
        (await get(`/points/${created.body.id}/statistics?period=7`)).body
          .pointOpens,
      ).toBe(4);
      expect(
        (await get(`/points/${created.body.id}/statistics?period=30`)).body
          .pointOpens,
      ).toBe(11);
      expect(
        (await get(`/points/${created.body.id}/statistics?period=ALL`)).body
          .pointOpens,
      ).toBe(11);
    });
    it('serializes two simultaneous copies of the same mutation', async () => {
      const key = randomUUID(),
        body = { ...point(), title: 'Concurrent draft' };
      const [a, b] = await Promise.all([
        mutation('post', '/points', body, key),
        mutation('post', '/points', body, key),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(
        await prisma.ownerAdminAudit.count({
          where: { entityId: a.body.id, action: 'POINT_DRAFT' },
        }),
      ).toBe(1);
    });
    it('never resumes expired/ended points and never allows public owner writes', async () => {
      await mutation('post', `/points/${id}/actions/end`).expect(201);
      await mutation('post', `/points/${id}/actions/resume`).expect(400);
      const expired = await prisma.partnerPoint.create({
        data: {
          cityId: 'balakovo',
          title: 'Expired',
          category: 'Service',
          latitude: 52.02,
          longitude: 47.8,
          status: 'PAUSED',
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() - 1000),
        },
      });
      await mutation('post', `/points/${expired.id}/actions/resume`).expect(
        400,
      );
      await request(app.getHttpServer() as App)
        .post(prefix + '/points')
        .send(point())
        .expect(401);
    });
    it('issues usable access via the single bot dispatch only once, denies outsiders and leaves no bearer in DB', async () => {
      const config = new ConfigService({
        OWNER_ADMIN_ENABLED: 'true',
        TELEGRAM_PARTNER_OWNER_IDS: '9911001',
        TELEGRAM_MODERATION_CHAT_ID: '9911001',
      });
      const panel = new TelegramOwnerPanelService(config, prisma);
      const bot = new TelegramModerationBotService(
        config,
        prisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        panel,
        {} as never,
        auth,
      );
      const sent: Array<{ text?: string; parse_mode?: string }> = [];
      const transport = bot as unknown as {
        safeApiCall(
          method: string,
          body: { text?: string; parse_mode?: string },
        ): Promise<unknown>;
        processUpdate(update: unknown): Promise<void>;
      };
      transport.safeApiCall = (method, body) => {
        if (method === 'sendMessage') sent.push(body);
        return Promise.resolve({});
      };
      let updateId = Math.floor(Date.now() / 1000) * 1000;
      const start = (owner: number, type = 'private') => ({
        update_id: updateId++,
        message: {
          from: { id: owner },
          chat: { id: owner, type },
          text: '/admin',
        },
      });
      const cb = (owner: number, data: string) => ({
        update_id: updateId++,
        callback_query: {
          id: 'synthetic',
          from: { id: owner },
          data,
          message: { message_id: 7, chat: { id: owner, type: 'private' } },
        },
      });
      expect((await panel.process(start(9911002))).keyboard).toBeUndefined();
      expect(
        (await panel.process(start(9911001, 'group'))).keyboard,
      ).toBeUndefined();
      const entry = await panel.process(start(9911001));
      const data = entry.keyboard?.inline_keyboard
        .flat()
        .find((b) => b.text.includes('Получить токен'))?.callback_data;
      expect(Boolean(data)).toBe(true);
      // Outsider cannot replay the owner's button.
      await transport.processUpdate(cb(9911002, data!));
      expect(sent.some((b) => b.text?.includes('onmap_owner_'))).toBe(false);
      sent.length = 0;
      const action = cb(9911001, data!);
      await transport.processUpdate(action);
      const delivery = sent.find((b) => b.text?.includes('<code>'));
      expect(Boolean(delivery)).toBe(true);
      expect(delivery?.parse_mode).toBe('HTML');
      const bearer = /<code>(onmap_owner_[A-Za-z0-9_-]{43})<\/code>/u.exec(
        delivery!.text!,
      )?.[1];
      expect(Boolean(bearer)).toBe(true);
      token = bearer!;
      await get('/session').expect(200);
      await get('/metadata').expect(200);
      const before = await prisma.ownerAdminSession.findUnique({
        where: { ownerTelegramId: '9911001' },
      });
      sent.length = 0;
      await transport.processUpdate(action);
      await transport.processUpdate(cb(9911001, data!));
      expect(sent.some((b) => b.text?.includes('onmap_owner_'))).toBe(false);
      expect(
        (
          await prisma.ownerAdminSession.findUnique({
            where: { ownerTelegramId: '9911001' },
          })
        )?.tokenHash,
      ).toBe(before?.tokenHash);
      const stored = JSON.stringify({
        session: before,
        audit: await prisma.ownerAdminAudit.findMany(),
        actions: await prisma.telegramBotPanelAction.findMany(),
      });
      expect(stored.includes(token)).toBe(false);
      const disabled = new TelegramOwnerPanelService(
        new ConfigService({ TELEGRAM_PARTNER_OWNER_IDS: '9911001' }),
        prisma,
      );
      expect(
        (await disabled.process(start(9911001))).keyboard?.inline_keyboard
          .flat()
          .some((b) => b.text.includes('Получить токен')),
      ).toBe(false);
    });
  },
);
