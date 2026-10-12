jest.mock('../database/prisma.service', () => ({
  PrismaService: class {},
}));

import {
  PATH_METADATA,
  METHOD_METADATA,
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPartnerPlacementsQueryDto } from './dto/list-partner-placements-query.dto';
import { PartnerPlacementsController } from './partner-placements.controller';
import { PartnerPlacementsService } from './partner-placements.service';
import { PartnerStatisticsService } from './partner-statistics.service';
import { AnonymousIdentityGuard } from '../identity/anonymous-identity.guard';

describe('public partner placements API', () => {
  const list = jest.fn().mockResolvedValue({
    cityId: 'balakovo',
    points: [],
    banner: null,
  });
  const controller = new PartnerPlacementsController(
    {
      list,
    } as unknown as PartnerPlacementsService,
    {
      record: jest.fn(),
    } as unknown as PartnerStatisticsService,
  );

  it('exposes public GET and authenticated write only, with no statistics read route', async () => {
    const listHandler = Object.getOwnPropertyDescriptor(
      PartnerPlacementsController.prototype,
      'list',
    )?.value as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, PartnerPlacementsController),
    ).toBe('partner-placements');
    expect(Reflect.getMetadata(METHOD_METADATA, listHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, listHandler)).toBe('/');
    expect(
      Object.getOwnPropertyNames(PartnerPlacementsController.prototype),
    ).toEqual(['constructor', 'list', 'point', 'image', 'record']);
    const recordHandler = Object.getOwnPropertyDescriptor(
      PartnerPlacementsController.prototype,
      'record',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, recordHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, recordHandler)).toBe(
      'interaction',
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, recordHandler)).toBe(204);
    expect(Reflect.getMetadata(GUARDS_METADATA, recordHandler)).toContain(
      AnonymousIdentityGuard,
    );

    const result = await controller.list({
      cityId: 'balakovo',
      west: 47.7,
      south: 51.9,
      east: 47.9,
      north: 52.1,
    });
    expect(result).toEqual({ cityId: 'balakovo', points: [], banner: null });
  });

  it('does not return aggregate data or deduplication state to mobile', async () => {
    expect(
      await controller.record(
        { action: 'POINT_OPEN' as never, targetId: 'id' },
        'actor',
      ),
    ).toBeUndefined();
  });

  it('accepts numeric viewport parameters and rejects malformed input', async () => {
    const valid = plainToInstance(ListPartnerPlacementsQueryDto, {
      cityId: 'balakovo',
      west: '47.7',
      south: '51.9',
      east: '47.9',
      north: '52.1',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid.west).toBe(47.7);

    const invalid = plainToInstance(ListPartnerPlacementsQueryDto, {
      cityId: 'balakovo',
      west: 'bad',
      south: '51.9',
      east: '47.9',
      north: '52.1',
    });
    expect(await validate(invalid)).not.toEqual([]);
  });
});
