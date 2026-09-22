import 'dotenv/config';

import { Api, helpers, utils } from 'telegram';
import type { Entity } from 'telegram/define';

import { TelegramMtprotoClientFactory } from '../src/integrations/telegram/telegram-mtproto-client.factory';
import { normalizeTelegramMtprotoMessage } from '../src/integrations/telegram/telegram-mtproto.mapper';
import { TELEGRAM_DEFAULT_CITY_ID } from '../src/integrations/telegram/telegram-city-source.registry';
import { BALAKOVO_LOCATION_DICTIONARY } from '../src/integrations/telegram/parser/balakovo-location.dictionary';
import { TelegramMessageParser } from '../src/integrations/telegram/parser/telegram-message.parser';
import { normalizeTelegramText } from '../src/integrations/telegram/parser/telegram-message.normalizer';
import type {
  BalakovoLocationKind,
  TelegramParserEventType,
  TelegramParserIntent,
  TelegramParserResult,
  TelegramParserState,
} from '../src/integrations/telegram/parser/telegram-parser.types';
import type { TelegramMessage } from '../src/integrations/telegram/telegram.types';

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1_000;
const CONTEXT_MESSAGE_LIMIT = 5;
const REVIEW_LIMIT = 20;

type MiningLocationKind =
  | 'STREET'
  | 'INTERSECTION'
  | 'BRIDGE'
  | 'DISTRICT'
  | 'LANDMARK'
  | 'ROAD'
  | 'OTHER';

interface MiningEntry {
  readonly message: TelegramMessage;
  readonly result: TelegramParserResult;
  readonly replyMessage?: TelegramMessage;
}

interface MutableLocationObservation {
  readonly canonicalCandidate: string;
  readonly observedAliases: Set<string>;
  readonly examples: Set<string>;
  readonly kind: MiningLocationKind;
  readonly existingAlias: boolean;
  occurrenceCount: number;
}

const intents: readonly TelegramParserIntent[] = [
  'REPORT',
  'QUESTION',
  'UPDATE',
  'RESOLUTION',
  'NOISE',
];
const eventTypes: readonly TelegramParserEventType[] = [
  'ACCIDENT',
  'TRAFFIC_JAM',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'HAZARD',
  'ROAD_STATE',
  'OTHER',
  'DPS',
];
const states: readonly TelegramParserState[] = [
  'ACTIVE',
  'RESOLVED',
  'UNKNOWN',
];

const run = async (): Promise<void> => {
  const limit = parseLimit(process.argv.slice(2));
  const config = readConfig();
  const client = new TelegramMtprotoClientFactory().create(config);

  try {
    await client.connect();

    if (!(await client.checkAuthorization())) {
      throw new Error('Telegram MTProto session is not authorized');
    }

    const entity = await resolveSourceEntity(client, config.sourceChatId);
    const sourceChatId = utils.getPeerId(entity);
    const isChannel =
      entity instanceof Api.Channel && entity.broadcast === true;
    const rawMessages = await client.getMessages(entity, { limit });
    const messages = rawMessages
      .map((rawMessage) =>
        normalizeTelegramMtprotoMessage(
          {
            rawMessage,
            chatId: safePeerId(rawMessage.peerId),
            isChannel,
            isEdited:
              rawMessage.editDate !== null && rawMessage.editDate !== undefined,
          },
          sourceChatId,
          TELEGRAM_DEFAULT_CITY_ID,
        ),
      )
      .filter((message): message is TelegramMessage => message !== null)
      .sort(
        (left, right) =>
          Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
      );
    const entries = parseCorpus(messages);
    const output = buildMiningOutput(rawMessages.length, entries);

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await client.disconnect();
  }
};

