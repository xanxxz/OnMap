import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  Camera,
  CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  MapRef,
  UserLocation,
} from '@maplibre/maplibre-react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CityConfig, cityBoundsToMapBounds } from '../../shared/config/cities';

import { RoadEvent } from '../../entities/road-event/model/roadEvent';

import { RoadEventSource } from '../../entities/road-event/ui/RoadEventSource/RoadEventSource';

import { DraftLocationMarker } from '../../features/report-event/ui/DraftLocationMarker/DraftLocationMarker';

import { ReportLocationStatus } from '../../features/report-event/model/reportEventDraft';

import { LocationPermissionState } from '../../features/user-location/useLocationPermission';

import { env } from '../../shared/config/env';

import { MapBounds } from '../../shared/types/map';

import {useOnMapMapStyle} from '../../shared/lib/map/useOnMapMapStyle';

import { colors } from '../../shared/theme';

import { styles } from './RoadMap.styles';

interface RoadMapProps {
  city: CityConfig;

  events: RoadEvent[];

  selectedEventId?: string;

  draftCoordinate: [number, number] | null;

  draftLocationStatus?: ReportLocationStatus;

  locationPermission: LocationPermissionState;

  onEventPress: (event: RoadEvent) => void;

  onLongPressCoordinate: (coordinate: [number, number]) => void;

  onViewportChange: (bounds: MapBounds) => void;
}

export interface RoadMapRef {
  zoomIn: () => Promise<void>;

  zoomOut: () => Promise<void>;

  focusCoordinate: (coordinate: [number, number]) => Promise<void>;
}

const ZOOM_STEP = 1;

const CAMERA_DURATION = 220;

type MapLoadStatus = 'loading' | 'ready' | 'error';

