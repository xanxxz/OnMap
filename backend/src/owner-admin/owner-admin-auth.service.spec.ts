jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service';
import { OwnerAdminAuthService } from './owner-admin-auth.service';
import { isAllowedHttpOrigin } from '../cors/http-cors';
import { parsePlacementDate } from '../partner-placements/partner-bot.flow';
import { ownerAdminOrigin } from './owner-admin.config';
const setup = (enabled = 'true') => {
  let row: {
    ownerTelegramId: string;
    tokenHash: string;
    expiresAt: Date;
  } | null = null;
  const audit = jest.fn();
  const session = {
    findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
      Promise.resolve(row?.tokenHash === where.tokenHash ? row : null),
    ),
    upsert: jest.fn(({ create }: { create: NonNullable<typeof row> }) => {
      row = create;
      return Promise.resolve(row);
    }),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { tokenHash: string };
        data: { tokenHash: string };
      }) => {
        if (row?.tokenHash !== where.tokenHash)
          return Promise.resolve({ count: 0 });
        row.tokenHash = data.tokenHash;
        return Promise.resolve({ count: 1 });
      },
    ),
    deleteMany: jest.fn(() => {
      row = null;
      return Promise.resolve({ count: 1 });
    }),
  };
  const tx = { ownerAdminSession: session, ownerAdminAudit: { create: audit } };
  const prisma = {
    ...tx,
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return {
    auth: new OwnerAdminAuthService(
      prisma,
      new ConfigService({
        OWNER_ADMIN_ENABLED: enabled,
        TELEGRAM_PARTNER_OWNER_IDS: '123456',
      }),
    ),
    getRow: () => row,
    audit,
  };
};
describe('owner capability', () => {
  it('is disabled by default and rejects unlisted owners', async () => {
    await expect(setup('false').auth.issue('123456')).rejects.toThrow();
    await expect(setup().auth.issue('999')).rejects.toThrow();
  });
  it('does not accept missing, invalid or mobile identity tokens', async () => {
    const { auth } = setup();
    for (const token of [undefined, 'Bearer invalid', 'Bearer v1.fake.mobile'])
      await expect(auth.authenticate(token)).rejects.toThrow();
  });
  it('stores only a hash, accepts the owner and expires the capability', async () => {
    const h = setup();
    const issued = await h.auth.issue('123456');
    expect(h.getRow()?.tokenHash).toBe(
      createHash('sha256').update(issued.token).digest('hex'),
    );
    expect(JSON.stringify(h.getRow())).not.toContain(issued.token);
    expect((await h.auth.authenticate('Bearer ' + issued.token)).ownerId).toBe(
      '123456',
    );
    h.getRow()!.expiresAt = new Date(0);
    await expect(
      h.auth.authenticate('Bearer ' + issued.token),
    ).rejects.toThrow();
  });
  it('rotates without extending expiry and revokes the previous capability', async () => {
    const { auth } = setup();
    const first = await auth.issue('123456');
    const actor = await auth.authenticate('Bearer ' + first.token);
    const next = await auth.rotate(actor);
    expect(next.expiresAt).toEqual(first.expiresAt);
    await expect(auth.authenticate('Bearer ' + first.token)).rejects.toThrow();
    await auth.revoke(await auth.authenticate('Bearer ' + next.token));
    await expect(auth.authenticate('Bearer ' + next.token)).rejects.toThrow();
  });
  it('limits valid owner requests', async () => {
    const { auth } = setup();
    const issued = await auth.issue('123456');
    for (let i = 0; i < 120; i++)
      await auth.authenticate('Bearer ' + issued.token);
    await expect(
      auth.authenticate('Bearer ' + issued.token),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('revokes the previous token on reissue and limits repeated issuance', async () => {
    const { auth } = setup();
    const first = await auth.issue('123456');
    await auth.issue('123456');
    await expect(auth.authenticate('Bearer ' + first.token)).rejects.toThrow();
    await auth.issue('123456');
    await expect(auth.issue('123456')).rejects.toMatchObject({ status: 429 });
  });
  it('allows only the exact local admin browser origin even if a public origin is allowlisted', () => {
    expect(
      isAllowedHttpOrigin(
        '/api/owner-admin/points',
        'http://127.0.0.1:4173',
        'https://site.example',
        undefined,
      ),
    ).toBe(true);
    expect(
      isAllowedHttpOrigin(
        '/api/owner-admin/points',
        'https://site.example',
        'https://site.example',
        undefined,
      ),
    ).toBe(false);
    expect(
      isAllowedHttpOrigin(
        '/api/owner-admin',
        'http://localhost:4173',
        undefined,
        undefined,
      ),
    ).toBe(false);
    expect(
      isAllowedHttpOrigin(
        '/api/road-events',
        'https://site.example',
        'https://site.example',
        undefined,
      ),
    ).toBe(true);
    expect(
      isAllowedHttpOrigin('/api/road-events', undefined, undefined, undefined),
    ).toBe(true);
    expect(() => ownerAdminOrigin('http://0.0.0.0:4173')).toThrow();
  });
});

describe('strict placement dates', () => {
  it('rejects a normalized nonexistent calendar day', () => {
    expect(parsePlacementDate('2026-02-30T12:00+04:00')).toBeNull();
    expect(parsePlacementDate('2024-02-29T12:00+04:00')).toBe(
      '2024-02-29T08:00:00.000Z',
    );
  });
});
