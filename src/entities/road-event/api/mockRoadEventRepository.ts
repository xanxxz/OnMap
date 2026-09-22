import {
  isCoordinateWithinBounds,
} from '../../../shared/lib/map/mapBounds';

import {
  applyRoadEventFeedback,
  refreshRoadEventState,
  ROAD_EVENT_TTL_MINUTES,
} from '../lib/roadEventFreshness';

import {
  RoadEvent,
  RoadEventStatus,
  RoadEventType,
  UserRoadEvent,
} from '../model/roadEvent';

import {
  CreateRoadEventInput,
  RoadEventFeedbackInput,
  RoadEventListParams,
  RoadEventRepository,
} from './roadEventRepository';

interface MockSeed {
  type: RoadEventType;

  coordinate: [
    number,
    number,
  ];

  ageMinutes: number;

  confirmationCount: number;

  rejectionCount?: number;

  confidence: number;

  title: string;

  description: string;

  status?: RoadEventStatus;
}

const MOCK_SEEDS:
  MockSeed[] = [
    {
      type: 'ACCIDENT',

      coordinate: [
        47.8067,
        52.0257,
      ],

      ageMinutes: 18,

      confirmationCount: 8,

      confidence: 0.91,

      title: 'ДТП',

      description:
        'Движение на участке немного затруднено.',
    },

    {
      type: 'ROAD_PATROL',

      coordinate: [
        47.8004,
        52.0306,
      ],

      ageMinutes: 7,

      confirmationCount: 5,

      confidence: 0.84,

      title: 'ДПС',

      description:
        'Информационная пользовательская отметка.',
    },

    {
      type: 'TRAFFIC',

      coordinate: [
        47.8076,
        52.0264,
      ],

      ageMinutes: 11,

      confirmationCount: 5,

      confidence: 0.84,

      title:
        'Плотное движение',

      description:
        'Скорость движения ниже обычной.',
    },

    {
      type: 'ROAD_HAZARD',

      coordinate: [
        47.8055,
        52.0249,
      ],

      ageMinutes: 7,

      confirmationCount: 3,

      confidence: 0.77,

      title:
        'Опасность на дороге',

      description:
        'Будьте внимательнее на участке.',
    },

    {
      type: 'ROADWORKS',

      coordinate: [
        47.7864,
        52.0319,
      ],

      ageMinutes: 44,

      confirmationCount: 6,

      confidence: 0.88,

      title:
        'Дорожные работы',

      description:
        'Работы рядом с проезжей частью.',
    },

    {
      type: 'ROAD_SERVICE',

      coordinate: [
        47.7874,
        52.0325,
      ],

      ageMinutes: 14,

      confirmationCount: 3,

      confidence: 0.82,

      title:
        'Дорожная служба',

      description:
        'Спецтехника работает рядом с дорогой.',
    },

    {
      type: 'TRAFFIC',

      coordinate: [
        47.788,
        52.0312,
      ],

      ageMinutes: 8,

      confirmationCount: 4,

      confidence: 0.8,

      title: 'Пробка',

      description:
        'На участке образовалось замедление.',
    },

    {
      type:
        'TRAFFIC_LIGHT',

      coordinate: [
        47.8273,
        52.0184,
      ],

      ageMinutes: 9,

      confirmationCount: 1,

      confidence: 0.55,

      title:
        'Проблема со светофором',

      description:
        'Сообщение ожидает дополнительных подтверждений.',

      status:
        'UNCONFIRMED',
    },

    {
      type:
        'ROAD_CLOSURE',

      coordinate: [
        47.7682,
        52.0198,
      ],

      ageMinutes: 35,

      confirmationCount: 7,

      confidence: 0.92,

      title:
        'Ограничение движения',

      description:
        'Проезд на участке временно ограничен.',
    },

    {
      type:
        'ROAD_SERVICE',

      coordinate: [
        47.769,
        52.0205,
      ],

      ageMinutes: 10,

      confirmationCount: 4,

      confidence: 0.83,

      title:
        'Дорожная служба',

      description:
        'Работы рядом с проезжей частью.',
    },

    {
      type:
        'ROAD_HAZARD',

      coordinate: [
        47.818,
        52.0413,
      ],

      ageMinutes: 21,

      confirmationCount: 5,

      confidence: 0.79,

      title:
        'Помеха на дороге',

      description:
        'На участке требуется повышенное внимание.',
    },

    {
      type: 'TRAFFIC',

      coordinate: [
        47.8168,
        52.041,
      ],

      ageMinutes: 12,

      confirmationCount: 6,

      confidence: 0.86,

      title:
        'Плотное движение',

      description:
        'Движение идёт медленнее обычного.',
    },

    {
      type: 'OTHER',

      coordinate: [
        47.8173,
        52.0401,
      ],

      ageMinutes: 5,

      confirmationCount: 1,

      confidence: 0.58,

      title:
        'Дорожное событие',

      description:
        'Информация ожидает подтверждения.',

      status:
        'UNCONFIRMED',
    },
  ];

