jest.mock(
  '../../../shared/realtime/socketClient',
  () => ({
    getRealtimeSocket:
      jest.fn(),
  }),
);

jest.mock(
  '../api/httpRoadEventRepository',
  () => ({
    roadEventRepository:
      {},
  }),
);

import React from 'react';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import {
  Text,
} from 'react-native';

import {
  act,
  create,
  ReactTestRenderer,
} from 'react-test-renderer';

import {
  getRealtimeSocket,
} from '../../../shared/realtime/socketClient';

import {
  roadEventKeys,
} from './useRoadEvents';

import {
  RealtimeStatus,
  useRoadEventRealtime,
} from './useRoadEventRealtime';

type Listener = (
  ...args: unknown[]
) => void;

interface SocketDouble {
  connected: boolean;

  on: jest.Mock<
    SocketDouble,
    [string, Listener]
  >;

  off: jest.Mock<
    SocketDouble,
    [string, Listener]
  >;

  emit: jest.Mock<
    void,
    unknown[]
  >;

  connect: jest.Mock<
    void,
    []
  >;

  disconnect: jest.Mock<
    void,
    []
  >;

  io: {
    on: jest.Mock<
      void,
      [string, Listener]
    >;

    off: jest.Mock<
      void,
      [string, Listener]
    >;
  };
}

const mockedGetRealtimeSocket =
  getRealtimeSocket as jest.MockedFunction<
    typeof getRealtimeSocket
  >;

const createSocketDouble = () => {
  const socketListeners =
    new Map<
      string,
      Set<Listener>
    >();
  const managerListeners =
    new Map<
      string,
      Set<Listener>
    >();

  const addListener = (
    listeners:
      Map<
        string,
        Set<Listener>
      >,
    event: string,
    listener: Listener,
  ) => {
    const handlers =
      listeners.get(event) ??
      new Set<Listener>();

    handlers.add(listener);
    listeners.set(
      event,
      handlers,
    );
  };

  const removeListener = (
    listeners:
      Map<
        string,
        Set<Listener>
      >,
    event: string,
    listener: Listener,
  ) => {
    listeners
      .get(event)
      ?.delete(listener);
  };

  let socket:
    SocketDouble;

  socket = {
    connected: false,

    on: jest.fn(
      (
        event: string,
        listener: Listener,
      ) => {
        addListener(
          socketListeners,
          event,
          listener,
        );

        return socket;
      },
    ),

    off: jest.fn(
      (
        event: string,
        listener: Listener,
      ) => {
        removeListener(
          socketListeners,
          event,
          listener,
        );

        return socket;
      },
    ),

    emit: jest.fn(),

    connect: jest.fn(),

    disconnect: jest.fn(),

    io: {
      on: jest.fn(
        (
          event: string,
          listener: Listener,
        ) => {
          addListener(
            managerListeners,
            event,
            listener,
          );
        },
      ),

      off: jest.fn(
        (
          event: string,
          listener: Listener,
        ) => {
          removeListener(
            managerListeners,
            event,
            listener,
          );
        },
      ),
    },
  };

  const fire = (
    listeners:
      Map<
        string,
        Set<Listener>
      >,
    event: string,
    ...args: unknown[]
  ) => {
    listeners
      .get(event)
      ?.forEach(
        listener =>
          listener(
            ...args,
          ),
      );
  };

  return {
    socket,
    fireSocket: (
      event: string,
      ...args: unknown[]
    ) =>
      fire(
        socketListeners,
        event,
        ...args,
      ),
    fireManager: (
      event: string,
      ...args: unknown[]
    ) =>
      fire(
        managerListeners,
        event,
        ...args,
      ),
  };
};

const StatusProbe = () => {
  const status:
    RealtimeStatus =
    useRoadEventRealtime(
      'balakovo',
    );

  return (
    <Text testID="status">
      {status}
    </Text>
  );
};

const telegramPayload = {
  id: 'telegram:event-1',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  createdAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2099-08-25T10:00:00.000Z',
};

