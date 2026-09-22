import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { Api } from 'telegram';

import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { TelegramMtprotoClient } from '../src/integrations/telegram/telegram-mtproto.client';
import { TelegramMtprotoSource } from '../src/integrations/telegram/telegram-mtproto.source';
import { TelegramCitySourceRegistry } from '../src/integrations/telegram/telegram-city-source.registry';
import { TelegramIntegrationError } from '../src/integrations/telegram/telegram.errors';
import { TelegramMessageParser } from '../src/integrations/telegram/parser/telegram-message.parser';
import type {
  TelegramParserEventType,
  TelegramParserIntent,
  TelegramParserResult,
  TelegramParserState,
} from '../src/integrations/telegram/parser/telegram-parser.types';
import type { TelegramMessage } from '../src/integrations/telegram/telegram.types';

const HISTORY_LIMIT = 30;
const LIVE_WINDOW_MS = 20_000;
type TelegramSmokeStage =
  'CONFIG' | 'CONNECT' | 'SOURCE_RESOLVE' | 'HISTORY_FETCH' | 'SUBSCRIBE';

let currentStage: TelegramSmokeStage = 'CONFIG';

const intents: readonly TelegramParserIntent[] = [
  'REPORT',
  'QUESTION',
  'UPDATE',
  'RESOLUTION',
  'NOISE',
];
const eventTypes: readonly TelegramParserEventType[] = [
  'DPS',
  'ACCIDENT',
  'TRAFFIC_JAM',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'HAZARD',
  'ROAD_STATE',
  'OTHER',
];
const states: readonly TelegramParserState[] = [
  'ACTIVE',
  'RESOLVED',
  'UNKNOWN',
];

