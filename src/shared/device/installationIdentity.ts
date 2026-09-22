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
        await storage.removeItem(
          ANONYMOUS_TOKEN_KEY,
        );

        return createAndStoreToken(
          issueToken,
        );
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
    anonymousTokenPromise =
      null;

    refreshTokenPromise =
      null;

    await storage.removeItem(
      ANONYMOUS_TOKEN_KEY,
    );
  };
