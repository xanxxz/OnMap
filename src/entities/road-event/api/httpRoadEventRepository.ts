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
  RoadEventReportInput,
  RoadEventReportResult,
  RoadEventModerationNotice,
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
  async getActiveById(id: string, cityId: string): Promise<Exclude<RoadEvent, {source: 'TOMTOM'}>> {
    return assertPersistedRoadEvent(await httpRequest<unknown>(
      `/road-events/${encodeURIComponent(id)}?cityId=${encodeURIComponent(cityId)}`,
    ));
  }
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

  async report(input: RoadEventReportInput): Promise<RoadEventReportResult> {
    const payload = await httpRequest<unknown>(
      `/road-events/${encodeURIComponent(input.eventId)}/report`,
      { method: 'POST', body: JSON.stringify({ reason: input.reason }) },
    );
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('accepted' in payload) ||
      payload.accepted !== true ||
      !('duplicate' in payload) ||
      typeof payload.duplicate !== 'boolean' ||
      !('hidden' in payload) ||
      typeof payload.hidden !== 'boolean'
    ) {
      throw new Error('API returned invalid moderation report result');
    }
    return payload as RoadEventReportResult;
  }

  async getModerationNotices(): Promise<RoadEventModerationNotice[]> {
    const payload = await httpRequest<unknown>('/road-events/moderation-notices');
    if (!Array.isArray(payload)) {
      throw new Error('API returned invalid moderation notice list');
    }
    return payload.filter((item): item is RoadEventModerationNotice => {
      if (typeof item !== 'object' || item === null) return false;
      return (
        'id' in item && typeof item.id === 'string' &&
        'eventId' in item && typeof item.eventId === 'string' &&
        'type' in item && typeof item.type === 'string' &&
        'createdAt' in item && typeof item.createdAt === 'string' &&
        'eventStatus' in item && typeof item.eventStatus === 'string' &&
        'moderationState' in item
      );
    });
  }

  async acknowledgeModerationNotice(noticeId: string): Promise<void> {
    await httpRequest<unknown>(
      `/road-events/moderation-notices/${encodeURIComponent(noticeId)}/ack`,
      { method: 'POST' },
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