const run = async (): Promise<void> => {
  const configService = new ConfigService(process.env);
  const client = new TelegramMtprotoClient(
    configService,
    new TelegramMtprotoClientFactory(),
  );
  const source = new TelegramMtprotoSource(
    client,
    new TelegramCitySourceRegistry(configService),
  );
  const parser = new TelegramMessageParser();
  let disconnected = false;

  try {
    currentStage = 'CONFIG';
    const available = source.isAvailable();
    currentStage = 'CONNECT';
    const resolvedSource = await client.connect();
    currentStage = 'SOURCE_RESOLVE';
    const sourceType = getSourceType(resolvedSource.entity);
    const title = getSourceTitle(resolvedSource.entity);
    currentStage = 'HISTORY_FETCH';
    const rawEnvelopes = await client.getRecentMessages(HISTORY_LIMIT);
    const recent = [...(await source.getRecentMessages(HISTORY_LIMIT))].sort(
      (left, right) =>
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
    );
    const repeatedHistory = await source.getRecentMessages(HISTORY_LIMIT);
    const byExternalId = new Map(
      recent.map((message) => [message.externalId, message]),
    );
    const parserResults = recent.map((message, index) => {
      const replyMessage = message.replyToExternalId
        ? byExternalId.get(message.replyToExternalId)
        : undefined;
      const result = parser.parse({
        message,
        ...(replyMessage === undefined ? {} : { replyMessage }),
        previousMessages: recent.slice(Math.max(0, index - 5), index),
      });

      return { message, result, replyMessage };
    });
    const replyMessages = recent.filter(
      (message) => message.replyToExternalId !== undefined,
    );
    const replyTargetsInWindow = replyMessages.filter((message) =>
      byExternalId.has(message.replyToExternalId ?? ''),
    );
    const replyContextUsed = parserResults.filter(
      ({ message, result, replyMessage }) =>
        message.replyToExternalId !== undefined &&
        replyMessage !== undefined &&
        result.contextUsed,
    ).length;
    const liveMessages: Array<{
      message: TelegramMessage;
      result: TelegramParserResult;
    }> = [];
    let liveListenerStarted = false;
    let liveListenerRuntimeError = false;
    const handleLiveRuntimeError = (): void => {
      liveListenerRuntimeError = true;
    };

    process.on('uncaughtException', handleLiveRuntimeError);
    process.on('unhandledRejection', handleLiveRuntimeError);

    try {
      currentStage = 'SUBSCRIBE';
      await source.start((message) => {
        const replyMessage = message.replyToExternalId
          ? byExternalId.get(message.replyToExternalId)
          : undefined;
        const result = parser.parse({
          message,
          ...(replyMessage === undefined ? {} : { replyMessage }),
          previousMessages: recent.slice(-5),
        });

        liveMessages.push({ message, result });
        byExternalId.set(message.externalId, message);
        recent.push(message);
      });
      liveListenerStarted = true;

      await new Promise<void>((resolve) => {
        setTimeout(resolve, LIVE_WINDOW_MS);
      });
    } finally {
      await source.stop();
      process.off('uncaughtException', handleLiveRuntimeError);
      process.off('unhandledRejection', handleLiveRuntimeError);
    }

    const rawTextCount = rawEnvelopes.filter((envelope) => {
      if (!isRecord(envelope.rawMessage)) {
        return false;
      }

      return (
        typeof envelope.rawMessage.message === 'string' &&
        envelope.rawMessage.message.trim().length > 0
      );
    }).length;
    const times = recent
      .slice(0, parserResults.length)
      .map((message) => Date.parse(message.publishedAt))
      .filter(Number.isFinite);
    const summary = {
      source: {
        available,
        title,
        type: sourceType,
        id: resolvedSource.chatId,
        exactlyOneResolvedSource: true,
      },
      recent: {
        requested: HISTORY_LIMIT,
        rawReceived: rawEnvelopes.length,
        withNonEmptyText: rawTextCount,
        normalized: parserResults.length,
        replies: replyMessages.length,
        replyTargetsInsideWindow: replyTargetsInWindow.length,
        replyTargetsOutsideWindow:
          replyMessages.length - replyTargetsInWindow.length,
        edited: recent
          .slice(0, parserResults.length)
          .filter((message) => message.editedAt !== undefined).length,
        rawSourceTypes: [
          ...new Set(
            recent
              .slice(0, parserResults.length)
              .map((message) => message.rawSourceType),
          ),
        ],
        timeRange:
          times.length === 0
            ? null
            : {
                from: new Date(Math.min(...times)).toISOString(),
                to: new Date(Math.max(...times)).toISOString(),
              },
        foreignSourceMessages: recent
          .slice(0, parserResults.length)
          .filter((message) => message.chatId !== resolvedSource.chatId).length,
        repeatedHistoryAcceptedAsNew: repeatedHistory.length,
      },
      parser: buildParserStatistics(parserResults.map(({ result }) => result)),
      context: {
        replyContextUsed,
      },
      live: {
        listenerStarted: liveListenerStarted,
        runtimeError: liveListenerRuntimeError,
        messages: liveMessages.length,
        edits: liveMessages.filter(
          ({ message }) => message.editedAt !== undefined,
        ).length,
        parserInvocations: liveMessages.length,
        foreignSourceMessages: liveMessages.filter(
          ({ message }) => message.chatId !== resolvedSource.chatId,
        ).length,
      },
      reviewCandidates: selectReviewCandidates(parserResults),
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await source.disconnect();
    disconnected = true;
    process.stderr.write(
      `MTProto disconnect: ${disconnected ? 'ok' : 'failed'}\n`,
    );
  }
};

const buildParserStatistics = (
  results: readonly TelegramParserResult[],
): Record<string, unknown> => ({
  intents: Object.fromEntries(
    intents.map((intent) => [
      intent,
      results.filter((result) => result.intent === intent).length,
    ]),
  ),
  eventTypes: Object.fromEntries(
    eventTypes.map((eventType) => [
      eventType,
      results.filter((result) => result.eventType === eventType).length,
    ]),
  ),
  states: Object.fromEntries(
    states.map((state) => [
      state,
      results.filter((result) => result.state === state).length,
    ]),
  ),
  matched: results.filter((result) => result.matched).length,
  locationResolutionAllowed: results.filter(
    (result) => result.locationResolutionAllowed,
  ).length,
  contextUsed: results.filter((result) => result.contextUsed).length,
  confidence: {
    zero: results.filter((result) => result.confidence === 0).length,
    low: results.filter(
      (result) => result.confidence > 0 && result.confidence < 0.5,
    ).length,
    medium: results.filter(
      (result) => result.confidence >= 0.5 && result.confidence < 0.8,
    ).length,
    high: results.filter((result) => result.confidence >= 0.8).length,
  },
});

const selectReviewCandidates = (
  entries: readonly {
    message: TelegramMessage;
    result: TelegramParserResult;
  }[],
): readonly Record<string, unknown>[] => {
  const roadHint =
    /дпс|дтп|авар|проб|мост|дорог|проезд|стоят|чисто|пост|экипаж|перекр|ремонт|яма|движ/u;
  const candidates = entries.filter(
    ({ message, result }) =>
      result.matched || roadHint.test(message.text.toLocaleLowerCase('ru-RU')),
  );

  return candidates.slice(0, 10).map(({ message, result }) => ({
    text: sanitize(message.text),
    matched: result.matched,
    eventType: result.eventType,
    intent: result.intent,
    state: result.state,
    locationText: result.locationText,
    locationResolutionAllowed: result.locationResolutionAllowed,
    confidence: result.confidence,
    contextUsed: result.contextUsed,
  }));
};

const sanitize = (text: string): string =>
  text
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/@[\p{L}\p{N}_]+/gu, '[user]')
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[number]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);