const createDateBeforeNow = (
  minutes: number,
): string => {
  return new Date(
    Date.now() -
      minutes * 60_000,
  ).toISOString();
};

const createDateAfterNow = (
  minutes: number,
): string => {
  return new Date(
    Date.now() +
      minutes * 60_000,
  ).toISOString();
};

const createSeedEvents =
  (): UserRoadEvent[] => {
    return MOCK_SEEDS.map(
      (
        seed,
        index,
      ): UserRoadEvent => {
        const ttlMinutes =
          ROAD_EVENT_TTL_MINUTES[
            seed.type
          ];

        return {
          id: `mock-${index + 1}`,

          source:
            'USER',

          cityId:
            'balakovo',

          type:
            seed.type,

          status:
            seed.status ??
            'ACTIVE',

          title:
            seed.title,

          description:
            seed.description,

          coordinate:
            seed.coordinate,

          geometry: {
            type:
              'Point',

            coordinates:
              seed.coordinate,
          },

          confirmationCount:
            seed.confirmationCount,

          rejectionCount:
            seed.rejectionCount ??
            0,

          lastConfirmedAt:
            seed.confirmationCount >
            0
              ? createDateBeforeNow(
                  Math.max(
                    1,
                    Math.floor(
                      seed.ageMinutes /
                        3,
                    ),
                  ),
                )
              : undefined,

          confidence:
            seed.confidence,

          createdAt:
            createDateBeforeNow(
              seed.ageMinutes,
            ),

          expiresAt:
            createDateAfterNow(
              Math.max(
                15,
                ttlMinutes -
                  seed.ageMinutes,
              ),
            ),
        };
      },
    );
  };

let mockEvents =
  createSeedEvents();

const createMockId =
  (): string => {
    return `local-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  };

const refreshMockEvents =
  () => {
    const now =
      Date.now();

    mockEvents =
      mockEvents.map(event =>
        refreshRoadEventState(
          event,
          now,
        ),
      );
  };

class MockRoadEventRepository
  implements RoadEventRepository
{
  async list(
    params:
      RoadEventListParams,
  ): Promise<RoadEvent[]> {
    refreshMockEvents();

    return mockEvents.filter(
      event => {
        if (
          event.cityId !==
          params.cityId
        ) {
          return false;
        }

        if (
          event.status ===
          'RESOLVED'
        ) {
          return false;
        }

        if (
          params.bounds &&
          !isCoordinateWithinBounds(
            event.coordinate,
            params.bounds,
          )
        ) {
          return false;
        }

        return true;
      },
    );
  }

  async getDpsActivitySummary(cityId: string) {
    refreshMockEvents();

    const onMap = mockEvents.filter(
      event =>
        event.cityId === cityId &&
        event.type === 'ROAD_PATROL' &&
        event.status !== 'RESOLVED',
    ).length;

    return {
      cityId,
      onMap,
      unlocated: 0,
      total: onMap,
    };
  }

  async create(
    input:
      CreateRoadEventInput,
  ): Promise<UserRoadEvent> {
    const ttlMinutes =
      ROAD_EVENT_TTL_MINUTES[
        input.type
      ];

    const now =
      Date.now();

    const event:
      UserRoadEvent = {
      id: createMockId(),

      source:
        'USER',

      cityId:
        input.cityId,

      type:
        input.type,

      status:
        'UNCONFIRMED',

      title:
        input.title,

      description:
        input.description,

      coordinate:
        input.coordinate,

      geometry: {
        type:
          'Point',

        coordinates:
          input.coordinate,
      },

      confirmationCount: 0,

      rejectionCount: 0,

      confidence: 0.5,

      createdAt:
        new Date(
          now,
        ).toISOString(),

      expiresAt:
        new Date(
          now +
            ttlMinutes *
              60_000,
        ).toISOString(),
    };

    mockEvents = [
      event,
      ...mockEvents,
    ];

    return event;
  }

  async feedback(
    input:
      RoadEventFeedbackInput,
  ): Promise<UserRoadEvent> {
    const index =
      mockEvents.findIndex(
        event =>
          event.id ===
            input.eventId &&
          event.cityId ===
            input.cityId,
      );

    if (index === -1) {
      throw new Error(
        'Road event not found',
      );
    }

    const current =
      refreshRoadEventState(
        mockEvents[index],
      );

    if (
      current.status ===
      'RESOLVED'
    ) {
      throw new Error(
        'Road event is already resolved',
      );
    }

    const updated =
      applyRoadEventFeedback(
        current,
        input.action,
      );

    mockEvents = [
      ...mockEvents.slice(
        0,
        index,
      ),

      updated,

      ...mockEvents.slice(
        index + 1,
      ),
    ];

    return updated;
  }
}

export const roadEventRepository:
  RoadEventRepository =
  new MockRoadEventRepository();
