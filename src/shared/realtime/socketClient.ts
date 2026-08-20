import {
  io,
  Socket,
} from 'socket.io-client';

import {
  env,
} from '../config/env';

let socket:
  | Socket
  | null = null;

export const getRealtimeSocket =
  (): Socket | null => {
    if (
      !env.realtimeEnabled ||
      env.socketUrl.length === 0
    ) {
      return null;
    }

    if (!socket) {
      socket = io(
        env.socketUrl,
        {
          autoConnect: false,

          reconnection: true,

          reconnectionAttempts:
            Infinity,

          reconnectionDelay:
            1_000,

          reconnectionDelayMax:
            10_000,

          timeout:
            10_000,
        },
      );
    }

    return socket;
  };