const getSourceType = (entity: unknown): string => {
  if (entity instanceof Api.Channel) {
    return entity.megagroup === true ? 'supergroup' : 'channel';
  }

  if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) {
    return 'group';
  }

  return 'other';
};

const getSourceTitle = (entity: unknown): string => {
  if (
    (entity instanceof Api.Channel ||
      entity instanceof Api.Chat ||
      entity instanceof Api.ChatForbidden) &&
    typeof entity.title === 'string'
  ) {
    return entity.title;
  }

  return 'Unknown';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const integrationErrorStage = (
  error: TelegramIntegrationError,
): TelegramSmokeStage => {
  if (error.code === 'DISABLED') {
    return 'CONFIG';
  }

  if (error.code === 'SOURCE_NOT_FOUND') {
    return 'SOURCE_RESOLVE';
  }

  if (error.code === 'AUTH_FAILED' || error.code === 'INVALID_SESSION') {
    return 'CONNECT';
  }

  return currentStage;
};

const safeErrorMessage = (message: string): string | undefined => {
  let safeMessage = message.replace(/\s+/gu, ' ').trim();
  const sensitiveValues = [
    process.env.TELEGRAM_SESSION,
    process.env.TELEGRAM_API_HASH,
    process.env.TELEGRAM_API_ID,
    process.env.TELEGRAM_PHONE,
  ].filter((value): value is string => value !== undefined && value.length > 0);

  for (const value of sensitiveValues) {
    safeMessage = safeMessage.split(value).join('[redacted]');
  }

  safeMessage = safeMessage
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[redacted]')
    .replace(/\b[\da-f]{32,}\b/giu, '[redacted]')
    .replace(/\b[A-Za-z0-9+/_=-]{40,}\b/gu, '[redacted]')
    .slice(0, 240);

  return safeMessage.length === 0 ? undefined : safeMessage;
};

const safeErrorName = (error: Error): string => {
  const candidate = error.name || error.constructor.name;

  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(candidate)
    ? candidate
    : 'UnknownError';
};

const formatSmokeError = (error: unknown): string => {
  if (error instanceof TelegramIntegrationError) {
    const message = safeErrorMessage(error.message);
    const summary = `${error.code} at ${integrationErrorStage(error)}`;

    return message === undefined ? summary : `${summary} — ${message}`;
  }

  if (error instanceof Error) {
    const message = safeErrorMessage(error.message);
    const summary = `${safeErrorName(error)} at ${currentStage}`;

    return message === undefined ? summary : `${summary} — ${message}`;
  }

  return `UnknownError at ${currentStage}`;
};

void run().catch((error: unknown) => {
  process.stderr.write(`Telegram smoke failed: ${formatSmokeError(error)}\n`);
  process.exitCode = 1;
});
