import {
  createAsyncStorage,
} from '@react-native-async-storage/async-storage';

const storage =
  createAsyncStorage(
    'roadradarIdentity',
  );

const INSTALLATION_ID_KEY =
  'installationId';

let installationIdPromise:
  | Promise<string>
  | null = null;

const generatePart =
  (): string => {
    return Math.random()
      .toString(36)
      .slice(2);
  };

const generateInstallationId =
  (): string => {
    return [
      'rr',
      Date.now().toString(36),
      generatePart(),
      generatePart(),
      generatePart(),
    ].join('_');
  };

const loadOrCreateInstallationId =
  async (): Promise<string> => {
    const existing =
      await storage.getItem(
        INSTALLATION_ID_KEY,
      );

    if (
      existing &&
      existing.length >= 16
    ) {
      return existing;
    }

    const installationId =
      generateInstallationId();

    await storage.setItem(
      INSTALLATION_ID_KEY,
      installationId,
    );

    return installationId;
  };

export const getInstallationId =
  (): Promise<string> => {
    if (
      !installationIdPromise
    ) {
      installationIdPromise =
        loadOrCreateInstallationId();
    }

    return installationIdPromise;
  };