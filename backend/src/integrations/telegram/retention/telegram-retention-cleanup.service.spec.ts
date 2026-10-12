import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';
import { TelegramRetentionCleanupService } from './telegram-retention-cleanup.service';
import { TELEGRAM_RETENTION_MS } from './telegram-retention.constants';

jest.mock('../../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TelegramRetentionCleanupService', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('dry-run reports only changed field names and never returns stored text', async () => {
    const rawText = 'ДПС на Комарова, телефон +7 999 123-45-67';
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'event-1',
          sourceText: rawText,
          locationLabel: 'Комарова',
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new TelegramRetentionCleanupService(
      { get: () => false } as unknown as ConfigService,
      prisma,
    );

    const result = await service.scanDatabaseForRetention(
      new Date(now.getTime() - TELEGRAM_RETENTION_MS),
    );

    expect(result).toEqual({
      rowsScanned: 1,
      rowsChanged: 1,
      sourceTextFieldsChanged: 1,
      locationLabelFieldsChanged: 0,
      sample: [{ id: 'event-1', fields: ['source_text'] }],
    });
    expect(JSON.stringify(result)).not.toContain(rawText);
    const queryCalls = queryRaw.mock.calls as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ][];
    const query = queryCalls[0]?.[0];
    const sql = query.join('');
    expect(sql).toContain("source = 'TELEGRAM'");
    expect(sql).toContain("status = 'RESOLVED'");
    expect(sql).toContain('updated_at <=');
  });

  it('scrubs an eligible row once, leaves lifecycle fields untouched, and can be rerun', async () => {
    const rows = [
      {
        id: 'event-2',
        sourceText: 'ДПС на Комарова +7 999 123-45-67',
        locationLabel: null,
      },
    ];
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'event-2',
          sourceText: 'ДПС на Комарова [телефон скрыт]',
          locationLabel: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({ $queryRaw: queryRaw, $executeRaw: executeRaw }),
      ),
    );
    const prisma = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new TelegramRetentionCleanupService(
      { get: () => false } as unknown as ConfigService,
      prisma,
    );
    const cutoff = new Date(now.getTime() - TELEGRAM_RETENTION_MS);

    const applied = await service.applyDatabaseRetention(cutoff);
    const rerun = await service.applyDatabaseRetention(cutoff);

    expect(applied.rowsChanged).toBe(1);
    expect(applied.sourceTextFieldsChanged).toBe(1);
    expect(rerun.rowsChanged).toBe(0);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const updateCalls = executeRaw.mock.calls as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ][];
    const update = updateCalls[0]?.[0];
    const sql = update.join('');
    expect(sql).toContain('source_text =');
    expect(sql).toContain('location_label =');
    expect(sql).not.toContain('geometry');
    expect(sql).not.toContain('confidence');
    expect(sql).not.toContain('resolved_at');
    expect(sql).not.toContain('SET updated_at');
  });

  it('does not schedule destructive cleanup until explicitly enabled', () => {
    const queryRaw = jest.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new TelegramRetentionCleanupService(
      { get: () => undefined } as unknown as ConfigService,
      prisma,
    );

    service.onApplicationBootstrap();

    expect(queryRaw).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('resolves from the Nest container using only explicit application providers', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramRetentionCleanupService,
        { provide: ConfigService, useValue: { get: () => false } },
        { provide: PrismaService, useValue: { $queryRaw: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(TelegramRetentionCleanupService)).toBeInstanceOf(
      TelegramRetentionCleanupService,
    );
    await moduleRef.close();
  });
});