describe('useRoadEventRealtime reconnect synchronization', () => {
  let renderer:
    ReactTestRenderer;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }

    jest.clearAllMocks();
  });

  it('invalidates RoadEvents after a successful reconnect', () => {
    const {
      socket,
      fireSocket,
      fireManager,
    } = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<
        ReturnType<
          typeof getRealtimeSocket
        >
      >,
    );

    const queryClient =
      new QueryClient();
    const invalidate =
      jest.spyOn(
        queryClient,
        'invalidateQueries',
      );

    act(() => {
      renderer = create(
        <QueryClientProvider
          client={
            queryClient
          }>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    expect(
      renderer.root.findByProps(
        {
          testID:
            'status',
        },
      ).props.children,
    ).toBe('connecting');

    act(() => {
      socket.connected =
        true;
      fireSocket(
        'connect',
      );
    });

    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      socket.connected =
        false;
      fireSocket(
        'disconnect',
      );
      fireManager(
        'reconnect_attempt',
      );
    });

    expect(
      renderer.root.findByProps(
        {
          testID:
            'status',
        },
      ).props.children,
    ).toBe('connecting');

    act(() => {
      socket.connected =
        true;
      fireSocket(
        'connect',
      );
    });

    expect(invalidate).toHaveBeenCalledWith(
      {
        queryKey:
          roadEventKeys.city(
            'balakovo',
          ),
      },
    );

    queryClient.clear();
  });

  it('keeps realtime disabled neutral when no socket is configured', () => {
    mockedGetRealtimeSocket.mockReturnValue(
      null,
    );

    const queryClient =
      new QueryClient();

    act(() => {
      renderer = create(
        <QueryClientProvider
          client={
            queryClient
          }>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    expect(
      renderer.root.findByProps(
        {
          testID:
            'status',
        },
      ).props.children,
    ).toBe('disabled');

    queryClient.clear();
  });

  it('accepts TELEGRAM created events on the standard realtime channel', () => {
    const {
      socket,
      fireSocket,
    } = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<
        ReturnType<typeof getRealtimeSocket>
      >,
    );

    const queryClient = new QueryClient();
    const queryKey = roadEventKeys.viewport(
      'balakovo',
      [47.64, 51.9, 48.04, 52.16],
    );
    queryClient.setQueryData(queryKey, []);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    act(() => {
      fireSocket('road-event:created', telegramPayload);
    });

    expect(queryClient.getQueryData(queryKey)).toEqual([
      expect.objectContaining({
        id: 'telegram:event-1',
        source: 'TELEGRAM',
      }),
    ]);

    queryClient.clear();
  });

  it('ignores a realtime event from another city', () => {
    const {socket, fireSocket} = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<ReturnType<typeof getRealtimeSocket>>,
    );

    const queryClient = new QueryClient();
    const queryKey = roadEventKeys.viewport(
      'balakovo',
      [47.64, 51.9, 48.04, 52.16],
    );
    queryClient.setQueryData(queryKey, []);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    act(() => {
      fireSocket('road-event:created', {
        ...telegramPayload,
        cityId: 'test-city',
      });
    });

    expect(queryClient.getQueryData(queryKey)).toEqual([]);
    queryClient.clear();
  });

  it('updates an existing TELEGRAM event on the standard realtime channel', () => {
    const {
      socket,
      fireSocket,
    } = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<
        ReturnType<typeof getRealtimeSocket>
      >,
    );

    const queryClient = new QueryClient();
    const queryKey = roadEventKeys.viewport(
      'balakovo',
      [47.64, 51.9, 48.04, 52.16],
    );
    queryClient.setQueryData(queryKey, [
      {
        ...telegramPayload,
        geometry: {
          type: 'Point',
          coordinates: telegramPayload.coordinate,
        },
      },
    ]);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    act(() => {
      fireSocket('road-event:updated', {
        ...telegramPayload,
        title: 'ДТП — движение восстановлено частично',
      });
    });

    expect(queryClient.getQueryData<Array<{title: string}>>(queryKey)).toEqual([
      expect.objectContaining({
        title: 'ДТП — движение восстановлено частично',
      }),
    ]);

    queryClient.clear();
  });

  it('removes a TELEGRAM event on the standard resolved channel', () => {
    const {
      socket,
      fireSocket,
    } = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<
        ReturnType<typeof getRealtimeSocket>
      >,
    );

    const queryClient = new QueryClient();
    const queryKey = roadEventKeys.viewport(
      'balakovo',
      [47.64, 51.9, 48.04, 52.16],
    );
    queryClient.setQueryData(queryKey, [
      {
        ...telegramPayload,
        geometry: {
          type: 'Point',
          coordinates: telegramPayload.coordinate,
        },
      },
    ]);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    act(() => {
      fireSocket('road-event:resolved', {
        id: telegramPayload.id,
        cityId: telegramPayload.cityId,
      });
    });

    expect(queryClient.getQueryData(queryKey)).toEqual([]);

    queryClient.clear();
  });

  it('ignores an unknown source without changing cached events', () => {
    const {
      socket,
      fireSocket,
    } = createSocketDouble();

    mockedGetRealtimeSocket.mockReturnValue(
      socket as unknown as NonNullable<
        ReturnType<typeof getRealtimeSocket>
      >,
    );

    const queryClient = new QueryClient();
    const queryKey = roadEventKeys.viewport(
      'balakovo',
      [47.64, 51.9, 48.04, 52.16],
    );
    queryClient.setQueryData(queryKey, []);

    act(() => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <StatusProbe />
        </QueryClientProvider>,
      );
    });

    act(() => {
      fireSocket('road-event:created', {
        ...telegramPayload,
        source: 'FUTURE_PROVIDER',
      });
    });

    expect(queryClient.getQueryData(queryKey)).toEqual([]);

    queryClient.clear();
  });
});
