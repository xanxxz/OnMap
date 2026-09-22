jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = {
    getItem: jest.fn<Promise<string | null>, [string]>(),
    setItem: jest.fn<Promise<void>, [string, string]>(),
    removeItem: jest.fn<Promise<void>, [string]>(),
  };

  return {
    createAsyncStorage: () => storage,
    mockStorage: storage,
  };
});

jest.mock('../config/env', () => ({
  env: {
    apiBaseUrl: 'http://api.test/api',
  },
}));

import {
  clearAnonymousIdentityToken,
} from '../device/installationIdentity';

import {
  ApiError,
  httpRequest,
} from './httpClient';

const { mockStorage } = jest.requireMock(
  '@react-native-async-storage/async-storage',
) as {
  mockStorage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
    removeItem: jest.Mock<Promise<void>, [string]>;
  };
};

const createResponse = (
  status: number,
  body: unknown,
): Response => {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
};

const getAuthorization = (callIndex: number): string | null => {
  const request = (globalThis.fetch as jest.Mock).mock.calls[callIndex]?.[1] as
    | RequestInit
    | undefined;

  return new Headers(request?.headers).get('Authorization');
};

describe('identity-aware HTTP client', () => {
  const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeAll(() => {
    globalThis.fetch = mockFetch as typeof fetch;
  });

  beforeEach(async () => {
    await clearAnonymousIdentityToken();
    jest.clearAllMocks();
  });

  it('adds a stored anonymous token as a Bearer header', async () => {
    mockStorage.getItem.mockResolvedValue('stored-token');
    mockFetch.mockResolvedValue(createResponse(200, { success: true }));

    await httpRequest('/road-events');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getAuthorization(0)).toBe('Bearer stored-token');
  });

  it('issues and stores identity before a protected request', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    mockFetch
      .mockResolvedValueOnce(
        createResponse(201, {
          token: 'new-token',
        }),
      )
      .mockResolvedValueOnce(createResponse(200, { success: true }));

    await httpRequest('/road-events');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://api.test/api/identity/anonymous',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(getAuthorization(0)).toBeNull();
    expect(getAuthorization(1)).toBe('Bearer new-token');
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'anonymousIdentityToken',
      'new-token',
    );
  });

  it('issues only one identity for concurrent requests', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/identity/anonymous')) {
        return createResponse(201, {
          token: 'shared-token',
        });
      }

      return createResponse(200, { success: true });
    });

    await Promise.all([
      httpRequest('/road-events?cityId=balakovo'),
      httpRequest('/road-events/another'),
    ]);

    const identityCalls = mockFetch.mock.calls.filter(([input]) =>
      String(input).endsWith('/identity/anonymous'),
    );

    expect(identityCalls).toHaveLength(1);
  });

  it('refreshes identity and retries once after 401', async () => {
    mockStorage.getItem.mockResolvedValue('expired-token');
    mockFetch
      .mockResolvedValueOnce(createResponse(401, { message: 'Invalid token' }))
      .mockResolvedValueOnce(
        createResponse(201, {
          token: 'refreshed-token',
        }),
      )
      .mockResolvedValueOnce(createResponse(200, { success: true }));

    await httpRequest('/road-events');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(getAuthorization(0)).toBe('Bearer expired-token');
    expect(getAuthorization(1)).toBeNull();
    expect(getAuthorization(2)).toBe('Bearer refreshed-token');
    expect(mockStorage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('does not retry indefinitely after a second 401', async () => {
    mockStorage.getItem.mockResolvedValue('expired-token');
    mockFetch
      .mockResolvedValueOnce(createResponse(401, { message: 'Invalid token' }))
      .mockResolvedValueOnce(
        createResponse(201, {
          token: 'rejected-refreshed-token',
        }),
      )
      .mockResolvedValueOnce(createResponse(401, { message: 'Invalid token' }));

    await expect(httpRequest('/road-events')).rejects.toBeInstanceOf(ApiError);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockStorage.removeItem).toHaveBeenCalledTimes(2);
  });
});
