import { getCityConfig } from '../../../cities/city.registry';
import type {
  CityConfig,
  CityLocationConfig,
} from '../../../cities/city.types';
import { buildTelegramParserContext } from './telegram-context.builder';
import {
  TELEGRAM_CONTEXT_UPDATE_PATTERNS,
  TELEGRAM_BASELINE_TEMPORAL_PATTERN,
  TELEGRAM_DPS_SUPPORT_PATTERN,
  TELEGRAM_EDITORIAL_MIN_SENTENCE_COUNT,
  TELEGRAM_EDITORIAL_MIN_WORD_COUNT,
  TELEGRAM_EDITORIAL_NEWS_PATTERNS,
  TELEGRAM_EDITORIAL_OFFICIAL_TERM_PATTERNS,
  TELEGRAM_EDITORIAL_PROCEDURE_PATTERN,
  TELEGRAM_EVENT_TERM_RULES,
  TELEGRAM_LOCATION_ACTION_WORD_PATTERN,
  TELEGRAM_LOCATION_BOILERPLATE_PATTERN,
  TELEGRAM_PARSER_MAX_LOCATION_LENGTH,
  TELEGRAM_PROMOTIONAL_PATTERNS,
  TELEGRAM_QUESTION_PATTERN,
  TELEGRAM_REALTIME_REPORT_PATTERN,
  TELEGRAM_REVERSE_QUESTION_PATTERN,
  TELEGRAM_RESOLUTION_PATTERNS,
  TELEGRAM_TEMPORAL_PATTERN,
  TELEGRAM_UNIT_COUNT_PATTERN,
  TELEGRAM_VEHICLE_PATTERN,
} from './telegram-parser.constants';
import type {
  NormalizedTelegramParserMessage,
  TelegramParserEventType,
  TelegramParserInput,
  TelegramParserIntent,
  TelegramLocationDirection,
  TelegramParserLocation,
  TelegramParserResult,
  TelegramParserState,
  TelegramParserTermRule,
} from './telegram-parser.types';

const EVENT_PRIORITY: readonly Exclude<TelegramParserEventType, 'OTHER'>[] = [
  'ACCIDENT',
  'ROAD_CLOSURE',
  'ROADWORKS',
  'HAZARD',
  'TRAFFIC_JAM',
  'DPS',
  'ROAD_STATE',
];

interface LocationMatch {
  readonly text: string | null;
  readonly alias: string | null;
}

interface EventCandidate {
  readonly eventType: Exclude<TelegramParserEventType, 'OTHER'>;
  readonly score: number;
  readonly maxTermWeight: number;
  readonly matchedTerms: readonly string[];
}

interface DirectAnalysis {
  readonly matched: boolean;
  readonly eventType: TelegramParserEventType;
  readonly intent: TelegramParserIntent;
  readonly state: TelegramParserState;
  readonly location: LocationMatch;
  readonly locations: readonly LocationMatch[];
  readonly direction: TelegramLocationDirection | null;
  readonly matchedTerms: readonly string[];
  readonly strongTermMatched: boolean;
  readonly hasResolution: boolean;
  readonly hasContextUpdate: boolean;
  readonly reason: string;
}

export class TelegramMessageParser {
  constructor(
    private readonly cityConfigProvider: (
      cityId: string,
    ) => CityConfig | undefined = getCityConfig,
    private readonly qualityGuardsEnabled = true,
  ) {}

