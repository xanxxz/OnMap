import {RoadEventType} from '../model/roadEvent';

export const ROAD_EVENT_ICON_NAME_BY_TYPE: Record<
  RoadEventType,
  string
> = {
  ACCIDENT: 'road-event-accident',

  ROAD_CLOSURE: 'road-event-closure',

  ROADWORKS: 'road-event-roadworks',

  TRAFFIC: 'road-event-traffic',

  ROAD_HAZARD: 'road-event-hazard',

  TRAFFIC_LIGHT:
    'road-event-traffic-light',

  ROAD_SERVICE:
    'road-event-road-service',

  ROAD_PATROL:
    'road-event-road-patrol',

  OTHER: 'road-event-other',
};

export const ROAD_EVENT_ICON_SOURCE_BY_TYPE =
  {
    ACCIDENT: require('../../../assets/map-events/accident.png'),

    ROAD_CLOSURE: require('../../../assets/map-events/closure.png'),

    ROADWORKS: require('../../../assets/map-events/roadworks.png'),

    TRAFFIC: require('../../../assets/map-events/traffic.png'),

    ROAD_HAZARD: require('../../../assets/map-events/hazard.png'),

    TRAFFIC_LIGHT: require('../../../assets/map-events/traffic-light.png'),

    ROAD_SERVICE: require('../../../assets/map-events/road-service.png'),

    ROAD_PATROL: require('../../../assets/map-events/dps.png'),

    OTHER: require('../../../assets/map-events/other.png'),
  } as const;

export const ROAD_EVENT_MAP_IMAGES = {
  'road-event-accident':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ACCIDENT,

  'road-event-closure':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ROAD_CLOSURE,

  'road-event-roadworks':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ROADWORKS,

  'road-event-traffic':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.TRAFFIC,

  'road-event-hazard':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ROAD_HAZARD,

  'road-event-traffic-light':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.TRAFFIC_LIGHT,

  'road-event-road-service':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ROAD_SERVICE,

  'road-event-road-patrol':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.ROAD_PATROL,

  'road-event-other':
    ROAD_EVENT_ICON_SOURCE_BY_TYPE.OTHER,

  'road-event-cluster': require('../../../assets/map-events/cluster.png'),
} as const;