import {
  createAsyncStorage,
} from '@react-native-async-storage/async-storage';

const storage =
  createAsyncStorage(
    'roadradarIdentity',
  );

const ANONYMOUS_TOKEN_KEY =
  'anonymousIdentityToken';

export type AnonymousIdentityIssuer =
  () => Promise<string>;

let anonymousTokenPromise:
  | Promise<string>
  | null = null;

let refreshTokenPromise:
  | Promise<string>
  | null = null;

let beforeIdentityReset: ((token: string) => Promise<void>) | null = null;
const refreshListeners = new Set<() => void>();

export const subscribeAnonymousIdentityRefresh = (listener: () => void): (() => void) => {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
};

export const setBeforeAnonymousIdentityReset = (
  handler: ((token: string) => Promise<void>) | null,
): void => { beforeIdentityReset = handler; };

const notifyBeforeReset = async () => {
  const previous = await storage.getItem(ANONYMOUS_TOKEN_KEY);
  if (previous && beforeIdentityReset) {
    await beforeIdentityReset(previous).catch(() => undefined);
  }
};

const createAndStoreToken =
  async (
    issueToken:
      AnonymousIdentityIssuer,
  ): Promise<string> => {
    const token =
      await issueToken();

    if (
      typeof token !==
        'string' ||
      token.length === 0
    ) {
      throw new Error(
        'Identity API returned an invalid token',
      );
    }

    await storage.setItem(
      ANONYMOUS_TOKEN_KEY,
      token,
    );

    return token;
  };

const loadOrCreateAnonymousToken =
  async (
    issueToken:
      AnonymousIdentityIssuer,
  ): Promise<string> => {
    const existingToken =
      await storage.getItem(
        ANONYMOUS_TOKEN_KEY,
      );

    if (existingToken) {
      return existingToken;
    }

    return createAndStoreToken(
      issueToken,
    );
  };

export const getAnonymousIdentityToken =
  (
    issueToken:
      AnonymousIdentityIssuer,
  ): Promise<string> => {
    if (!anonymousTokenPromise) {
      const loadPromise =
        loadOrCreateAnonymousToken(
          issueToken,
        );

      const guardedLoadPromise =
        loadPromise.catch(
          error => {
            if (
              anonymousTokenPromise ===
              guardedLoadPromise
            ) {
              anonymousTokenPromise =
                null;
            }

            throw error;
          },
        );

      anonymousTokenPromise =
        guardedLoadPromise;
    }

    return anonymousTokenPromise;
  };

export const refreshAnonymousIdentityToken =
  (
    issueToken:
      AnonymousIdentityIssuer,
  ): Promise<string> => {
    if (refreshTokenPromise) {
      return refreshTokenPromise;
    }

    const refreshPromise =
      (async () => {
        await notifyBeforeReset();
        await storage.removeItem(
          ANONYMOUS_TOKEN_KEY,
        );

        const token = await createAndStoreToken(
          issueToken,
        );
        refreshListeners.forEach(listener => listener());
        return token;
      })();

    const guardedRefreshPromise =
      refreshPromise.catch(
        error => {
          if (
            anonymousTokenPromise ===
            guardedRefreshPromise
          ) {
            anonymousTokenPromise =
              null;
          }

          throw error;
        },
      );

    anonymousTokenPromise =
      guardedRefreshPromise;

    refreshTokenPromise =
      guardedRefreshPromise.finally(
        () => {
          refreshTokenPromise =
            null;
        },
      );

    return refreshTokenPromise;
  };

export const clearAnonymousIdentityToken =
  async (): Promise<void> => {
    await notifyBeforeReset();
    anonymousTokenPromise =
      null;

    refreshTokenPromise =
      null;

    await storage.removeItem(
      ANONYMOUS_TOKEN_KEY,
    );
  };