  parse(input: TelegramParserInput): TelegramParserResult {
    const context = buildTelegramParserContext(
      input,
      this.qualityGuardsEnabled,
    );
    const cityLocations =
      this.cityConfigProvider(input.message.cityId)?.locations ?? [];
    const current = analyzeDirectMessage(
      context.current,
      cityLocations,
      this.qualityGuardsEnabled,
    );
    const relevantContext = context.nearby
      .map((message) => ({
        message,
        analysis: analyzeDirectMessage(
          message,
          cityLocations,
          this.qualityGuardsEnabled,
        ),
      }))
      .find(({ analysis }) => analysis.matched);

    if (!current.matched) {
      if (
        relevantContext !== undefined &&
        canUseContext(
          current,
          context.current.normalizedText,
          this.qualityGuardsEnabled,
        ) &&
        (current.hasResolution || current.hasContextUpdate)
      ) {
        const intent: TelegramParserIntent = current.hasResolution
          ? 'RESOLUTION'
          : 'UPDATE';
        const state: TelegramParserState = current.hasResolution
          ? 'RESOLVED'
          : current.hasContextUpdate
            ? 'ACTIVE'
            : 'UNKNOWN';

        return buildResult({
          eventType: relevantContext.analysis.eventType,
          intent,
          state,
          location: relevantContext.analysis.location,
          locations: relevantContext.analysis.locations,
          direction: relevantContext.analysis.direction,
          matchedTerms: uniqueTerms([
            ...current.matchedTerms,
            ...relevantContext.analysis.matchedTerms,
          ]),
          contextUsed: true,
          contextSource: relevantContext.message.contextSource,
          contextMessageId: relevantContext.message.externalId ?? null,
          strongTermMatched: relevantContext.analysis.strongTermMatched,
          reason: current.hasResolution
            ? 'context-inherited-resolution'
            : 'context-inherited-update',
        });
      }

      return unmatchedResult(current.reason, current.locations);
    }

    let eventType = current.eventType;
    let intent = current.intent;
    let state = current.state;
    let location = current.location;
    let locations = current.locations;
    let direction = current.direction;
    let contextUsed = false;
    let contextSource: TelegramParserResult['contextSource'] = 'NONE';
    let contextMessageId: string | null = null;
    let matchedTerms = [...current.matchedTerms];
    let strongTermMatched = current.strongTermMatched;
    let reason = current.reason;

    if (relevantContext !== undefined) {
      const shouldInheritSpecificType =
        eventType === 'ROAD_STATE' &&
        relevantContext.analysis.eventType !== 'ROAD_STATE' &&
        (current.hasResolution || current.hasContextUpdate);

      if (shouldInheritSpecificType) {
        eventType = relevantContext.analysis.eventType;
        contextUsed = true;
      }

      if (
        location.text === null &&
        relevantContext.analysis.location.text !== null &&
        isShortMessage(context.current.normalizedText)
      ) {
        location = relevantContext.analysis.location;
        locations = relevantContext.analysis.locations;
        direction = relevantContext.analysis.direction;
        contextUsed = true;
      }

      if (
        intent === 'REPORT' &&
        (contextUsed || relevantContext.analysis.intent === 'QUESTION')
      ) {
        intent = 'UPDATE';
        state = 'ACTIVE';
        contextUsed = true;
      }

      if (contextUsed) {
        contextSource = relevantContext.message.contextSource;
        contextMessageId = relevantContext.message.externalId ?? null;
        matchedTerms = uniqueTerms([
          ...matchedTerms,
          ...relevantContext.analysis.matchedTerms,
        ]);
        strongTermMatched ||= relevantContext.analysis.strongTermMatched;
        reason = current.hasResolution
          ? 'context-confirmed-resolution'
          : 'context-enriched-event';
      }
    }

    return buildResult({
      eventType,
      intent,
      state,
      location,
      locations,
      direction,
      matchedTerms,
      contextUsed,
      contextSource,
      contextMessageId,
      strongTermMatched,
      reason,
    });
  }
}

