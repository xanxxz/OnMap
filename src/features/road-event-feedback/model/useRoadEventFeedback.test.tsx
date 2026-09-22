jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    createAsyncStorage: () => ({
      getItem: jest
        .fn()
        .mockResolvedValue(null),
      setItem: jest
        .fn()
        .mockResolvedValue(undefined),
      removeItem: jest
        .fn()
        .mockResolvedValue(undefined),
    }),
  }),
);

jest.mock(
  '../../../shared/config/env',
  () => ({
    env: {
      apiBaseUrl:
        'http://api.test/api',
    },
  }),
);

const mockFeedback =
  jest.fn();

jest.mock(
  '../../../entities/road-event/api/httpRoadEventRepository',
  () => ({
    roadEventRepository: {
      feedback: (
        ...args: unknown[]
      ) =>
        mockFeedback(
          ...args,
        ),
    },
  }),
);

import React from 'react';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import {
  act,
  create,
  ReactTestRenderer,
} from 'react-test-renderer';

import {
  ApiError,
} from '../../../shared/api/httpClient';

import {
  useRoadEventFeedback,
} from './useRoadEventFeedback';

import {
  useRoadEventFeedbackStore,
} from './useRoadEventFeedbackStore';

describe('useRoadEventFeedback error handling', () => {
  let renderer:
    ReactTestRenderer;

  let mutation!:
    ReturnType<
      typeof useRoadEventFeedback
    >;

  const Probe = () => {
    mutation =
      useRoadEventFeedback();

    return null;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    useRoadEventFeedbackStore.setState(
      {
        feedbackByEventId:
          {},
      },
    );
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('does not persist a successful local vote after an API error', async () => {
    mockFeedback.mockRejectedValueOnce(
      new ApiError(
        'Too Many Requests',
        429,
        null,
      ),
    );

    const queryClient =
      new QueryClient({
        defaultOptions: {
          mutations: {
            retry: false,
            gcTime:
              Infinity,
          },
        },
      });

    act(() => {
      renderer = create(
        <QueryClientProvider
          client={
            queryClient
          }>
          <Probe />
        </QueryClientProvider>,
      );
    });

    await act(
      async () => {
        await expect(
          mutation.mutateAsync(
            {
              cityId:
                'balakovo',
              eventId:
                'event-1',
              action:
                'CONFIRM',
            },
          ),
        ).rejects.toBeInstanceOf(
          ApiError,
        );
      },
    );

    expect(
      useRoadEventFeedbackStore
        .getState()
        .feedbackByEventId,
    ).not.toHaveProperty(
      'event-1',
    );

    queryClient.clear();
  });
});
