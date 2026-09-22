import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { OsmStreetGeometryProvider } from '../src/integrations/telegram/location-resolver/osm-street-geometry.provider';
import { warmupTelegramStreetGeometry } from '../src/integrations/telegram/location-resolver/telegram-street-geometry-warmup';

const cityArgument = (): string | null => {
  const index = process.argv.indexOf('--city');
  const value = index < 0 ? undefined : process.argv[index + 1];

  return value?.trim() || null;
};

const run = async (): Promise<void> => {
  const cityId = cityArgument();

  if (cityId === null) {
    process.stderr.write(
      'Usage: npm run telegram:street-geometry-warmup -- --city <cityId>\n',
    );
    process.exitCode = 1;
    return;
  }

  const provider = new OsmStreetGeometryProvider(
    new ConfigService(process.env),
  );
  const summary = await warmupTelegramStreetGeometry(cityId, provider);

  process.stdout.write(
    [
      'Street geometry warmup complete',
      '',
      `city: ${summary.cityId}`,
      `streets: ${summary.streets}`,
      `resolved: ${summary.resolved}`,
      `ambiguous: ${summary.ambiguous}`,
      `not found: ${summary.notFound}`,
      `unavailable: ${summary.unavailable}`,
      '',
    ].join('\n'),
  );
};

void run().catch((error: unknown) => {
  process.stderr.write(
    `Street geometry warmup failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
  );
  process.exitCode = 1;
});
