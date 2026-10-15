import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import type { App } from 'supertest/types';
import { PrismaService } from '../database/prisma.service';
import { RoadEventReportsService } from '../road-events/road-event-reports.service';
import { RoadEventsGateway } from '../road-events/realtime/road-events.gateway';
import { TelegramModerationBotService } from '../integrations/telegram/moderation/telegram-moderation-bot.service';
import { TelegramSingletonLockService } from '../integrations/telegram/telegram-singleton-lock.service';
import { PartnerBotService } from './partner-bot.service';
import type { PushCampaignBotService } from '../push/push-campaign-bot.service';
import type { TelegramOwnerPanelService } from '../integrations/telegram/moderation/telegram-owner-panel.service';
import type { PushOwnerPairingService } from '../push/push-owner-pairing.service';
import { PartnerPlacementsController } from './partner-placements.controller';
import { PartnerPlacementsService } from './partner-placements.service';
import { PartnerStatisticsService } from './partner-statistics.service';
import { IdentityService } from '../identity/identity.service';
import { IdentityTrackingService } from '../identity/identity-tracking.service';
import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';

const dbUrl = process.env.PARTNER_INTEGRATION_DATABASE_URL;
const runIntegration =
  process.env.PARTNER_INTEGRATION_DISPOSABLE === '1' && !!dbUrl;
const OWNER_ID = 9911001;
const OTHER_ID = 9911002;

const privateMessage = (updateId: number, text: string, userId = OWNER_ID) => ({
  update_id: updateId,
  message: {
    text,
    from: { id: userId },
    chat: { id: userId, type: 'private' },
  },
});
const privateLocation = (
  updateId: number,
  latitude: number,
  longitude: number,
) => ({
  update_id: updateId,
  message: {
    location: { latitude, longitude },
    from: { id: OWNER_ID },
    chat: { id: OWNER_ID, type: 'private' },
  },
});
const privateCallback = (updateId: number, data: string) => ({
  update_id: updateId,
  callback_query: {
    id: `cb-${updateId}`,
    data,
    from: { id: OWNER_ID },
    message: { message_id: updateId, chat: { id: OWNER_ID, type: 'private' } },
  },
});