const parseLimit = (args: readonly string[]): number => {
  let limit = DEFAULT_LIMIT;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument !== '--limit') {
      throw new Error(`Unknown argument: ${argument ?? ''}`);
    }

    const value = Number(args[index + 1]);

    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) {
      throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}`);
    }

    limit = value;
    index += 1;
  }

  return limit;
};

const readConfig = (): {
  apiId: number;
  apiHash: string;
  session: string;
  sourceChatId: string;
} => {
  const apiId = Number(process.env.TELEGRAM_API_ID?.trim());
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  const session = process.env.TELEGRAM_SESSION?.trim() ?? '';
  const sourceChatId = process.env.TELEGRAM_SOURCE_CHAT_ID?.trim() ?? '';

  if (
    !Number.isSafeInteger(apiId) ||
    apiId <= 0 ||
    apiHash.length === 0 ||
    session.length === 0 ||
    sourceChatId.length === 0
  ) {
    throw new Error('Telegram MTProto configuration is incomplete');
  }

  return { apiId, apiHash, session, sourceChatId };
};

const resolveSourceEntity = async (
  client: ReturnType<TelegramMtprotoClientFactory['create']>,
  sourceChatId: string,
): Promise<Entity> => {
  if (!/^-?\d+$/u.test(sourceChatId)) {
    return client.getEntity(sourceChatId);
  }

  const canonicalChatId = helpers.returnBigInt(sourceChatId).toString();
  const dialogs = await client.getDialogs({ limit: undefined });
  const dialog = dialogs.find(
    (candidate) => candidate.id?.toString() === canonicalChatId,
  );

  if (dialog?.entity === undefined) {
    throw new Error('Configured Telegram source could not be resolved');
  }

  return dialog.entity;
};

const safePeerId = (peer: Api.TypePeer): string => {
  try {
    return utils.getPeerId(peer);
  } catch {
    return '';
  }
};

const parseCorpus = (
  messages: readonly TelegramMessage[],
): readonly MiningEntry[] => {
  const parser = new TelegramMessageParser();
  const byExternalId = new Map(
    messages.map((message) => [message.externalId, message]),
  );

  return messages.map((message, index) => {
    const replyMessage = message.replyToExternalId
      ? byExternalId.get(message.replyToExternalId)
      : undefined;
    const result = parser.parse({
      message,
      ...(replyMessage === undefined ? {} : { replyMessage }),
      previousMessages: messages.slice(
        Math.max(0, index - CONTEXT_MESSAGE_LIMIT),
        index,
      ),
    });

    return {
      message,
      result,
      ...(replyMessage === undefined ? {} : { replyMessage }),
    };
  });
};

const buildMiningOutput = (
  rawMessageCount: number,
  entries: readonly MiningEntry[],
): Record<string, unknown> => {
  const locations = discoverLocations(entries);
  const unknownLocations = locations.filter(
    (location) => !location.existingAlias,
  );
  const safeToAdd = unknownLocations.filter(isSafeToAdd);
  const reviewRequired = unknownLocations.filter(
    (location) => !safeToAdd.includes(location),
  );
  const falseNegativeCandidates = entries
    .filter(isFalseNegativeCandidate)
    .slice(0, REVIEW_LIMIT)
    .map(reviewEntry);
  const suspiciousParserResults = entries
    .filter(hasSuspiciousLocation)
    .slice(0, REVIEW_LIMIT)
    .map(reviewEntry);

  return {
    corpusSummary: {
      rawMessages: rawMessageCount,
      totalMessages: entries.length,
      nonEmptyMessages: entries.filter(
        ({ message }) => message.text.trim().length > 0,
      ).length,
      timeRange: timeRange(entries.map(({ message }) => message)),
    },
    parserStats: parserStatistics(entries),
    discoveredLocations: locations.slice(0, 60).map(locationOutput),
    safeToAdd: safeToAdd.slice(0, 30).map(locationOutput),
    reviewRequired: reviewRequired.slice(0, 40).map(locationOutput),
    falseNegativeCandidates,
    suspiciousParserResults,
    reviewDataset: {
      questions: entries
        .filter(({ result }) => result.intent === 'QUESTION')
        .slice(0, REVIEW_LIMIT)
        .map(reviewEntry),
      resolutions: entries
        .filter(({ result }) => result.intent === 'RESOLUTION')
        .slice(0, REVIEW_LIMIT)
        .map(reviewEntry),
      multiLocation: entries
        .filter(({ result }) => result.locations.length > 1)
        .slice(0, REVIEW_LIMIT)
        .map(reviewEntry),
    },
    recommendedParserChanges: recommendedChanges(
      falseNegativeCandidates.length,
      suspiciousParserResults.length,
      reviewRequired.length,
    ),
  };
};

const parserStatistics = (
  entries: readonly MiningEntry[],
): Record<string, unknown> => {
  const results = entries.map(({ result }) => result);

  return {
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
    unmatched: results.filter((result) => !result.matched).length,
    contextUsed: results.filter((result) => result.contextUsed).length,
    replyContextUsed: entries.filter(
      ({ replyMessage, result }) =>
        replyMessage !== undefined && result.contextUsed,
    ).length,
    locationResolutionAllowed: results.filter(
      (result) => result.locationResolutionAllowed,
    ).length,
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
  };
};

const discoverLocations = (
  entries: readonly MiningEntry[],
): readonly MutableLocationObservation[] => {
  const observations = new Map<string, MutableLocationObservation>();

  for (const { message, result } of entries) {
    const normalizedMessage = normalizeTelegramText(message.text);

    for (const location of result.locations) {
      const dictionaryEntry = BALAKOVO_LOCATION_DICTIONARY.find(
        (entry) => entry.id === location.alias,
      );
      const canonicalCandidate = dictionaryEntry?.title ?? location.text;
      const key = dictionaryEntry?.id ?? normalizeCandidate(canonicalCandidate);
      const observedAlias =
        dictionaryEntry?.aliases
          .filter((alias) => normalizedMessage.includes(alias))
          .sort((left, right) => right.length - left.length)[0] ??
        normalizeCandidate(location.text);
      const existing = observations.get(key);

      if (existing !== undefined) {
        existing.occurrenceCount += 1;
        existing.observedAliases.add(observedAlias);
        existing.examples.add(sanitizeText(message.text));
        continue;
      }

      observations.set(key, {
        canonicalCandidate,
        observedAliases: new Set([observedAlias]),
        examples: new Set([sanitizeText(message.text)]),
        kind: dictionaryEntry?.kind
          ? dictionaryKind(dictionaryEntry.kind)
          : probableKind(location.text),
        existingAlias: dictionaryEntry !== undefined,
        occurrenceCount: 1,
      });
    }
  }

  return [...observations.values()].sort(
    (left, right) =>
      right.occurrenceCount - left.occurrenceCount ||
      left.canonicalCandidate.localeCompare(right.canonicalCandidate, 'ru'),
  );
};

const isSafeToAdd = (location: MutableLocationObservation): boolean =>
  location.occurrenceCount >= 2 &&
  location.kind === 'LANDMARK' &&
  /^[\p{L}-]+(?:\s+[\p{L}-]+)?$/u.test(location.canonicalCandidate) &&
  !isSuspiciousLocationText(location.canonicalCandidate);

const locationOutput = (
  location: MutableLocationObservation,
): Record<string, unknown> => ({
  canonicalCandidate: location.canonicalCandidate,
  observedAliases: [...location.observedAliases].slice(0, 8),
  occurrenceCount: location.occurrenceCount,
  examples: [...location.examples].slice(0, 3),
  kind: location.kind,
  existingAlias: location.existingAlias,
  ...(!location.existingAlias && !isSafeToAdd(location)
    ? { status: 'REVIEW_REQUIRED' }
    : {}),
});

const isFalseNegativeCandidate = ({ message, result }: MiningEntry): boolean =>
  !result.matched &&
  normalizeTelegramText(message.text).split(' ').length <= 14 &&
  ROAD_HINT_PATTERN.test(normalizeTelegramText(message.text));

const hasSuspiciousLocation = ({ result }: MiningEntry): boolean =>
  result.locations.some((location) => isSuspiciousLocationText(location.text));

const isSuspiciousLocationText = (text: string): boolean => {
  const normalized = normalizeCandidate(text);

  return (
    normalized.length < 3 ||
    TEMPORAL_OR_SERVICE_PATTERN.test(normalized) ||
    /^(?:актив|чисто|свободно|как|там|тут|в обе стороны)$/u.test(normalized)
  );
};

const reviewEntry = ({
  message,
  result,
}: MiningEntry): Record<string, unknown> => ({
  text: sanitizeText(message.text),
  eventType: result.eventType,
  intent: result.intent,
  state: result.state,
  matched: result.matched,
  locationText: result.locationText,
  locationAlias: result.locationAlias,
  locations: result.locations,
  contextUsed: result.contextUsed,
  confidence: result.confidence,
});

const recommendedChanges = (
  falseNegativeCount: number,
  suspiciousCount: number,
  reviewLocationCount: number,
): readonly string[] => [
  ...(falseNegativeCount > 0
    ? ['Review repeated road-chat terms in falseNegativeCandidates']
    : []),
  ...(suspiciousCount > 0
    ? ['Remove confirmed temporal/service phrases from extracted locations']
    : []),
  ...(reviewLocationCount > 0
    ? ['Validate REVIEW_REQUIRED aliases before changing the dictionary']
    : []),
];

const probableKind = (text: string): MiningLocationKind => {
  const normalized = normalizeCandidate(text);

  if (normalized.includes('/')) {
    return 'INTERSECTION';
  }

  if (/мост|путепровод/u.test(normalized)) {
    return 'BRIDGE';
  }

  if (/улиц|проспект|шоссе/u.test(normalized)) {
    return 'STREET';
  }

  if (/дорог|трасс|спуск|подъем/u.test(normalized)) {
    return 'ROAD';
  }

  if (/микр|район|жг/u.test(normalized)) {
    return 'DISTRICT';
  }

  if (/вокзал|аэс|гэс|загс|админк|кпп/u.test(normalized)) {
    return 'LANDMARK';
  }

  return 'OTHER';
};

const dictionaryKind = (kind: BalakovoLocationKind): MiningLocationKind =>
  kind === 'AREA' || kind === 'SETTLEMENT' ? 'OTHER' : kind;

const normalizeCandidate = (text: string): string =>
  normalizeTelegramText(text).replace(/\s+/gu, ' ').trim();

const sanitizeText = (text: string): string =>
  text
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/@[\p{L}\p{N}_]+/gu, '[user]')
    .replace(/(?:\+?\d[\s()-]*){7,}/gu, '[number]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180);

const timeRange = (
  messages: readonly TelegramMessage[],
): { from: string; to: string } | null => {
  const timestamps = messages
    .map((message) => Date.parse(message.publishedAt))
    .filter(Number.isFinite);

  return timestamps.length === 0
    ? null
    : {
        from: new Date(Math.min(...timestamps)).toISOString(),
        to: new Date(Math.max(...timestamps)).toISOString(),
      };
};

const ROAD_HINT_PATTERN =
  /дпс|дтп|авар|проб|затор|мост|дорог|проезд|стоят|чисто|актив|пост|экипаж|палк|перекр|ремонт|яма|движ|кпп|микр|вокзал|транспорт/u;

const TEMPORAL_OR_SERVICE_PATTERN =
  /(?:^|\s)(?:сейчас|только что|\d+\s+минут(?:у|ы)? назад|актив|чисто|как|кто знает|в обе стороны)(?:\s|$)/u;

void run().catch(() => {
  process.stderr.write(
    'Telegram parser mining failed. Check configuration and arguments.\n',
  );
  process.exitCode = 1;
});
