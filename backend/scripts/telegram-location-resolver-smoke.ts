import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { TelegramLocationResolver } from '../src/integrations/telegram/location-resolver/telegram-location-resolver';
import type { TelegramLocationResolutionResult } from '../src/integrations/telegram/location-resolver/telegram-location-resolver.types';
import { TomTomClient } from '../src/integrations/tomtom/tomtom.client';
import { TomTomSearchProvider } from '../src/integrations/tomtom/tomtom-search.provider';

const QUERIES = [
  'мир',
  'новый мост',
  'мост победы',
  'гэс',
  'загс',
  '3г',
  'маянга',
  'менделеева',
  'менделеева / комарова',
  'несуществующая локация road-radar-probe',
] as const;

const run = async (): Promise<void> => {
  const configService = new ConfigService(process.env);
  const client = new TomTomClient(configService);
  const provider = new TomTomSearchProvider(client);
  const resolver = new TelegramLocationResolver(provider);
  const results = [];

  for (const input of QUERIES) {
    const resolution = await resolver.resolve({
      eventType: 'ACCIDENT',
      location: { text: input, alias: null },
    });

    results.push(toOutput(input, resolution));
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
};

const toOutput = (
  input: string,
  result: TelegramLocationResolutionResult,
): Record<string, unknown> => {
  if (result.status === 'RESOLVED') {
    return {
      input,
      canonical: result.canonicalTitle,
      attemptedQueries: result.attemptedQueries,
      queryAttempts: result.queryAttempts,
      rawCandidateCount: result.rawCandidateCount,
      acceptedCandidateCount: result.acceptedCandidateCount,
      status: result.status,
      source: result.source,
      coordinateSource: result.coordinateSource,
      confidence: result.confidence,
      latitude: result.latitude,
      longitude: result.longitude,
    };
  }

  if (result.status === 'AMBIGUOUS') {
    return {
      input,
      canonical: result.canonicalTitle ?? null,
      attemptedQueries: result.attemptedQueries,
      queryAttempts: result.queryAttempts,
      rawCandidateCount: result.rawCandidateCount,
      acceptedCandidateCount: result.acceptedCandidateCount,
      status: result.status,
      confidence: result.confidence,
      candidateCount: result.candidates.length,
    };
  }

  return {
    input,
    canonical: result.canonicalTitle ?? null,
    attemptedQueries: result.attemptedQueries,
    queryAttempts: result.queryAttempts,
    rawCandidateCount: result.rawCandidateCount,
    acceptedCandidateCount: result.acceptedCandidateCount,
    status: result.status,
    confidence: result.confidence,
    reason: result.reason,
  };
};

void run().catch(() => {
  process.stderr.write('Telegram location resolver smoke failed.\n');
  process.exitCode = 1;
});
