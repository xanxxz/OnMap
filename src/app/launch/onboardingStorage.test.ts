import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  completeCurrentOnboarding,
  CURRENT_ONBOARDING_VERSION,
  hasCompletedCurrentOnboarding,
  ONBOARDING_STORAGE_KEY,
  readOnboardingCompletion,
} from './onboardingStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('onboardingStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats a fresh install as incomplete', async () => {
    storage.getItem.mockResolvedValue(null);

    await expect(hasCompletedCurrentOnboarding()).resolves.toBe(false);
  });

  it('respects the current onboarding version', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({onboardingVersion: 0, completedAt: '2026-01-01'}),
    );

    await expect(hasCompletedCurrentOnboarding()).resolves.toBe(false);

    storage.getItem.mockResolvedValue(
      JSON.stringify({
        onboardingVersion: CURRENT_ONBOARDING_VERSION,
        completedAt: '2026-01-01',
      }),
    );

    await expect(hasCompletedCurrentOnboarding()).resolves.toBe(true);
  });

  it('persists completion only when onboarding finishes', async () => {
    storage.setItem.mockResolvedValue(undefined);

    await completeCurrentOnboarding();

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      ONBOARDING_STORAGE_KEY,
      expect.stringContaining(`"onboardingVersion":${CURRENT_ONBOARDING_VERSION}`),
    );
  });

  it('recovers safely from damaged storage', async () => {
    storage.getItem.mockResolvedValue('{broken');

    await expect(readOnboardingCompletion()).resolves.toBeNull();
  });
});
