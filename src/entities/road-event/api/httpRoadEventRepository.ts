import {
  httpRequest,
} from '../../../shared/api/httpClient';

import {
  parseRoadEventPayload,
} from './roadEventRealtime';

import {
  CreateRoadEventInput,
  RoadEventFeedbackInput,
  DpsActivitySummary,
  RoadEventListParams,
  RoadEventRepository,
} from './roadEventRepository';

import {
  RoadEvent,
  UserRoadEvent,
} from '../model/roadEvent';

const assertPersistedRoadEvent = (
  payload: unknown,
): UserRoadEvent | Extract<RoadEvent, { source: 'TELEGRAM' }> => {
  const event = parseRoadEventPayload(payload);

  if (!event || event.source === 'TOMTOM') {
    throw new Error('API returned invalid persisted road event');
  }

  return event;
};

const assertDpsActivitySummary = (payload: unknown): DpsActivitySummary => {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('cityId' in payload) ||
    typeof payload.cityId !== 'string' ||
    !('onMap' in payload) ||
    typeof payload.onMap !== 'number' ||
    !('unlocated' in payload) ||
    typeof payload.unlocated !== 'number' ||
    !('total' in payload) ||
    typeof payload.total !== 'number'
  ) {
    throw new Error('API returned invalid DPS activity summary');
  }

  return payload as DpsActivitySummary;
};

const assertRoadEventList = (
  payload: unknown,
): RoadEvent[] => {
  if (
    !Array.isArray(
      payload,
    )
  ) {
    throw new Error(
      'API returned invalid road event list',
    );
  }

  return payload.flatMap(item => {
    const event =
      parseRoadEventPayload(
        item,
      );

    if (!event) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'source' in item &&
        typeof item.source === 'string' &&
        ![
          'USER',
          'TELEGRAM',
          'TOMTOM',
        ].includes(item.source)
      ) {
        return [];
      }

      throw new Error(
        'API returned invalid road event data',
      );
    }

    return [event];
  });
};

class HttpRoadEventRepository
  implements RoadEventRepository
{
  async list(
    params:
      RoadEventListParams,
  ): Promise<RoadEvent[]> {
    if (!params.bounds) {
      throw new Error(
        'Viewport bounds are required',
      );
    }

    const [
      west,
      south,
      east,
      north,
    ] = params.bounds;

    const query = [
      [
        'cityId',
        params.cityId,
      ],

      [
        'west',
        String(west),
      ],

      [
        'south',
        String(south),
      ],

      [
        'east',
        String(east),
      ],

      [
        'north',
        String(north),
      ],
    ]
      .map(
        ([key, value]) =>
          `${encodeURIComponent(
            key,
          )}=${encodeURIComponent(
            value,
          )}`,
      )
      .join('&');

    const payload =
      await httpRequest<unknown>(
        `/road-events?${query}`,
      );

    return assertRoadEventList(
      payload,
    );
  }

  async create(
    input:
      CreateRoadEventInput,
  ): Promise<UserRoadEvent | Extract<RoadEvent, { source: 'TELEGRAM' }>> {
    const payload =
      await httpRequest<unknown>(
        '/road-events',

        {
          method: 'POST',

          body:
            JSON.stringify(
              input,
            ),
        },
      );

    return assertPersistedRoadEvent(
      payload,
    );
  }

  async feedback(
    input:
      RoadEventFeedbackInput,
  ): Promise<UserRoadEvent | Extract<RoadEvent, { source: 'TELEGRAM' }>> {
    const payload =
      await httpRequest<unknown>(
        `/road-events/${encodeURIComponent(
          input.eventId,
        )}/feedback`,

        {
          method: 'POST',

          body:
            JSON.stringify({
              action:
                input.action,
            }),
        },
      );

    return assertPersistedRoadEvent(
      payload,
    );
  }

  async getDpsActivitySummary(cityId: string): Promise<DpsActivitySummary> {
    const payload = await httpRequest<unknown>(
      `/road-events/dps-summary?cityId=${encodeURIComponent(cityId)}`,
    );

    return assertDpsActivitySummary(payload);
  }
}

export const roadEventRepository:
  RoadEventRepository =
  new HttpRoadEventRepository();