const analyzeDirectMessage = (
  message: NormalizedTelegramParserMessage,
  dictionary: readonly CityLocationConfig[],
  qualityGuardsEnabled: boolean,
): DirectAnalysis => {
  const text = message.normalizedText;

  if (qualityGuardsEnabled && isPromotionalMessage(text)) {
    return directNoise('promotional-message');
  }
  const hasQuestion =
    message.hadQuestionMark ||
    TELEGRAM_QUESTION_PATTERN.test(text) ||
    TELEGRAM_REVERSE_QUESTION_PATTERN.test(text);
  const resolutionMatches = matchRules(text, TELEGRAM_RESOLUTION_PATTERNS);
  const contextUpdateMatches = matchRules(
    text,
    TELEGRAM_CONTEXT_UPDATE_PATTERNS,
  );
  const candidates = EVENT_PRIORITY.map((eventType) => {
    const matches = matchRules(text, TELEGRAM_EVENT_TERM_RULES[eventType]);

    return {
      eventType,
      score: matches.reduce((sum, match) => sum + match.weight, 0),
      maxTermWeight: Math.max(0, ...matches.map((match) => match.weight)),
      matchedTerms: uniqueTerms(matches.map((match) => match.term)),
    } satisfies EventCandidate;
  })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        EVENT_PRIORITY.indexOf(left.eventType) -
          EVENT_PRIORITY.indexOf(right.eventType),
    );

  const allMatchedRules = EVENT_PRIORITY.flatMap((eventType) =>
    matchRules(text, TELEGRAM_EVENT_TERM_RULES[eventType]),
  );
  const locationExtraction = extractLocations(
    text,
    [...allMatchedRules, ...resolutionMatches, ...contextUpdateMatches],
    hasQuestion,
    dictionary,
    qualityGuardsEnabled,
  );
  const { locations, direction } = locationExtraction;
  const location = locations[0] ?? { text: null, alias: null };
  const selected = candidates.find((candidate) =>
    isCandidateSafe(candidate, text, location, hasQuestion),
  );
  const hasResolution = resolutionMatches.length > 0;
  const hasContextUpdate = contextUpdateMatches.length > 0;

  if (selected === undefined) {
    const isLocationQuestion =
      hasQuestion &&
      location.text !== null &&
      (location.alias !== null ||
        locations.some((candidate) => candidate.alias !== null) ||
        /(?:мост|улиц|шоссе|микрорайон|перекресток)/u.test(location.text) ||
        /(?<![\p{L}\p{N}])(?:на|по|у|возле|около)(?![\p{L}\p{N}])/u.test(text));

    if (isLocationQuestion) {
      return {
        matched: true,
        eventType: 'ROAD_STATE',
        intent: 'QUESTION',
        state: 'UNKNOWN',
        location,
        locations,
        direction,
        matchedTerms: [],
        strongTermMatched: false,
        hasResolution,
        hasContextUpdate,
        reason: 'location-question',
      };
    }

    const knownLocations = locations.every(
      (candidate) => candidate.alias !== null,
    )
      ? locations
      : [];

    return {
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      state: 'UNKNOWN',
      location: knownLocations[0] ?? { text: null, alias: null },
      locations: knownLocations,
      direction,
      matchedTerms: uniqueTerms([
        ...resolutionMatches.map((match) => match.term),
        ...contextUpdateMatches.map((match) => match.term),
      ]),
      strongTermMatched: false,
      hasResolution,
      hasContextUpdate,
      reason: 'noise',
    };
  }

  if (isEditorialAccidentReference(message, selected, qualityGuardsEnabled)) {
    return {
      matched: false,
      eventType: 'OTHER',
      intent: 'NOISE',
      state: 'UNKNOWN',
      location: { text: null, alias: null },
      locations: [],
      direction: null,
      matchedTerms: selected.matchedTerms,
      strongTermMatched: false,
      hasResolution,
      hasContextUpdate,
      reason: 'editorial-accident-reference',
    };
  }

  const roadStateQuestion = hasQuestion && selected.eventType === 'ROAD_STATE';
  const intent: TelegramParserIntent = roadStateQuestion
    ? 'QUESTION'
    : hasResolution
      ? 'RESOLUTION'
      : hasQuestion
        ? 'QUESTION'
        : 'REPORT';
  const state: TelegramParserState = roadStateQuestion
    ? 'UNKNOWN'
    : hasResolution
      ? 'RESOLVED'
      : hasQuestion
        ? 'UNKNOWN'
        : 'ACTIVE';

  return {
    matched: true,
    eventType: selected.eventType,
    intent,
    state,
    location,
    locations,
    direction,
    matchedTerms: uniqueTerms([
      ...selected.matchedTerms,
      ...resolutionMatches.map((match) => match.term),
    ]),
    strongTermMatched: selected.maxTermWeight >= 4,
    hasResolution,
    hasContextUpdate,
    reason: hasResolution ? 'direct-resolution' : 'direct-event-terms',
  };
};

