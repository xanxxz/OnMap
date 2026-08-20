import {
  httpRequest,
} from '../../../shared/api/httpClient';

import {
  getInstallationId,
} from '../../../shared/device/installationIdentity';

import {
  isRoadEventPayload,
} from './roadEventRealtime';

import {
  CreateRoadEventInput,
  RoadEventFeedbackRequest,
  RoadEventListParams,
  RoadEventRepository,
} from './roadEventRepository';

import {
  RoadEvent,
} from '../model/roadEvent';

const assertRoadEvent = (
  payload: unknown,
): RoadEvent => {
  if (
    !isRoadEventPayload(
      payload,
    )
  ) {
    throw new Error(
      'API returned invalid road event',
    );
  }

  return payload;
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

  if (
    !payload.every(
      isRoadEventPayload,
    )
  ) {
    throw new Error(
      'API returned invalid road event data',
    );
  }

  return payload;
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

    const installationId =
      await getInstallationId();

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
        'installationId',
        installationId,
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
  ): Promise<RoadEvent> {
    const installationId =
      await getInstallationId();

    const payload =
      await httpRequest<unknown>(
        '/road-events',

        {
          method: 'POST',

          body:
            JSON.stringify({
              ...input,

              installationId,
            }),
        },
      );

    return assertRoadEvent(
      payload,
    );
  }

  async feedback(
    input:
      RoadEventFeedbackRequest,
  ): Promise<RoadEvent> {
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

              installationId:
                input.installationId,
            }),
        },
      );

    return assertRoadEvent(
      payload,
    );
  }
}

export const roadEventRepository:
  RoadEventRepository =
  new HttpRoadEventRepository();