export const RoadMap = forwardRef<RoadMapRef, RoadMapProps>(
  (
    {
      city,
      events,
      selectedEventId,
      draftCoordinate,
      draftLocationStatus = 'IDLE',
      locationPermission,
      onEventPress,
      onLongPressCoordinate,
      onViewportChange,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();

    const mapRef = useRef<MapRef>(null);

    const cameraRef = useRef<CameraRef>(null);

    const [activeProvider, setActiveProvider] = useState(env.mapStyles.initial);

    const [loadStatus, setLoadStatus] = useState<MapLoadStatus>('loading');

    const [retryAttempt, setRetryAttempt] = useState(0);

    const onMapStyle = useOnMapMapStyle(activeProvider.styleUrl);

    const hasTomTomEvents = events.some(event => event.source === 'TOMTOM');

    const mapAttribution = [
      activeProvider.id === 'maptiler' ? '© MapTiler' : '© OpenFreeMap',

      '© OpenStreetMap contributors',

      ...(hasTomTomEvents ? ['TomTom'] : []),
    ].join(' · ');

    const clampZoom = useCallback(
      (zoom: number): number => {
        return Math.min(
          city.maxZoom,

          Math.max(city.minZoom, zoom),
        );
      },
      [city.maxZoom, city.minZoom],
    );

    const changeZoom = useCallback(
      async (delta: number) => {
        const zoom = await mapRef.current?.getZoom();

        if (typeof zoom !== 'number') {
          return;
        }

        cameraRef.current?.zoomTo(
          clampZoom(zoom + delta),

          {
            duration: CAMERA_DURATION,

            easing: 'ease',
          },
        );
      },
      [clampZoom],
    );

    const focusCoordinate = useCallback(
      async (coordinate: [number, number]) => {
        const currentZoom = await mapRef.current?.getZoom();

        const zoom =
          typeof currentZoom === 'number'
            ? clampZoom(Math.max(currentZoom, 15.5))
            : 15.5;

        cameraRef.current?.easeTo({
          center: coordinate,

          zoom,

          duration: 360,

          easing: 'ease',
        });
      },
      [clampZoom],
    );

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => changeZoom(ZOOM_STEP),

        zoomOut: () => changeZoom(-ZOOM_STEP),

        focusCoordinate,
      }),
      [changeZoom, focusCoordinate],
    );

    const emitCurrentBounds = useCallback(async () => {
      const bounds = await mapRef.current?.getBounds();

      if (!bounds) {
        return;
      }

      onViewportChange([bounds[0], bounds[1], bounds[2], bounds[3]]);
    }, [onViewportChange]);

    const handleMapLoaded = useCallback(() => {
      setLoadStatus('ready');
    }, []);

    const handleMapLoadFailure = useCallback(() => {
      if (activeProvider.id !== env.mapStyles.fallback.id) {
        setLoadStatus('loading');

        setActiveProvider(env.mapStyles.fallback);

        return;
      }

      setLoadStatus('error');
    }, [activeProvider.id]);

    const handleRetry = useCallback(() => {
      setLoadStatus('loading');

      setActiveProvider(env.mapStyles.initial);

      setRetryAttempt(attempt => attempt + 1);
    }, []);

    return (
      <View style={styles.container}>
        <Map
          key={retryAttempt}
          ref={mapRef}
          testID="road-map-native"
          style={styles.map}
          mapStyle={onMapStyle}
          dragPan
          touchZoom
          doubleTapZoom
          doubleTapHoldZoom
          touchRotate
          touchPitch={false}
          compass
          compassHiddenFacingNorth
          compassPosition={{
            top: insets.top + 64,

            right: 16,
          }}
          logo={false}
          attribution={false}
          onDidFinishLoadingMap={async () => {
            handleMapLoaded();

            await emitCurrentBounds();
          }}
          onDidFinishLoadingStyle={handleMapLoaded}
          onDidFailLoadingMap={handleMapLoadFailure}
          onRegionDidChange={event => {
            const bounds = event.nativeEvent.bounds;

            onViewportChange([bounds[0], bounds[1], bounds[2], bounds[3]]);
          }}
          onLongPress={event => {
            const { lngLat } = event.nativeEvent;

            onLongPressCoordinate([lngLat[0], lngLat[1]]);
          }}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: city.center,

              zoom: city.defaultZoom,
            }}
            minZoom={city.minZoom}
            maxZoom={city.maxZoom}
            maxBounds={cityBoundsToMapBounds(city.coverageBounds)}
          />

          {locationPermission === 'granted' ? (
            <UserLocation animated accuracy heading minDisplacement={3} />
          ) : null}

          {city.displayBoundary ? (
            <GeoJSONSource
              id="city-coverage-boundary-source"
              data={city.displayBoundary}
            >
              <Layer
                id="city-coverage-boundary-fill"
                type="fill"
                paint={{
                  'fill-color': colors.primary,
                  'fill-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    11,
                    0.015,
                    13,
                    0,
                  ],
                }}
              />

              <Layer
                id="city-coverage-boundary-glow"
                type="line"
                paint={{
                  'line-color': colors.primary,
                  'line-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    11,
                    0.05,
                    12,
                    0.025,
                    13,
                    0,
                  ],
                  'line-width': 5,
                  'line-blur': 2.2,
                }}
              />

              <Layer
                id="city-coverage-boundary-line"
                type="line"
                paint={{
                  'line-color': colors.primary,
                  'line-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    11,
                    0.32,
                    12,
                    0.18,
                    13,
                    0.055,
                    14,
                    0,
                  ],
                  'line-width': 1.4,
                }}
              />
            </GeoJSONSource>
          ) : null}

          <RoadEventSource
            events={events}
            selectedEventId={selectedEventId}
            onEventPress={onEventPress}
          />

          {draftCoordinate ? (
            <DraftLocationMarker
              coordinate={draftCoordinate}
              locationStatus={draftLocationStatus}
            />
          ) : null}
        </Map>

        <View
          pointerEvents="none"
          testID="map-attribution"
          style={[
            styles.mapAttribution,

            {
              bottom: insets.bottom + 4,
            },
          ]}
        >
          <Text numberOfLines={1} style={styles.mapAttributionText}>
            {mapAttribution}
          </Text>
        </View>

        {loadStatus === 'loading' ? (
          <View
            pointerEvents="none"
            testID="road-map-loading"
            style={styles.stateLayer}
          >
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color={colors.primary} />

              <Text style={styles.loadingText}>
                {activeProvider.id === env.mapStyles.fallback.id &&
                env.mapStyles.primary !== null
                  ? 'Загружаем резервную карту…'
                  : 'Загружаем карту…'}
              </Text>
            </View>
          </View>
        ) : null}

        {loadStatus === 'error' ? (
          <View
            testID="road-map-error"
            style={[styles.stateLayer, styles.errorLayer]}
          >
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Карта временно недоступна</Text>

              <Text style={styles.errorMessage}>
                Проверьте соединение и попробуйте ещё раз
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить загрузку карты"
                onPress={handleRetry}
                style={({ pressed }) => [
                  styles.retryButton,

                  pressed && styles.retryButtonPressed,
                ]}
              >
                <Text style={styles.retryButtonText}>Повторить</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  },
);

RoadMap.displayName = 'RoadMap';
