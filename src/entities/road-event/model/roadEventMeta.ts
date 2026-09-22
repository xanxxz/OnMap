import {colors} from '../../../shared/theme';

import {
  RoadEvent,
  RoadEventType,
} from './roadEvent';

interface RoadEventMeta {
  label: string;

  filterLabel: string;

  color: string;
}

export const ROAD_EVENT_META: Record<
  RoadEventType,
  RoadEventMeta
> = {
  ACCIDENT: {
    label: 'ДТП',
    filterLabel: 'ДТП',
    color: colors.accident,
  },

  ROAD_CLOSURE: {
    label: 'Перекрытие',
    filterLabel: 'Перекрытия',
    color: colors.closure,
  },

  ROADWORKS: {
    label: 'Дорожные работы',
    filterLabel: 'Ремонт',
    color: colors.roadworks,
  },

  TRAFFIC: {
    label: 'Пробка',
    filterLabel: 'Пробки',
    color: colors.traffic,
  },

  ROAD_HAZARD: {
    label: 'Опасность',
    filterLabel: 'Опасности',
    color: colors.hazard,
  },

  TRAFFIC_LIGHT: {
    label: 'Светофор',
    filterLabel: 'Светофоры',
    color: colors.trafficLight,
  },

  ROAD_SERVICE: {
    label: 'Дорожная служба',
    filterLabel: 'Службы',
    color: colors.roadService,
  },

  ROAD_PATROL: {
    label: 'ДПС',
    filterLabel: 'ДПС',
    color: colors.roadPatrol,
  },

  OTHER: {
    label: 'Другое',
    filterLabel: 'Другое',
    color: colors.other,
  },
};

export const getRoadEventFilterType = (
  event:
    RoadEvent,
): RoadEventType => {
  if (
    event.source !==
    'TOMTOM'
  ) {
    return event.type;
  }

  switch (event.type) {
    case 'TRAFFIC_JAM':
      return 'TRAFFIC';

    case 'HAZARD':
      return 'ROAD_HAZARD';

    default:
      return event.type;
  }
};
