import type {ImageSourcePropType} from 'react-native';

import {RoadEventReadType} from '../../model/roadEvent';

type EventMarkerAsset = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  artworkWidthRatio: number;
  artworkHeightRatio: number;
  visibleSize: number;
  anchor: 'center' | 'bottom';
};

type ArtworkBounds = {
  width: number;
  height: number;
};

export const eventMarkerColors = {
  dps: '#376F8A',
  accident: '#C85F58',
  roadworks: '#BE8139',
  roadClosure: '#A55443',
  hazard: '#C59437',
  trafficJam: '#B96F45',
  roadState: '#4E786A',
  trafficLight: '#3F806D',
  roadService: '#4E7790',
  other: '#64726C',
} as const;

const ICONS = {
  ACCIDENT: require('../../../../shared/assets/road-event-markers/ACCIDENT.png'),
  ROAD_CLOSURE: require('../../../../shared/assets/road-event-markers/ROAD_CLOSURE.png'),
  ROADWORKS: require('../../../../shared/assets/road-event-markers/ROADWORKS.png'),
  TRAFFIC: require('../../../../shared/assets/road-event-markers/TRAFFIC.png'),
  ROAD_HAZARD: require('../../../../shared/assets/road-event-markers/ROAD_HAZARD.png'),
  TRAFFIC_LIGHT: require('../../../../shared/assets/road-event-markers/TRAFFIC_LIGHT.png'),
  ROAD_SERVICE: require('../../../../shared/assets/road-event-markers/ROAD_SERVICE.png'),
  ROAD_PATROL: require('../../../../shared/assets/road-event-markers/ROAD_PATROL.png'),
  OTHER: require('../../../../shared/assets/road-event-markers/OTHER.png'),
} as const;

const createAsset = (
  source: ImageSourcePropType,
  canvasWidth: number,
  canvasHeight: number,
  artworkBounds: ArtworkBounds,
  visibleSize: number,
  anchor: EventMarkerAsset['anchor'] = 'center',
): EventMarkerAsset => {
  const visibleWidthRatio = canvasWidth * artworkBounds.width;
  const visibleHeightRatio = canvasHeight * artworkBounds.height;
  const artworkScale = visibleSize / Math.max(visibleWidthRatio, visibleHeightRatio);

  return {
    source,
    width: canvasWidth * artworkScale,
    height: canvasHeight * artworkScale,
    artworkWidthRatio: artworkBounds.width,
    artworkHeightRatio: artworkBounds.height,
    visibleSize,
    anchor,
  };
};

// Artwork bounds are alpha bounds above 8% opacity, measured from the supplied PNGs.
// Sizing to visibleSize compensates for each illustration's transparent canvas margin.
const ACCIDENT = createAsset(ICONS.ACCIDENT, 1, 1, {width: 1214 / 1254, height: 735 / 1254}, 30);
const ROAD_CLOSURE = createAsset(ICONS.ROAD_CLOSURE, 1, 1, {width: 1172 / 1254, height: 1082 / 1254}, 30);
const ROADWORKS = createAsset(ICONS.ROADWORKS, 1, 1, {width: 1165 / 1254, height: 1119 / 1254}, 30);
const TRAFFIC = createAsset(ICONS.TRAFFIC, 1.5, 1, {width: 1161 / 1536, height: 855 / 1024}, 30);
const ROAD_HAZARD = createAsset(ICONS.ROAD_HAZARD, 1, 1, {width: 1219 / 1254, height: 833 / 1254}, 30);
const TRAFFIC_LIGHT = createAsset(ICONS.TRAFFIC_LIGHT, 2 / 3, 1, {width: 504 / 1024, height: 1399 / 1536}, 30, 'bottom');
const ROAD_SERVICE = createAsset(ICONS.ROAD_SERVICE, 1, 1, {width: 1210 / 1254, height: 901 / 1254}, 30);
const ROAD_PATROL = createAsset(ICONS.ROAD_PATROL, 1, 1, {width: 1129 / 1254, height: 1019 / 1254}, 34.2);
const OTHER = createAsset(ICONS.OTHER, 1, 1, {width: 1058 / 1254, height: 1050 / 1254}, 30);

const EVENT_MARKER_ASSETS: Record<RoadEventReadType, EventMarkerAsset> = {
  ROAD_PATROL,
  ACCIDENT,
  ROAD_CLOSURE,
  ROADWORKS,
  TRAFFIC,
  TRAFFIC_JAM: TRAFFIC,
  ROAD_HAZARD,
  HAZARD: ROAD_HAZARD,
  TRAFFIC_LIGHT,
  ROAD_SERVICE,
  OTHER,
};

export const getEventMarkerVisualConfig = (
  type: RoadEventReadType,
): EventMarkerAsset => EVENT_MARKER_ASSETS[type];

export const getEventMarkerAnchor = (
  type: RoadEventReadType,
): EventMarkerAsset['anchor'] => EVENT_MARKER_ASSETS[type].anchor;
