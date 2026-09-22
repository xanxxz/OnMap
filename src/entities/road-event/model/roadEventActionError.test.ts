jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    createAsyncStorage: () => ({
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
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

import {
  ApiError,
} from '../../../shared/api/httpClient';

import {
  getCreateRoadEventErrorState,
  getFeedbackErrorState,
} from './roadEventActionError';

describe('RoadEvent action error UX', () => {
  it('maps create 409 to a human-readable duplicate state', () => {
    const state =
      getCreateRoadEventErrorState(
        new ApiError(
          'raw backend message',
          409,
          null,
        ),
      );

    expect(state).toMatchObject({
      kind: 'duplicate',
      title:
        'Похожее событие уже отмечено рядом',
      canRetry: false,
    });
    expect(
      state.description,
    ).not.toContain(
      'raw backend message',
    );
  });

  it('maps create and feedback 429 to separate rate-limit states', () => {
    const error =
      new ApiError(
        'Too Many Requests',
        429,
        null,
      );

    expect(
      getCreateRoadEventErrorState(
        error,
      ),
    ).toMatchObject({
      kind: 'rateLimit',
      title:
        'Слишком много отметок',
      canRetry: true,
    });

    expect(
      getFeedbackErrorState(
        error,
      ),
    ).toMatchObject({
      kind: 'rateLimit',
      title:
        'Слишком много действий',
      canRetry: true,
    });
  });
});
