import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type {
  TelegramCitySource,
  TelegramMessage,
  TelegramSourceCursor,
} from '../telegram.types';

interface TelegramSourceCursorRow {
  readonly cityId: string;
  readonly sourceChatId: string;
  readonly lastMessageId: bigint;
  readonly lastMessageTimestamp: Date | null;
}

@Injectable()
export class TelegramSourceCursorStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(source: TelegramCitySource): Promise<TelegramSourceCursor | null> {
    const rows = await this.prisma.$queryRaw<TelegramSourceCursorRow[]>`
      SELECT
        city_id AS "cityId",
        source_chat_id AS "sourceChatId",
        last_message_id AS "lastMessageId",
        last_message_timestamp AS "lastMessageTimestamp"
      FROM telegram_source_cursors
      WHERE city_id = ${source.cityId}
        AND source_chat_id = ${source.sourceChatId}
      LIMIT 1
    `;

    return rows[0] === undefined ? null : toCursor(rows[0]);
  }

  async initialize(
    source: TelegramCitySource,
    baseline: TelegramMessage | null,
  ): Promise<TelegramSourceCursor> {
    const lastMessageId = baseline === null ? 0n : messageId(baseline);
    const lastMessageTimestamp =
      baseline === null ? null : new Date(messageVersion(baseline));
    const rows = await this.prisma.$queryRaw<TelegramSourceCursorRow[]>`
      INSERT INTO telegram_source_cursors (
        city_id,
        source_chat_id,
        last_message_id,
        last_message_timestamp,
        updated_at
      )
      VALUES (
        ${source.cityId},
        ${source.sourceChatId},
        ${lastMessageId},
        ${lastMessageTimestamp},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (city_id, source_chat_id) DO UPDATE SET
        updated_at = telegram_source_cursors.updated_at
      RETURNING
        city_id AS "cityId",
        source_chat_id AS "sourceChatId",
        last_message_id AS "lastMessageId",
        last_message_timestamp AS "lastMessageTimestamp"
    `;

    const cursor = rows[0];

    if (cursor === undefined) {
      throw new Error('Telegram cursor initialization returned no row');
    }

    return toCursor(cursor);
  }

  async advance(
    source: TelegramCitySource,
    message: TelegramMessage,
  ): Promise<TelegramSourceCursor> {
    const lastMessageId = messageId(message);
    const lastMessageTimestamp = new Date(messageVersion(message));
    const rows = await this.prisma.$queryRaw<TelegramSourceCursorRow[]>`
      INSERT INTO telegram_source_cursors (
        city_id,
        source_chat_id,
        last_message_id,
        last_message_timestamp,
        updated_at
      )
      VALUES (
        ${source.cityId},
        ${source.sourceChatId},
        ${lastMessageId},
        ${lastMessageTimestamp},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (city_id, source_chat_id) DO UPDATE SET
        last_message_id = EXCLUDED.last_message_id,
        last_message_timestamp = EXCLUDED.last_message_timestamp,
        updated_at = CURRENT_TIMESTAMP
      WHERE
        telegram_source_cursors.last_message_id < EXCLUDED.last_message_id
        OR (
          telegram_source_cursors.last_message_id = EXCLUDED.last_message_id
          AND COALESCE(
            telegram_source_cursors.last_message_timestamp,
            '-infinity'::timestamptz
          ) < EXCLUDED.last_message_timestamp
        )
      RETURNING
        city_id AS "cityId",
        source_chat_id AS "sourceChatId",
        last_message_id AS "lastMessageId",
        last_message_timestamp AS "lastMessageTimestamp"
    `;

    return rows[0] === undefined
      ? ((await this.get(source)) as TelegramSourceCursor)
      : toCursor(rows[0]);
  }
}

const toCursor = (row: TelegramSourceCursorRow): TelegramSourceCursor => ({
  cityId: row.cityId,
  sourceChatId: row.sourceChatId,
  lastMessageId: row.lastMessageId.toString(),
  lastMessageTimestamp: row.lastMessageTimestamp?.toISOString() ?? null,
});

const messageId = (message: TelegramMessage): bigint => {
  const rawId = message.externalId.slice(
    message.externalId.lastIndexOf(':') + 1,
  );

  if (!/^\d+$/u.test(rawId)) {
    throw new Error('Telegram message ID is invalid');
  }

  return BigInt(rawId);
};

const messageVersion = (message: TelegramMessage): string =>
  message.editedAt ?? message.publishedAt;
