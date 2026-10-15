import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { IdentityService } from '../../../identity/identity.service';
import type { PushMessage } from '../../../push/push-provider';
import { PushOwnerPairingService } from '../../../push/push-owner-pairing.service';
import { TelegramOwnerPanelService } from './telegram-owner-panel.service';

const dbUrl = process.env.PANEL_INTEGRATION_DATABASE_URL;
const runIntegration =
  process.env.PANEL_INTEGRATION_DISPOSABLE === '1' && Boolean(dbUrl);
const OWNER = String(900_000_000 + Math.floor(Math.random() * 50_000_000));
const OTHER = String(Number(OWNER) + 1);
const identityKey = `panel-qa-${randomUUID()}`;
let updateId = Math.floor(Date.now() / 1_000) * 1_000;
const message = (from: string, text: string) => ({
  update_id: updateId++,
  message: {
    text,
    from: { id: Number(from) },
    chat: { id: Number(from), type: 'private' },
  },
});
const callback = (from: string, data: string) => ({
  update_id: updateId++,
  callback_query: {
    id: `cb-${updateId}`,
    data,
    from: { id: Number(from) },
    message: { message_id: 10, chat: { id: Number(from), type: 'private' } },
  },
});
const button = (
  keyboard:
    | { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
    | undefined,
  label: string,
) =>
  keyboard?.inline_keyboard.flat().find((item) => item.text.includes(label))
    ?.callback_data;

(runIntegration ? describe : describe.skip)(
  'owner panel disposable PostgreSQL integration',
  () => {
    let prisma: PrismaService;
    let panel: TelegramOwnerPanelService;
    let pairing: PushOwnerPairingService;
    const send = jest.fn<Promise<{ status: 'SENT' }>, [PushMessage]>(() =>
      Promise.resolve({ status: 'SENT' }),
    );

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
      const config = {
        getOrThrow: () => dbUrl,
        get: (key: string) =>
          key === 'TELEGRAM_PARTNER_OWNER_IDS' ||
          key === 'TELEGRAM_MODERATION_CHAT_ID'
            ? OWNER
            : undefined,
      } as unknown as ConfigService;
      prisma = new PrismaService(config);
      await prisma.$connect();
      // This suite is restricted to a disposable database; keep reruns independent.
      await prisma.pushDevice.deleteMany({
        where: { token: { startsWith: 'test-token-' } },
      });
      panel = new TelegramOwnerPanelService(config, prisma);
      pairing = new PushOwnerPairingService(
        config,
        prisma,
        {
          pushDeviceIdentityKey: () => identityKey,
        } as unknown as IdentityService,
        { ready: true, send },
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('keeps outsiders out and renders role-aware button navigation', async () => {
      const outsider = await panel.process(message(OTHER, '/start'));
      expect(outsider.text).not.toContain('Партнёрские точки');
      const home = await panel.process(message(OWNER, '/start'));
      expect(home.text).toContain('панель владельца');
      for (const row of home.keyboard?.inline_keyboard ?? [])
        for (const action of row)
          expect(Buffer.byteLength(action.callback_data)).toBeLessThanOrEqual(
            64,
          );
      const pointsToken = button(home.keyboard, 'Партнёрские точки');
      expect(pointsToken).toMatch(/^ui:[A-Za-z0-9_-]{12}$/u);
      const stolen = await panel.process(callback(OTHER, pointsToken!));
      expect(stolen.callbackText).toBe('Недоступно');
      const points = await panel.process(callback(OWNER, pointsToken!));
      expect(points.text).toContain('Партнёрские точки');
      const stale = await panel.process(callback(OWNER, pointsToken!));
      expect(stale.text).toContain('Экран устарел');
      const next = callback(OWNER, button(points.keyboard, 'Создать точку')!);
      const chooseCity = await panel.process(next);
      expect(chooseCity.text).toContain('Выберите город');
      const duplicate = await panel.process(next);
      expect(duplicate.duplicate).toBe(true);
      const create = await panel.process(
        callback(OWNER, button(chooseCity.keyboard, 'balakovo')!),
      );
      expect(create.delegate).toEqual({
        kind: 'PARTNER',
        command: '/partner_new balakovo',
      });
    });

    it('paginates points, shows safe details and routes actions without UUID in callback', async () => {
      for (let index = 0; index < 8; index++)
        await prisma.partnerPoint.create({
          data: {
            cityId: 'balakovo',
            title: `Panel QA ${index}`,
            category: 'test',
            startsAt: new Date(Date.now() - 60_000),
            endsAt: new Date(Date.now() + 60 * 60_000),
          },
        });
      const home = await panel.process(message(OWNER, '/menu'));
      const list = await panel.process(
        callback(OWNER, button(home.keyboard, 'Партнёрские точки')!),
      );
      const pointButtons =
        list.keyboard?.inline_keyboard
          .flat()
          .filter((item) => item.text.startsWith('Panel QA')) ?? [];
      expect(pointButtons).toHaveLength(6);
      expect(pointButtons[0].callback_data).not.toContain('Panel QA');
      const detail = await panel.process(
        callback(OWNER, pointButtons[0].callback_data),
      );
      expect(detail.text).toContain('Panel QA');
      const edit = await panel.process(
        callback(OWNER, button(detail.keyboard, 'Редактировать')!),
      );
      expect(edit.delegate?.kind).toBe('PARTNER');
      expect(
        edit.delegate && 'command' in edit.delegate && edit.delegate.command,
      ).toMatch(/^\/partner_edit /u);
    });

    it('keeps case search owner-only and continues from text after navigation', async () => {
      const home = await panel.process(message(OWNER, '/menu'));
      const moderation = await panel.process(
        callback(OWNER, button(home.keyboard, 'Модерация')!),
      );
      const search = await panel.process(
        callback(OWNER, button(moderation.keyboard, 'Найти дело')!),
      );
      expect(search.text).toContain('Пришлите ID');
      expect(
        await panel.shouldHandleSearchText(message(OTHER, '12345678')),
      ).toBe(false);
      expect(
        await panel.shouldHandleSearchText(message(OWNER, '12345678')),
      ).toBe(true);
      const notFound = await panel.process(message(OWNER, '12345678'));
      expect(notFound.text).toContain('Дело не найдено');
      const stale = await panel.process(
        callback(OWNER, button(search.keyboard, '← Назад')!),
      );
      expect(stale.text).toContain('Модерация');
    });

    it('pairs only a registered device via one-time code and sends only a direct mocked test', async () => {
      const installationId = randomUUID();
      const device = await prisma.pushDevice.create({
        data: {
          identityKey,
          installationId,
          cityId: 'balakovo',
          platform: 'IOS',
          provider: 'APNS',
          token: `test-token-${randomUUID()}`,
          tokenHash: randomUUID().replace(/-/gu, '').padEnd(64, '1'),
          enabled: true,
          roadPushEnabled: true,
          newsPushEnabled: true,
        },
      });
      const code = await pairing.createCode(OWNER);
      await expect(pairing.createCode(OTHER)).rejects.toThrow();
      await expect(
        pairing.bindDevice('identity', installationId, '0000-0000-0000'),
      ).rejects.toThrow();
      const attempt = await prisma.pushOwnerPairingAttempt.findUnique({
        where: { identityKey },
      });
      expect(attempt?.count).toBe(1);
      await expect(
        pairing.bindDevice('identity', randomUUID(), code),
      ).rejects.toThrow();
      expect(
        await pairing.bindDevice('identity', installationId, code),
      ).toEqual({ paired: true });
      await expect(
        pairing.bindDevice('identity', installationId, code),
      ).rejects.toThrow();
      const campaign = await prisma.pushCampaign.create({
        data: {
          ownerTelegramId: OWNER,
          kind: 'GENERAL',
          cityIds: ['balakovo'],
          title: 'QA title',
          body: 'QA body',
          scheduleKind: 'ONCE',
          nextRunAt: new Date(Date.now() + 60_000),
        },
      });
      expect(await pairing.sendCampaignTest(OWNER, campaign.id)).toBe('SENT');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        token: device.token,
        title: campaign.title,
        body: campaign.body,
      });
      await expect(
        pairing.sendCampaignTest(OWNER, campaign.id),
      ).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('proves possession through a push challenge without a mobile build or mass outbox', async () => {
      send.mockClear();
      await expect(pairing.sendTelegramChallenge(OTHER)).rejects.toThrow();
      const home = await panel.process(message(OWNER, '/menu'));
      const settings = await panel.process(
        callback(OWNER, button(home.keyboard, 'Настройки')!),
      );
      const challengeButton = button(
        settings.keyboard,
        'Прислать код на единственный iPhone',
      );
      const challengeAction = await panel.process(
        callback(OWNER, challengeButton!),
      );
      expect(challengeAction.delegate).toEqual({ kind: 'PAIR_BY_PUSH' });
      expect(await pairing.sendTelegramChallenge(OWNER)).toBe('SENT');
      expect(send).toHaveBeenCalledTimes(1);
      const body = String(send.mock.calls[0][0].body);
      const code = /([0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4})/u.exec(body)?.[1];
      expect(code).toBeDefined();
      expect(await panel.shouldHandleSearchText(message(OTHER, code!))).toBe(
        false,
      );
      expect(await panel.shouldHandleSearchText(message(OWNER, code!))).toBe(
        true,
      );
      const reply = await panel.process(message(OWNER, code!));
      expect(reply.delegate).toEqual({ kind: 'PAIR_CONFIRM', code });
      await expect(
        pairing.confirmTelegramChallenge(OWNER, '0000-0000-0000'),
      ).rejects.toThrow();
      expect(await pairing.confirmTelegramChallenge(OWNER, code!)).toEqual({
        paired: true,
      });
      await expect(
        pairing.confirmTelegramChallenge(OWNER, code!),
      ).rejects.toThrow();
      expect(await prisma.pushOutbox.count()).toBe(0);
    });
  },
);
