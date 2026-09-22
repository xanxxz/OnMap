import AsyncStorage from '@react-native-async-storage/async-storage';

export const CURRENT_ONBOARDING_VERSION = 1;

export const ONBOARDING_STORAGE_KEY = 'onmap:onboarding';

export interface OnboardingCompletion {
  onboardingVersion: number;
  completedAt: string;
}

export const readOnboardingCompletion = async (): Promise<OnboardingCompletion | null> => {
  const stored = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OnboardingCompletion>;

    if (
      typeof parsed.onboardingVersion !== 'number' ||
      typeof parsed.completedAt !== 'string'
    ) {
      return null;
    }

    return {
      onboardingVersion: parsed.onboardingVersion,
      completedAt: parsed.completedAt,
    };
  } catch {
    return null;
  }
};

export const hasCompletedCurrentOnboarding = async (): Promise<boolean> => {
  const completion = await readOnboardingCompletion();

  return completion?.onboardingVersion === CURRENT_ONBOARDING_VERSION;
};

export const completeCurrentOnboarding = async (): Promise<void> => {
  const completion: OnboardingCompletion = {
    onboardingVersion: CURRENT_ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(
    ONBOARDING_STORAGE_KEY,
    JSON.stringify(completion),
  );
};
