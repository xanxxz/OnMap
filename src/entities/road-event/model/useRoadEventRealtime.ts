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
  isRoadEventPayload,
  isRoadEventResolvedPayload,
  ROAD_EVENT_REALTIME_EVENTS,
} from '../api/roadEventRealtime';

import {
  removeRealtimeRoadEvent,
  upsertRealtimeRoadEvent,
} from '../lib/roadEventRealtimeCache';

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
          setStatus(
            'connected',
          );

          subscribe();
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
              '[RoadRadar] Socket connection error',
              error.message,
            );
          }
        };

      const handleCreated =
        (
          payload:
            unknown,
        ) => {
          if (
            !isRoadEventPayload(
              payload,
            ) ||
            payload.cityId !==
              cityId
          ) {
            return;
          }

          upsertRealtimeRoadEvent(
            queryClient,
            payload,
          );
        };

      const handleUpdated =
        (
          payload:
            unknown,
        ) => {
          if (
            !isRoadEventPayload(
              payload,
            ) ||
            payload.cityId !==
              cityId
          ) {
            return;
          }

          upsertRealtimeRoadEvent(
            queryClient,
            payload,
          );
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