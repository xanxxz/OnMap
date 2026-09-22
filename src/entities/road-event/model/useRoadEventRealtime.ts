import {
  useEffect,
  useState,
} from 'react';

import {
  useQueryClient,
} from '@tanstack/react-query';

import {
  getRealtimeSocket,
} from '../../../shared/realtime/socketClient';

import {
  isRoadEventResolvedPayload,
  parseRoadEventPayload,
  ROAD_EVENT_REALTIME_EVENTS,
} from '../api/roadEventRealtime';

import {
  removeRealtimeRoadEvent,
  upsertRealtimeRoadEvent,
} from '../lib/roadEventRealtimeCache';

import {
  roadEventKeys,
} from './useRoadEvents';

import { dpsActivitySummaryKey } from './useDpsActivitySummary';

export type RealtimeStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export const useRoadEventRealtime =
  (
    cityId: string,
  ): RealtimeStatus => {
    const queryClient =
      useQueryClient();

    const [
      status,
      setStatus,
    ] =
      useState<RealtimeStatus>(
        'disabled',
      );

    useEffect(() => {
      const socket =
        getRealtimeSocket();

      if (!socket) {
        setStatus(
          'disabled',
        );

        return;
      }

      let connectedBefore =
        false;

      const subscribe =
        () => {
          socket.emit(
            ROAD_EVENT_REALTIME_EVENTS.subscribe,
            {
              cityId,
            },
          );
        };

      const handleConnect =
        () => {
          const reconnected =
            connectedBefore;

          connectedBefore =
            true;

          setStatus(
            'connected',
          );

          subscribe();

          if (reconnected) {
            queryClient.invalidateQueries(
              {
                queryKey:
                  roadEventKeys.city(
                    cityId,
                  ),
              },
            );

            queryClient.invalidateQueries({
              queryKey: dpsActivitySummaryKey(cityId),
            });
          }
        };

      const handleDisconnect =
        () => {
          setStatus(
            'disconnected',
          );
        };

      const handleConnectError =
        (
          error: Error,
        ) => {
          setStatus(
            'error',
          );

          if (__DEV__) {
            console.warn(
              '[OnMap] Socket connection error',
              error.message,
            );
          }
        };

      const handleReconnectAttempt =
        () => {
          setStatus(
            'connecting',
          );
        };

      const handleCreated =
        (
          payload:
            unknown,
        ) => {
          const event =
            parseRoadEventPayload(
              payload,
            );

          if (
            !event ||
            event.source ===
              'TOMTOM' ||
            event.cityId !==
              cityId
          ) {
            return;
          }

          upsertRealtimeRoadEvent(
            queryClient,
            event,
          );

          if (event.type === 'ROAD_PATROL') {
            queryClient.invalidateQueries({
              queryKey: dpsActivitySummaryKey(cityId),
            });
          }
        };

      const handleUpdated =
        (
          payload:
            unknown,
        ) => {
          const event =
            parseRoadEventPayload(
              payload,
            );

          if (
            !event ||
            event.source ===
              'TOMTOM' ||
            event.cityId !==
              cityId
          ) {
            return;
          }

          upsertRealtimeRoadEvent(
            queryClient,
            event,
          );

          if (event.type === 'ROAD_PATROL') {
            queryClient.invalidateQueries({
              queryKey: dpsActivitySummaryKey(cityId),
            });
          }
        };

      const handleResolved =
        (
          payload:
            unknown,
        ) => {
          if (
            !isRoadEventResolvedPayload(
              payload,
            ) ||
            payload.cityId !==
              cityId
          ) {
            return;
          }

          removeRealtimeRoadEvent(
            queryClient,
            payload.id,
          );

          queryClient.invalidateQueries({
            queryKey: dpsActivitySummaryKey(cityId),
          });
        };

      socket.on(
        'connect',
        handleConnect,
      );

      socket.on(
        'disconnect',
        handleDisconnect,
      );

      socket.on(
        'connect_error',
        handleConnectError,
      );

      socket.io.on(
        'reconnect_attempt',
        handleReconnectAttempt,
      );

      socket.on(
        ROAD_EVENT_REALTIME_EVENTS.created,
        handleCreated,
      );

      socket.on(
        ROAD_EVENT_REALTIME_EVENTS.updated,
        handleUpdated,
      );

      socket.on(
        ROAD_EVENT_REALTIME_EVENTS.resolved,
        handleResolved,
      );

      if (
        socket.connected
      ) {
        handleConnect();
      } else {
        setStatus(
          'connecting',
        );

        socket.connect();
      }

      return () => {
        if (
          socket.connected
        ) {
          socket.emit(
            ROAD_EVENT_REALTIME_EVENTS.unsubscribe,
            {
              cityId,
            },
          );
        }

        socket.off(
          'connect',
          handleConnect,
        );

        socket.off(
          'disconnect',
          handleDisconnect,
        );

        socket.off(
          'connect_error',
          handleConnectError,
        );

        socket.io.off(
          'reconnect_attempt',
          handleReconnectAttempt,
        );

        socket.off(
          ROAD_EVENT_REALTIME_EVENTS.created,
          handleCreated,
        );

        socket.off(
          ROAD_EVENT_REALTIME_EVENTS.updated,
          handleUpdated,
        );

        socket.off(
          ROAD_EVENT_REALTIME_EVENTS.resolved,
          handleResolved,
        );

        socket.disconnect();
      };
    }, [
      cityId,
      queryClient,
    ]);

    return status;
  };
