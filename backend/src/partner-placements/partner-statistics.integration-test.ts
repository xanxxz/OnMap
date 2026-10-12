import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { PartnerInteractionAction } from './dto/record-partner-interaction.dto';
import { PartnerStatisticsService } from './partner-statistics.service';

const dbUrl = process.env.PARTNER_INTEGRATION_DATABASE_URL;
const disposable =
  process.env.PARTNER_INTEGRATION_DISPOSABLE === '1' && !!dbUrl;

(disposable ? describe : describe.skip)(
  'partner statistics on disposable PostGIS',
  () => {
    let prisma: PrismaService;
    let service: PartnerStatisticsService;
    let pointId: string;
    let contactId: string;
    let bannerId: string;

    beforeAll(async () => {
      const url = new URL(dbUrl!);
      if (
        url.hostname !== '127.0.0.1' ||
        !url.port ||
        !url.pathname.startsWith('/onmap_it')
      )
        throw new Error(
          'Statistics integration requires disposable loopback onmap_it database',
        );
      const config = new ConfigService({
        DATABASE_URL: dbUrl,
        IDENTITY_SIGNING_SECRET: 'disposable-test-secret',
      });
      prisma = new PrismaService(config);
      await prisma.$connect();
      service = new PartnerStatisticsService(
        prisma,
        new IdentityService(config),
      );
      const point = await prisma.partnerPoint.create({
        data: {
          id: randomUUID(),
          cityId: 'balakovo',
          title: 'Statistics integration only',
          category: 'SERVICE',
          latitude: 52,
          longitude: 47.8,
          status: 'ACTIVE',
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 3_600_000),
          contacts: {
            create: [
              {
                id: randomUUID(),
                type: 'PHONE',
                label: 'Call',
                value: '+70000000000',
                displayOrder: 0,
              },
            ],
          },
        },
        include: { contacts: true },
      });
      pointId = point.id;
      contactId = point.contacts[0].id;
      const banner = await prisma.partnerCityBanner.create({
        data: {
          id: randomUUID(),
          cityId: 'balakovo',
          partnerPointId: pointId,
          enabled: true,
          title: 'Offer',
          text: 'Offer text',
          buttonLabel: 'Open',
          buttonUrl: 'https://example.com',
          startsAt: point.startsAt,
          endsAt: point.endsAt,
        },
      });
      bannerId = banner.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      if (pointId) {
        await prisma.partnerCityBanner.deleteMany({ where: { id: bannerId } });
        await prisma.partnerStatDaily.deleteMany({
          where: { partnerPointId: pointId },
        });
        await prisma.partnerStatWindow.deleteMany({
          where: { partnerPointId: pointId },
        });
        await prisma.partnerPoint.delete({ where: { id: pointId } });
      }
      await prisma.$disconnect();
    });

    it('atomically counts one of two simultaneous requests, another actor, and specific contact/banner actions', async () => {
      const open = {
        action: PartnerInteractionAction.POINT_OPEN,
        targetId: pointId,
      };
      const parallel = await Promise.all([
        service.record(open, 'actor-one'),
        service.record(open, 'actor-one'),
      ]);
      expect(parallel.filter((result) => result.counted)).toHaveLength(1);
      expect(await service.record(open, 'actor-two')).toEqual({
        counted: true,
      });
      await service.record(
        {
          action: PartnerInteractionAction.CONTACT_CLICK,
          targetId: pointId,
          contactId,
        },
        'actor-one',
      );
      await service.record(
        {
          action: PartnerInteractionAction.BANNER_IMPRESSION,
          targetId: bannerId,
        },
        'actor-one',
      );
      await service.record(
        { action: PartnerInteractionAction.BANNER_CLICK, targetId: bannerId },
        'actor-one',
      );
      const rows = await prisma.partnerStatDaily.findMany({
        where: { partnerPointId: pointId },
      });
      expect(rows.find((row) => row.action === 'POINT_OPEN')?.count).toBe(2);
      expect(rows.find((row) => row.action === 'CONTACT_CLICK')).toMatchObject({
        detailId: contactId,
        count: 1,
      });
      expect(
        rows.find((row) => row.action === 'BANNER_IMPRESSION'),
      ).toMatchObject({ detailId: bannerId, count: 1 });
      expect(rows.find((row) => row.action === 'BANNER_CLICK')?.count).toBe(1);
      const windows = await prisma.partnerStatWindow.findMany({
        where: { partnerPointId: pointId },
      });
      expect(
        windows.every((row) => /^[a-f0-9]{64}$/u.test(row.actorHash)),
      ).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('+70000000000');
    });
  },
);
