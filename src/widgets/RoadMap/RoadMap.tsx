import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';

import {
  View,
} from 'react-native';

import {
  Camera,
  CameraRef,
  Map,
  MapRef,
  UserLocation,
} from '@maplibre/maplibre-react-native';

import {
  CityConfig,
} from '../../shared/config/cities';

import {
  RoadEvent,
} from '../../entities/road-event/model/roadEvent';

import {
  RoadEventSource,
} from '../../entities/road-event/ui/RoadEventSource/RoadEventSource';

import {
  DraftLocationMarker,
} from '../../features/report-event/ui/DraftLocationMarker/DraftLocationMarker';

import {
  LocationPermissionState,
} from '../../features/user-location/useLocationPermission';

import {
  env,
} from '../../shared/config/env';

import {
  MapBounds,
} from '../../shared/types/map';

import {styles} from './RoadMap.styles';

interface RoadMapProps {
  city: CityConfig;

  events: RoadEvent[];

  selectedEventId?: string;

  draftCoordinate:
    | [number, number]
    | null;

  locationPermission:
    LocationPermissionState;

  onEventPress: (
    event: RoadEvent,
  ) => void;

  onLongPressCoordinate: (
    coordinate: [
      number,
      number,
    ],
  ) => void;

  onViewportChange: (
    bounds: MapBounds,
  ) => void;
}

export interface RoadMapRef {
  zoomIn: () => Promise<void>;

  zoomOut: () => Promise<void>;

  focusCoordinate: (
    coordinate: [
      number,
      number,
    ],
  ) => Promise<void>;
}

const ZOOM_STEP = 1;

const CAMERA_DURATION = 220;

export const RoadMap =
  forwardRef<
    RoadMapRef,
    RoadMapProps
  >(
    (
      {
        city,
        events,
        selectedEventId,
        draftCoordinate,
        locationPermission,
        onEventPress,
        onLongPressCoordinate,
        onViewportChange,
      },
      ref,
    ) => {
      const mapRef =
        useRef<MapRef>(null);

      const cameraRef =
        useRef<CameraRef>(
          null,
        );

      const clampZoom = (
        zoom: number,
      ): number => {
        return Math.min(
          city.maxZoom,

          Math.max(
            city.minZoom,
            zoom,
          ),
        );
      };

      const changeZoom =
        useCallback(
          async (
            delta: number,
          ) => {
            const zoom =
              await mapRef.current?.getZoom();

            if (
              typeof zoom !==
              'number'
            ) {
              return;
            }

            cameraRef.current?.zoomTo(
              clampZoom(
                zoom + delta,
              ),

              {
                duration:
                  CAMERA_DURATION,

                easing: 'ease',
              },
            );
          },
          [
            city.maxZoom,
            city.minZoom,
          ],
        );

      const focusCoordinate =
        useCallback(
          async (
            coordinate: [
              number,
              number,
            ],
          ) => {
            const currentZoom =
              await mapRef.current?.getZoom();

            const zoom =
              typeof currentZoom ===
              'number'
                ? clampZoom(
                    Math.max(
                      currentZoom,
                      15.5,
                    ),
                  )
                : 15.5;

            cameraRef.current?.easeTo(
              {
                center:
                  coordinate,

                zoom,

                duration: 360,

                easing: 'ease',
              },
            );
          },
          [
            city.maxZoom,
            city.minZoom,
          ],
        );

      useImperativeHandle(
        ref,
        () => ({
          zoomIn: () =>
            changeZoom(
              ZOOM_STEP,
            ),

          zoomOut: () =>
            changeZoom(
              -ZOOM_STEP,
            ),

          focusCoordinate,
        }),
        [
          changeZoom,
          focusCoordinate,
        ],
      );

      const emitCurrentBounds =
        useCallback(
          async () => {
            const bounds =
              await mapRef.current?.getBounds();

            if (!bounds) {
              return;
            }

            onViewportChange([
              bounds[0],
              bounds[1],
              bounds[2],
              bounds[3],
            ]);
          },
          [
            onViewportChange,
          ],
        );

      const handleClusterPress =
        useCallback(
          (
            coordinate: [
              number,
              number,
            ],

            expansionZoom: number,
          ) => {
            cameraRef.current?.easeTo(
              {
                center:
                  coordinate,

                zoom:
                  Math.min(
                    expansionZoom,
                    city.maxZoom,
                  ),

                duration: 320,

                easing: 'ease',
              },
            );
          },
          [
            city.maxZoom,
          ],
        );

      return (
        <View
          style={
            styles.container
          }>
          <Map
            ref={mapRef}
            style={styles.map}
            mapStyle={
              env.mapStyleUrl
            }
            dragPan
            touchZoom
            doubleTapZoom
            doubleTapHoldZoom
            touchRotate
            touchPitch={false}
            compass
            compassHiddenFacingNorth
            compassPosition={{
              top: 112,
              right: 16,
            }}
            attribution
            attributionPosition={{
              bottom: 8,
              left: 8,
            }}
            onDidFinishLoadingMap={() => {
              void emitCurrentBounds();
            }}
            onRegionDidChange={
              event => {
                const bounds =
                  event.nativeEvent
                    .bounds;

                onViewportChange([
                  bounds[0],
                  bounds[1],
                  bounds[2],
                  bounds[3],
                ]);
              }
            }
            onLongPress={
              event => {
                const {
                  lngLat,
                } =
                  event.nativeEvent;

                onLongPressCoordinate(
                  [
                    lngLat[0],
                    lngLat[1],
                  ],
                );
              }
            }>
            <Camera
              ref={cameraRef}
              initialViewState={{
                center:
                  city.center,

                zoom:
                  city.defaultZoom,
              }}
              minZoom={
                city.minZoom
              }
              maxZoom={
                city.maxZoom
              }
              maxBounds={
                city.navigationBounds
              }
            />

            {locationPermission ===
            'granted' ? (
              <UserLocation
                animated
                accuracy
                heading
                minDisplacement={
                  3
                }
              />
            ) : null}

            <RoadEventSource
              events={events}
              selectedEventId={
                selectedEventId
              }
              onEventPress={
                onEventPress
              }
              onClusterPress={
                handleClusterPress
              }
            />

            {draftCoordinate ? (
              <DraftLocationMarker
                coordinate={
                  draftCoordinate
                }
              />
            ) : null}
          </Map>
        </View>
      );
    },
  );

RoadMap.displayName =
  'RoadMap';