const isCandidateSafe = (
  candidate: EventCandidate,
  text: string,
  location: LocationMatch,
  hasQuestion: boolean,
): boolean => {
  if (candidate.eventType === 'ROAD_STATE') {
    return location.text !== null || hasQuestion;
  }

  if (candidate.eventType === 'DPS') {
    if (candidate.matchedTerms.every((term) => term === 'номер экипажа')) {
      return location.alias !== null;
    }

    const hasOnlyAmbiguousDpsTerms = candidate.matchedTerms.every((term) =>
      ['стоят', 'пост'].includes(term),
    );

    if (hasOnlyAmbiguousDpsTerms) {
      return (
        location.text !== null &&
        !/(?<![\p{L}\p{N}])(?:канал|публикаци|сообщени)[\p{L}]*(?![\p{L}\p{N}])/u.test(
          text,
        )
      );
    }
  }

  if (candidate.eventType === 'DPS' && candidate.maxTermWeight < 4) {
    return (
      location.text !== null &&
      (TELEGRAM_DPS_SUPPORT_PATTERN.test(text) || candidate.maxTermWeight >= 2)
    );
  }

  if (candidate.eventType === 'TRAFFIC_JAM' && candidate.maxTermWeight < 4) {
    return location.text !== null;
  }

  return true;
};

