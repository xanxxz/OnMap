import { Module } from '@nestjs/common';

import { TomTomClient } from './tomtom.client';
import { TomTomSearchProvider } from './tomtom-search.provider';
import { TomTomTrafficProvider } from './tomtom-traffic.provider';

@Module({
  providers: [TomTomClient, TomTomTrafficProvider, TomTomSearchProvider],
  exports: [TomTomTrafficProvider, TomTomSearchProvider],
})
export class TomTomModule {}