(runIntegration ? describe : describe.skip)(
  'partner placements disposable PostGIS integration',
  () => {
    let prisma: PrismaService;
    let partnerBot: PartnerBotService;
    let moderation: TelegramModerationBotService;
    let reports: RoadEventReportsService;
    let gateway: {
      broadcastUpdated: jest.Mock;
      broadcastResolved: jest.Mock;
      broadcastHidden: jest.Mock;
    };
    let app: INestApplication;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let nextUpdateId = Date.now() % 1_000_000_000_000;
    const transport = jest.fn().mockResolvedValue(undefined);

    const send = async (text: string, userId = OWNER_ID) => {
      await moderationProcess(privateMessage(nextUpdateId++, text, userId));
    };
    const sendLocation = async (latitude: number, longitude: number) => {
      await moderationProcess(
        privateLocation(nextUpdateId++, latitude, longitude),
      );
    };
    const click = async (data: string) => {
      await moderationProcess(privateCallback(nextUpdateId++, data));
    };
    const moderationProcess = (update: unknown) =>
      (
        moderation as unknown as {
          processUpdate(value: unknown): Promise<void>;
        }
      ).processUpdate(update);
    const draftRevision = async () => {
      const draft = await prisma.partnerBotDraft.findUnique({
        where: { ownerTelegramId: String(OWNER_ID) },
      });
      if (!draft) throw new Error('Expected active partner draft');
      return draft.revision;
    };
    type PublicBody = {
      points: Array<Record<string, unknown>>;
      banner: Record<string, unknown> | null;
    };
    const list = async (): Promise<PublicBody> => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/partner-placements')
        .query({
          cityId: 'balakovo',
          west: 47.7,
          south: 51.9,
          east: 47.9,
          north: 52.1,
        })
        .expect(200);
      return response.body as PublicBody;
    };

    beforeAll(async () => {
      const url = new URL(dbUrl!);
      if (
        url.hostname !== '127.0.0.1' ||
        !url.pathname.startsWith('/onmap_it') ||
        !url.port
      )
        throw new Error(
          'Integration test requires a disposable loopback onmap_it database',
        );
      const config = new ConfigService({
        DATABASE_URL: dbUrl,
        TELEGRAM_MODERATION_BOT_TOKEN: 'integration-test-only',
        TELEGRAM_MODERATION_CHAT_ID: String(OWNER_ID),
        TELEGRAM_PARTNER_OWNER_IDS: String(OWNER_ID),
      });
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('EXTERNAL_NETWORK_FORBIDDEN');
      });
      prisma = new PrismaService(config);
      await prisma.$connect();
      await prisma.partnerCityBanner.deleteMany({
        where: { title: 'Banner title' },
      });
      await prisma.partnerPoint.deleteMany({
        where: {
          title: {
            in: [
              'Integration Partner',
              'Edited Partner',
              'Expired',
              'Future',
              'Draft',
              'Unlocated',
            ],
          },
        },
      });
      await prisma.partnerBotDraft.deleteMany({
        where: { ownerTelegramId: String(OWNER_ID) },
      });
      partnerBot = new PartnerBotService(config, prisma);
      gateway = {
        broadcastUpdated: jest.fn(),
        broadcastResolved: jest.fn(),
        broadcastHidden: jest.fn(),
      };
      reports = new RoadEventReportsService(
        prisma,
        gateway as unknown as RoadEventsGateway,
      );
      moderation = new TelegramModerationBotService(
        config,
        prisma,
        gateway as unknown as RoadEventsGateway,
        {
          tryAcquire: jest.fn(),
          release: jest.fn(),
        } as unknown as TelegramSingletonLockService,
        partnerBot,
        {
          shouldHandle: jest.fn().mockResolvedValue(false),
          process: jest.fn(),
        } as unknown as PushCampaignBotService,
        {
          shouldHandle: jest.fn().mockReturnValue(false),
          shouldHandleSearchText: jest.fn().mockResolvedValue(false),
          process: jest.fn(),
        } as unknown as TelegramOwnerPanelService,
        {
          createCode: jest.fn(),
          sendCampaignTest: jest.fn(),
        } as unknown as PushOwnerPairingService,
      );
      (moderation as unknown as { safeApiCall: typeof transport }).safeApiCall =
        transport;
      const module = await Test.createTestingModule({
        controllers: [PartnerPlacementsController],
        providers: [
          {
            provide: PartnerPlacementsService,
            useValue: new PartnerPlacementsService(prisma),
          },
          {
            provide: IdentityService,
            useValue: {
              partnerStatisticsPseudonym: () => 'integration-only',
              verifyAnonymousIdentity: () => 'integration-only',
            },
          },
          {
            provide: IdentityTrackingService,
            useValue: { recordSafely: jest.fn().mockResolvedValue(undefined) },
          },
          AnonymousIdentityGuard,
          PartnerStatisticsService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
      if (fetchSpy) {
        try {
          expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
          fetchSpy.mockRestore();
        }
      }
    });

    it('uses the existing poller path, persists the wizard, and exposes only confirmed active points', async () => {
      await send('/partner_new balakovo', OTHER_ID);
      expect(await prisma.partnerBotDraft.count()).toBe(0);
      await send('/partner_new balakovo');
      expect(
        await partnerBot.shouldHandle(
          privateMessage(nextUpdateId, 'Integration Partner'),
        ),
      ).toBe(true);
      await send('Integration Partner');
      expect(
        await prisma.partnerBotDraft.findUnique({
          where: { ownerTelegramId: String(OWNER_ID) },
        }),
      ).toMatchObject({ step: 'CATEGORY' });

      // A new service instance reads the same DB draft; no in-memory session is required.
      partnerBot = new PartnerBotService(
        new ConfigService({ TELEGRAM_PARTNER_OWNER_IDS: String(OWNER_ID) }),
        prisma,
      );
      (moderation as unknown as { partnerBot: PartnerBotService }).partnerBot =
        partnerBot;
      await send('/partner_status');
      await send('SERVICE');
      await send('/skip');
      await sendLocation(52, 47.8);
      await send('ул. Ленина, 1');
      const contactRevision = await draftRevision();
      await click(`pp:done:${contactRevision}`);
      await click(`pp:add:${contactRevision}`); // Stale double-click cannot add a contact.
      const start = new Date(Date.now() - 60_000).toISOString();
      const end = new Date(Date.now() + 60 * 60_000).toISOString();
      await send(start);
      await send(end);
      await send('#285C78');
      await send('#FDFBF4');
      await send('/skip');
      await send('onMap-2026');
      await send('/skip'); // optional promo terms
      expect((await list()).points).toHaveLength(0);
      const confirmationData = `pp:confirm:${await draftRevision()}`;
      const confirmUpdate = privateCallback(nextUpdateId++, confirmationData);
      await moderationProcess(confirmUpdate);
      await moderationProcess(confirmUpdate);
      await click(confirmationData); // Another update with the old callback.
      const rows = await prisma.partnerPoint.findMany({
        where: { title: 'Integration Partner' },
      });
      expect(rows).toHaveLength(1);
      expect((await list()).points).toHaveLength(1);
      expect((await list()).points[0].appearance).toEqual({
        backgroundColor: '#285C78',
        textColor: '#FDFBF4',
      });
      expect((await list()).points[0].promoCode).toBe('onMap-2026');
      expect(await prisma.partnerBotDraft.count()).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled(); // No getUpdates and no real Bot API requests.
    });

    it('stores an owner image, exposes it only for an active confirmed point, and preserves it after failed replacement', async () => {
      const point = await prisma.partnerPoint.findFirstOrThrow({
        where: { title: 'Integration Partner' },
      });
      const reachImage = async () => {
        await send(`/partner_edit ${point.id}`);
        await send('/keep'); // title
        await send('/keep'); // category
        await send('/skip'); // description
        await send('/keep'); // coordinate
        await send('/keep'); // address
        await click(`pp:done:${await draftRevision()}`);
        await send('/keep'); // start
        await send('/keep'); // end
        await send('/keep'); // background
        await send('/keep'); // text
        expect(
          (
            await prisma.partnerBotDraft.findUniqueOrThrow({
              where: { ownerTelegramId: String(OWNER_ID) },
            })
          ).step,
        ).toBe('IMAGE');
      };
      await reachImage();
      const source = await sharp({
        create: { width: 80, height: 40, channels: 4, background: '#228844ff' },
      })
        .png()
        .toBuffer();
      const invalid = await partnerBot.process(
        privateMessage(nextUpdateId++, ''),
        { bytes: Buffer.from('<svg/>') },
      );
      expect(invalid.text).toContain('не является исправным');
      expect(
        (
          await prisma.partnerPoint.findUniqueOrThrow({
            where: { id: point.id },
          })
        ).imageAssetKey,
      ).toBeNull();
      const update = privateMessage(nextUpdateId++, '');
      await partnerBot.process(update, { bytes: source });
      await send('/skip');
      await send('/skip'); // existing promo code has optional terms
      expect(
        (await partnerBot.process(update, { bytes: source })).duplicate,
      ).toBe(true);
      const draft = await prisma.partnerBotDraft.findUniqueOrThrow({
        where: { ownerTelegramId: String(OWNER_ID) },
      });
      const key = (draft.payload as { imageAssetKey: string }).imageAssetKey;
      const path = `/api/partner-placements/images/${key}`;
      await request(app.getHttpServer() as App)
        .get(path)
        .expect(404);
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).points[0].imageUrl).toBe(
        `/partner-placements/images/${key}`,
      );
      const image = await request(app.getHttpServer() as App)
        .get(path)
        .expect(200);
      expect(image.headers['content-type']).toMatch(/image\/png/u);
      expect(image.headers['x-content-type-options']).toBe('nosniff');
      expect((await sharp(image.body as Buffer).metadata()).width).toBe(256);
      await reachImage();
      await partnerBot.process(privateMessage(nextUpdateId++, ''), {
        bytes: Buffer.from('<svg/>'),
      });
      expect(
        (
          await prisma.partnerPoint.findUniqueOrThrow({
            where: { id: point.id },
          })
        ).imageAssetKey,
      ).toBe(key);
      await send('/skip');
      await send('/skip');
      await send('/skip'); // existing promo code has optional terms
      await click(`pp:confirm:${await draftRevision()}`);
      expect(
        (
          await prisma.partnerPoint.findUniqueOrThrow({
            where: { id: point.id },
          })
        ).imageAssetKey,
      ).toBe(key);
      await request(app.getHttpServer() as App)
        .get(path)
        .expect(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('edits and clears the promo only on confirmation without exposing finance fields', async () => {
      const point = await prisma.partnerPoint.findFirstOrThrow({
        where: { title: 'Integration Partner' },
      });
      const reachPromo = async () => {
        await send(`/partner_edit ${point.id}`);
        await send('/keep'); // title
        await send('/keep'); // category
        await send('/skip'); // description
        await send('/keep'); // coordinates
        await send('/skip'); // address
        await click(`pp:done:${await draftRevision()}`);
        await send('/keep'); // start
        await send('/keep'); // end
        await send('/keep'); // background
        await send('/keep'); // text
        await send('/skip'); // image
      };
      await reachPromo();
      expect((await list()).points[0].promoCode).toBe('onMap-2026');
      await send('Sale_20');
      await send('/skip'); // keep optional terms unchanged
      expect((await list()).points[0].promoCode).toBe('onMap-2026');
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).points[0].promoCode).toBe('Sale_20');
      await reachPromo();
      await send('/clear_promo');
      expect((await list()).points[0].promoCode).toBe('Sale_20');
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).points[0].promoCode).toBeNull();
      const stored = await prisma.partnerPoint.findUniqueOrThrow({
        where: { id: point.id },
      });
      expect(stored.promoCode).toBeNull();
      expect((await list()).points[0]).not.toHaveProperty('agreedPriceKopecks');
    });

    it('edits, pauses, resumes and ends the point while keeping banner and finance independent', async () => {
      const point = await prisma.partnerPoint.findFirstOrThrow({
        where: { title: 'Integration Partner' },
      });
      const originalEnd = point.endsAt;
      await send(`/partner_edit ${point.id}`);
      await send('Edited Partner');
      await send('/keep'); // category
      await send('/skip'); // description
      await send('/keep'); // coordinate
      await send('/skip'); // address
      await click(`pp:done:${await draftRevision()}`);
      await send('/keep'); // start
      await send('/keep'); // end
      await send('#F7F4EA'); // background
      await send('#14241E'); // readable text on the light background
      await send('/skip');
      await send('/skip');
      expect((await list()).points[0].title).toBe('Integration Partner');
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).points[0].title).toBe('Edited Partner');
      expect((await list()).points[0].appearance).toEqual({
        backgroundColor: '#F7F4EA',
        textColor: '#14241E',
      });

      await send('/partner_banner balakovo');
      for (const value of [
        'Banner title',
        'Banner text',
        'Open',
        'https://example.com',
        point.id,
        new Date(Date.now() - 60_000).toISOString(),
        new Date(Date.now() + 30 * 60_000).toISOString(),
      ])
        await send(value);
      expect((await list()).banner).toBeNull();
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).banner?.title).toBe('Banner title');
      expect((await list()).banner?.appearance).toEqual({
        backgroundColor: '#F7F4EA',
        textColor: '#14241E',
      });
      await send('/partner_banner_off balakovo');
      expect((await list()).banner).toBeNull();
      await send('/partner_banner_quick balakovo text');
      await send('Updated banner');
      await send('New offer');
      await click(`pp:confirm:${await draftRevision()}`);
      expect((await list()).banner).toBeNull();
      expect(
        (
          await prisma.partnerCityBanner.findUniqueOrThrow({
            where: { cityId: 'balakovo' },
          })
        ).title,
      ).toBe('Updated banner');
      await send('/partner_banner_enable balakovo');
      expect((await list()).banner?.title).toBe('Updated banner');
      await send('/partner_banner_quick balakovo action');
      await send('See details');
      await send('https://example.org');
      await click(`pp:confirm:${await draftRevision()}`);
      expect(
        ((await list()).banner?.button as { label: string } | undefined)?.label,
      ).toBe('See details');
      await send('/partner_banner_quick balakovo period');
      await send('/keep');
      await send(new Date(Date.now() + 40 * 60_000).toISOString());
      await click(`pp:confirm:${await draftRevision()}`);
      expect(
        ((await list()).banner?.button as { label: string } | undefined)?.label,
      ).toBe('See details');
      expect(
        (
          await prisma.partnerPoint.findUniqueOrThrow({
            where: { id: point.id },
          })
        ).endsAt,
      ).toEqual(originalEnd);

      await send(`/partner_price point ${point.id} 1200.50`);
      const banner = await prisma.partnerCityBanner.findUniqueOrThrow({
        where: { cityId: 'balakovo' },
      });
      await send(`/partner_price banner ${banner.id} 500`);
      await send(`/partner_paid point ${point.id}`);
      await send(`/partner_paid banner ${banner.id}`);
      const publicResult = await list();
      expect(publicResult.points[0]).not.toHaveProperty('agreedPriceKopecks');
      expect(publicResult.points[0]).not.toHaveProperty('paidAt');
      expect(publicResult.banner).not.toHaveProperty('agreedPriceKopecks');
      expect(publicResult.banner).not.toHaveProperty('paidAt');

      await send(`/partner_pause ${point.id}`);
      expect((await list()).points).toHaveLength(0);
      expect((await list()).banner).toBeNull();
      await send(`/partner_resume ${point.id}`);
      expect((await list()).points).toHaveLength(1);
      expect((await list()).banner).not.toBeNull();
      await send(`/partner_end ${point.id}`);
      expect((await list()).points).toHaveLength(0);
      expect((await list()).banner).toBeNull();
    });

    it('excludes expired/future/draft/unlocated points and preserves /queue', async () => {
      const before = new Date(Date.now() - 2 * 60 * 60_000);
      const recent = new Date(Date.now() - 60 * 60_000);
      const future = new Date(Date.now() + 60 * 60_000);
      const later = new Date(Date.now() + 2 * 60 * 60_000);
      for (const [title, status, startsAt, endsAt, coordinates] of [
        ['Expired', 'ACTIVE', before, recent, true],
        ['Future', 'ACTIVE', future, later, true],
        ['Draft', 'DRAFT', recent, later, true],
        ['Unlocated', 'ACTIVE', recent, later, false],
      ] as const) {
        await prisma.partnerPoint.create({
          data: {
            cityId: 'balakovo',
            title,
            category: 'SERVICE',
            status,
            startsAt,
            endsAt,
            longitude: coordinates ? 47.8 : null,
            latitude: coordinates ? 52 : null,
          },
        });
      }
      expect((await list()).points).toHaveLength(0);
      transport.mockClear();
      await send('/queue');
      expect(transport).toHaveBeenCalledWith(
        'sendMessage',
        expect.objectContaining({ chat_id: String(OWNER_ID) }),
      );
    });

    it('keeps real report threshold, /queue, restore callback and audit working', async () => {
      const eventId = randomUUID();
      const reporter = (index: number) =>
        `partner-it-${eventId.slice(0, 8)}-${index}`;
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await prisma.$executeRaw`
        INSERT INTO road_events
          (id, city_id, type, status, title, longitude, latitude, location,
           created_by_installation_id, updated_at, expires_at)
        VALUES
          (${eventId}::uuid, 'balakovo', 'ACCIDENT'::"RoadEventType",
           'ACTIVE'::"RoadEventStatus", 'Moderation integration test', 47.8, 52.0,
           ST_SetSRID(ST_MakePoint(47.8, 52.0), 4326),
           'partner-integration-author', NOW(), ${expiresAt})
      `;
      const first = await reports.report(eventId, reporter(0), 'WRONG_TYPE');
      expect(first).toMatchObject({ duplicate: false, hidden: false });
      const duplicate = await reports.report(
        eventId,
        reporter(0),
        'WRONG_TYPE',
      );
      expect(duplicate.duplicate).toBe(true);
      for (let index = 1; index < 10; index += 1) {
        const result = await reports.report(
          eventId,
          reporter(index),
          'WRONG_LOCATION',
        );
        expect(result.hidden).toBe(index === 9);
      }
      expect(
        (await prisma.roadEvent.findUniqueOrThrow({ where: { id: eventId } }))
          .status,
      ).toBe('HIDDEN_PENDING_REVIEW');
      expect(
        await prisma.roadEventModerationCase.count({
          where: { roadEventId: eventId },
        }),
      ).toBe(1);
      expect(
        await prisma.telegramModerationOutbox.count({
          where: { roadEventId: eventId },
        }),
      ).toBe(1);
      expect(gateway.broadcastHidden).toHaveBeenCalledTimes(1);

      transport.mockClear();
      await send('/queue');
      expect(transport).toHaveBeenCalledWith(
        'sendMessage',
        expect.objectContaining({ chat_id: String(OWNER_ID) }),
      );
      await click(`restore:${eventId}`);
      expect(
        (await prisma.roadEvent.findUniqueOrThrow({ where: { id: eventId } }))
          .status,
      ).toBe('ACTIVE');
      expect(
        (
          await prisma.roadEventModerationCase.findUniqueOrThrow({
            where: { roadEventId: eventId },
          })
        ).state,
      ).toBe('RESTORED');
      expect(
        await prisma.roadEventModerationAudit.count({
          where: { roadEventId: eventId },
        }),
      ).toBe(1);
      expect(gateway.broadcastUpdated).toHaveBeenCalledTimes(1);
      await click(`restore:${eventId}`);
      expect(
        await prisma.roadEventModerationAudit.count({
          where: { roadEventId: eventId },
        }),
      ).toBe(1);
      expect(gateway.broadcastUpdated).toHaveBeenCalledTimes(1);
    });
  },
);