const extractLocations = (
  text: string,
  matchedRules: readonly TelegramParserTermRule[],
  hasQuestion: boolean,
  dictionary: readonly CityLocationConfig[],
  qualityGuardsEnabled: boolean,
): {
  readonly locations: readonly LocationMatch[];
  readonly direction: TelegramLocationDirection | null;
} => {
  let candidate = text;

  candidate = candidate.replace(TELEGRAM_UNIT_COUNT_PATTERN, ' ');

  for (const rule of matchedRules) {
    candidate = candidate.replace(asGlobal(rule.pattern), ' ');
  }

  candidate = candidate.replace(
    asGlobal(
      qualityGuardsEnabled
        ? TELEGRAM_TEMPORAL_PATTERN
        : TELEGRAM_BASELINE_TEMPORAL_PATTERN,
    ),
    ' ',
  );
  candidate = candidate
    .replace(TELEGRAM_LOCATION_BOILERPLATE_PATTERN, ' ')
    .replace(asGlobal(TELEGRAM_VEHICLE_PATTERN), ' ');

  const candidateWithoutIdentifiers = candidate
    .replace(/(?<![\p{L}\p{N}])\d{4}(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (
    TELEGRAM_VEHICLE_PATTERN.test(text) ||
    findLocationAlias(dictionary, candidateWithoutIdentifiers) !== undefined
  ) {
    candidate = candidateWithoutIdentifiers;
  }

  if (hasQuestion) {
    candidate = candidate.replace(
      /(?<![\p{L}\p{N}])(?:как|поживает)(?![\p{L}\p{N}])/gu,
      ' ',
    );
  }

  candidate = candidate
    .replace(TELEGRAM_QUESTION_PATTERN, ' ')
    .replace(TELEGRAM_REVERSE_QUESTION_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const directional = extractDirectionalLocations(
    candidate,
    dictionary,
    qualityGuardsEnabled,
  );

  if (directional !== null) {
    return directional;
  }

  candidate = candidate
    .replace(
      /(?<![\p{L}\p{N}])(?:в обе стороны|с (?:двух|\d+) сторон|со стороны|в сторону|на|по|у|в|возле|около|в районе|район|перекресток|улица|там|тут|здесь|сейчас|уже|еще|обе стороны|сторону|стороны|две|машин(?:а|ы)?|дорога|дороге|движение|лежит|лежат|стоит|поехал(?:а|и)?|ехать|не доезжая|въезде|въезд|заранее спасибо|спасибо|хавал|веста|актив|активно)(?![\p{L}\p{N}])/gu,
      ' ',
    )
    .replace(/\s+и\s+/gu, ' / ')
    .replace(/^(?:и|\/)\s+|\s+(?:и|\/)$/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*([,;])\s*/gu, '$1')
    .replace(/^[\s/-]+|[\s/-]+$/gu, '')
    .trim();

  if (/^(?:мосту|моста)$/u.test(candidate)) {
    candidate = 'мост';
  }

  if (
    candidate.length === 0 ||
    candidate.length > TELEGRAM_PARSER_MAX_LOCATION_LENGTH ||
    (!/\p{L}/u.test(candidate) &&
      findLocationAlias(dictionary, candidate) === undefined)
  ) {
    return { locations: [], direction: null };
  }

  return {
    locations: splitLocationCandidates(candidate, dictionary)
      .map((location) => resolveLocation(location, dictionary))
      .filter((location): location is LocationMatch => location !== null),
    direction: null,
  };
};

const extractDirectionalLocations = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
  qualityGuardsEnabled: boolean,
): {
  readonly locations: readonly LocationMatch[];
  readonly direction: TelegramLocationDirection;
} | null => {
  const patterns: readonly {
    readonly pattern: RegExp;
    readonly relation: TelegramLocationDirection['relation'];
    readonly baseIndex: number;
    readonly targetIndex: number;
    readonly includeTarget: boolean;
  }[] = [
    {
      pattern: /^от\s+(.+?)\s+до\s+(.+)$/u,
      relation: 'BETWEEN',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: true,
    },
    {
      pattern: /^(.+?)\s+до\s+(.+)$/u,
      relation: 'BETWEEN',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: !qualityGuardsEnabled,
    },
    {
      pattern: /^от\s+(.+?)\s+в сторону\s+(.+)$/u,
      relation: 'TOWARDS',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^под\s+(.+?)\s+со стороны\s+(.+)$/u,
      relation: 'NEAR',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^против\s+(.+?)\s+в\s+(.+)$/u,
      relation: 'NEAR',
      baseIndex: 2,
      targetIndex: 1,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+перед\s+(.+)$/u,
      relation: 'BEFORE',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+после\s+(.+)$/u,
      relation: 'AFTER',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^после\s+(.+)$/u,
      relation: 'AFTER',
      baseIndex: 1,
      targetIndex: 1,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+поворот на\s+(.+)$/u,
      relation: 'TOWARDS',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+(?:как ехать |)в сторону\s+(.+)$/u,
      relation: 'TOWARDS',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+как ехать в\s+(.+)$/u,
      relation: 'TOWARDS',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+со стороны\s+(.+)$/u,
      relation: 'FROM',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
    {
      pattern: /^(.+?)\s+(?:у|около|возле)\s+(.+)$/u,
      relation: 'NEAR',
      baseIndex: 1,
      targetIndex: 2,
      includeTarget: false,
    },
  ];

  for (const rule of patterns) {
    const match = candidate.match(rule.pattern);

    if (match === null) continue;

    const base = resolveDirectionalFragment(
      match[rule.baseIndex] ?? '',
      dictionary,
    );
    const targetRaw = cleanDirectionalFragment(match[rule.targetIndex] ?? '');
    const target = resolveDirectionalFragment(targetRaw, dictionary);

    if (base === null || base.alias === null) continue;

    const locations = [
      base,
      ...(rule.includeTarget && target !== null ? [target] : []),
    ];

    return {
      locations,
      direction: {
        relation: rule.relation,
        ...(target?.alias === null || target?.alias === undefined
          ? {}
          : { targetLocationId: target.alias }),
        ...(targetRaw.length === 0 ? {} : { targetText: targetRaw }),
      },
    };
  }

  return null;
};

const resolveDirectionalFragment = (
  fragment: string,
  dictionary: readonly CityLocationConfig[],
): LocationMatch | null =>
  resolveLocation(cleanDirectionalFragment(fragment), dictionary);

const cleanDirectionalFragment = (fragment: string): string =>
  fragment
    .replace(
      /^(?:на|по|у|в|возле|около|под|против|со стороны|в сторону)\s+/u,
      '',
    )
    .replace(TELEGRAM_LOCATION_ACTION_WORD_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const splitLocationCandidates = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
): readonly string[] => {
  if (findLocationAlias(dictionary, candidate) !== undefined) {
    return [candidate];
  }

  const explicitList = candidate
    .split(/[,;]/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (/[,;]/u.test(candidate)) {
    return explicitList;
  }

  const slashParts = candidate
    .split(/\s*\/\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (slashParts.length <= 1) {
    return (
      preferSpecificTrailingAlias(candidate, dictionary) ??
      preferConfirmedApproximateSettlement(candidate, dictionary) ??
      splitAdjacentKnownAliases(candidate, dictionary) ?? [candidate]
    );
  }

  const aliases = slashParts.map((part) => findLocationAlias(dictionary, part));
  const isKnownNonStreetList =
    aliases.some((alias) => alias !== undefined) &&
    aliases.every((alias) => alias?.kind !== 'STREET');

  return isKnownNonStreetList ? slashParts : [candidate];
};

const preferSpecificTrailingAlias = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
): readonly string[] | null => {
  for (const entry of dictionary) {
    if (!['AREA', 'DISTRICT', 'SETTLEMENT'].includes(entry.kind ?? '')) {
      continue;
    }

    for (const alias of entry.aliases) {
      const prefix = `${alias} `;

      if (!candidate.startsWith(prefix)) continue;

      const remainder = candidate.slice(prefix.length).trim();
      const trailing = findLocationAlias(dictionary, remainder);

      if (
        trailing !== undefined &&
        !['AREA', 'DISTRICT', 'SETTLEMENT'].includes(trailing.kind ?? '')
      ) {
        return [remainder];
      }
    }
  }

  return null;
};

const preferConfirmedApproximateSettlement = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
): readonly string[] | null => {
  const ivanovka = dictionary.find((entry) => entry.id === 'ivanovka');

  if (ivanovka === undefined) return null;

  const alias = ivanovka.aliases.find((entryAlias) =>
    candidate.startsWith(`${entryAlias} `),
  );

  if (alias === undefined) return null;

  const remainder = candidate.slice(alias.length).trim();

  return /^(?:в\s+)?конце\s+(?:деревни|села)(?:\s|$)/u.test(remainder)
    ? [alias]
    : null;
};

const resolveLocation = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
): LocationMatch | null => {
  const directAlias = findLocationAlias(dictionary, candidate);

  if (directAlias !== undefined) {
    return { text: directAlias.title, alias: directAlias.id };
  }

  if (
    candidate.length === 0 ||
    candidate.length > TELEGRAM_PARSER_MAX_LOCATION_LENGTH ||
    !/\p{L}/u.test(candidate)
  ) {
    return null;
  }

  const cleanedCandidate = candidate
    .replace(TELEGRAM_LOCATION_ACTION_WORD_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (cleanedCandidate.length === 0 || !/\p{L}/u.test(cleanedCandidate)) {
    return null;
  }

  const alias = findLocationAlias(dictionary, cleanedCandidate);

  return alias === undefined
    ? { text: cleanedCandidate, alias: null }
    : { text: alias.title, alias: alias.id };
};

const splitAdjacentKnownAliases = (
  candidate: string,
  dictionary: readonly CityLocationConfig[],
): readonly string[] | null => {
  for (const entry of dictionary) {
    for (const alias of entry.aliases) {
      const prefix = `${alias} `;

      if (!candidate.startsWith(prefix)) {
        continue;
      }

      const remainder = candidate.slice(prefix.length).trim();
      const secondEntry = findLocationAlias(dictionary, remainder);

      if (
        secondEntry !== undefined &&
        isSafeIndependentAliasPair(entry, remainder)
      ) {
        return [alias, remainder];
      }
    }
  }

  return null;
};

const isSafeIndependentAliasPair = (
  firstEntry: CityLocationConfig,
  secondAlias: string,
): boolean => /^\d+$/u.test(secondAlias) && firstEntry.kind !== 'STREET';

const findLocationAlias = (
  dictionary: readonly CityLocationConfig[],
  normalizedLocation: string,
): CityLocationConfig | undefined =>
  dictionary.find((entry) => entry.aliases.includes(normalizedLocation));

const buildResult = (input: {
  eventType: TelegramParserEventType;
  intent: TelegramParserIntent;
  state: TelegramParserState;
  location: LocationMatch;
  locations: readonly LocationMatch[];
  direction: TelegramLocationDirection | null;
  matchedTerms: readonly string[];
  contextUsed: boolean;
  contextSource?: TelegramParserResult['contextSource'];
  contextMessageId?: string | null;
  strongTermMatched: boolean;
  reason: string;
}): TelegramParserResult => {
  const confidence = calculateConfidence({
    strongTermMatched: input.strongTermMatched,
    matchedTermCount: input.matchedTerms.length,
    intent: input.intent,
    eventType: input.eventType,
    location: input.location,
    contextUsed: input.contextUsed,
  });

  return {
    matched: true,
    eventType: input.eventType,
    intent: input.intent,
    state: input.state,
    locationText: input.location.text,
    locationAlias: input.location.alias,
    locations: input.locations.filter(
      (location): location is TelegramParserLocation => location.text !== null,
    ),
    direction: input.direction,
    locationResolutionAllowed:
      input.location.text !== null && input.intent !== 'QUESTION',
    confidence,
    matchedTerms: uniqueTerms(input.matchedTerms),
    contextUsed: input.contextUsed,
    contextSource: input.contextSource ?? 'NONE',
    contextMessageId: input.contextMessageId ?? null,
    reason: input.reason,
  };
};

const calculateConfidence = (input: {
  strongTermMatched: boolean;
  matchedTermCount: number;
  intent: TelegramParserIntent;
  eventType: TelegramParserEventType;
  location: LocationMatch;
  contextUsed: boolean;
}): number => {
  let score = input.strongTermMatched ? 0.55 : 0.32;

  score += Math.min(input.matchedTermCount, 2) * 0.04;

  if (input.intent === 'REPORT' || input.intent === 'RESOLUTION') {
    score += 0.08;
  } else if (input.intent === 'UPDATE') {
    score += 0.06;
  } else if (input.intent === 'QUESTION') {
    score += 0.03;
  }

  score +=
    input.location.alias !== null
      ? 0.2
      : input.location.text !== null
        ? 0.12
        : 0;
  score += input.contextUsed ? 0.1 : 0;
  score -= input.eventType === 'ROAD_STATE' ? 0.04 : 0;

  return Math.min(0.98, Math.max(0.1, Number(score.toFixed(2))));
};

const unmatchedResult = (
  reason = 'noise',
  locations: readonly LocationMatch[] = [],
): TelegramParserResult => {
  const location = locations[0] ?? { text: null, alias: null };

  return {
    matched: false,
    eventType: 'OTHER',
    intent: 'NOISE',
    state: 'UNKNOWN',
    locationText: location.text,
    locationAlias: location.alias,
    locations: locations.filter(
      (candidate): candidate is TelegramParserLocation =>
        candidate.text !== null,
    ),
    direction: null,
    locationResolutionAllowed: false,
    confidence: 0,
    matchedTerms: [],
    contextUsed: false,
    contextSource: 'NONE',
    contextMessageId: null,
    reason,
  };
};

const isEditorialAccidentReference = (
  message: NormalizedTelegramParserMessage,
  candidate: EventCandidate,
  includeNewsEvidence: boolean,
): boolean => {
  if (candidate.eventType !== 'ACCIDENT') {
    return false;
  }

  const wordCount = message.normalizedText.split(' ').filter(Boolean).length;
  const sentenceCount = message.text
    .split(/[.!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
  const officialTermCount = TELEGRAM_EDITORIAL_OFFICIAL_TERM_PATTERNS.filter(
    (pattern) => pattern.test(message.normalizedText),
  ).length;
  const newsTermCount = TELEGRAM_EDITORIAL_NEWS_PATTERNS.filter((pattern) =>
    pattern.test(message.normalizedText),
  ).length;

  return (
    wordCount >= TELEGRAM_EDITORIAL_MIN_WORD_COUNT &&
    sentenceCount >= TELEGRAM_EDITORIAL_MIN_SENTENCE_COUNT &&
    ((officialTermCount >= 2 &&
      TELEGRAM_EDITORIAL_PROCEDURE_PATTERN.test(message.normalizedText) &&
      !TELEGRAM_REALTIME_REPORT_PATTERN.test(message.normalizedText)) ||
      (includeNewsEvidence && newsTermCount >= 2))
  );
};

const isPromotionalMessage = (text: string): boolean =>
  TELEGRAM_PROMOTIONAL_PATTERNS.filter((pattern) => pattern.test(text))
    .length >= 2;

const canUseContext = (
  analysis: DirectAnalysis,
  normalizedText: string,
  qualityGuardsEnabled: boolean,
): boolean =>
  (analysis.hasResolution || analysis.hasContextUpdate) &&
  (!qualityGuardsEnabled ||
    normalizedText.split(' ').filter(Boolean).length <= 8);

const directNoise = (reason: string): DirectAnalysis => ({
  matched: false,
  eventType: 'OTHER',
  intent: 'NOISE',
  state: 'UNKNOWN',
  location: { text: null, alias: null },
  locations: [],
  direction: null,
  matchedTerms: [],
  strongTermMatched: false,
  hasResolution: false,
  hasContextUpdate: false,
  reason,
});

const matchRules = (
  text: string,
  rules: readonly TelegramParserTermRule[],
): TelegramParserTermRule[] => rules.filter((rule) => rule.pattern.test(text));

const asGlobal = (pattern: RegExp): RegExp =>
  new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );

const uniqueTerms = (terms: readonly string[]): string[] => [...new Set(terms)];

const isShortMessage = (text: string): boolean =>
  text.split(' ').filter(Boolean).length <= 6;
