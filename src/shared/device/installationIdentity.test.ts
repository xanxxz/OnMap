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

import {
  clearAnonymousIdentityToken,
  getAnonymousIdentityToken,
} from './installationIdentity';

const { mockStorage } = jest.requireMock(
  '@react-native-async-storage/async-storage',
) as {
  mockStorage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
    removeItem: jest.Mock<Promise<void>, [string]>;
  };
};

describe('anonymous identity storage', () => {
  beforeEach(async () => {
    await clearAnonymousIdentityToken();
    jest.clearAllMocks();
  });

  it('reuses a token stored in AsyncStorage', async () => {
    mockStorage.getItem.mockResolvedValue('stored-token');
    const issueToken = jest.fn().mockResolvedValue('issued-token');

    await expect(getAnonymousIdentityToken(issueToken)).resolves.toBe(
      'stored-token',
    );
    await expect(getAnonymousIdentityToken(issueToken)).resolves.toBe(
      'stored-token',
    );

    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
    expect(issueToken).not.toHaveBeenCalled();
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it('issues and stores a token when storage is empty', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    const issueToken = jest.fn().mockResolvedValue('issued-token');

    await expect(getAnonymousIdentityToken(issueToken)).resolves.toBe(
      'issued-token',
    );

    expect(issueToken).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'anonymousIdentityToken',
      'issued-token',
    );
  });

  it('shares one identity issue across concurrent requests', async () => {
    mockStorage.getItem.mockResolvedValue(null);
    const issueToken = jest.fn().mockResolvedValue('shared-token');

    const tokens = await Promise.all([
      getAnonymousIdentityToken(issueToken),
      getAnonymousIdentityToken(issueToken),
      getAnonymousIdentityToken(issueToken),
    ]);

    expect(tokens).toEqual(['shared-token', 'shared-token', 'shared-token']);
    expect(mockStorage.getItem).toHaveBeenCalledTimes(1);
    expect(issueToken).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
