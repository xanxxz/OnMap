import React, {useEffect, useState} from 'react';

import {RootNavigator} from '../navigation/RootNavigator';
import {LaunchScreen} from '../../screens/LaunchScreen/LaunchScreen';
import {OnboardingScreen} from '../../screens/OnboardingScreen/OnboardingScreen';
import {motion} from '../../shared/theme';

import {
  completeCurrentOnboarding,
  hasCompletedCurrentOnboarding,
} from './onboardingStorage';

type LaunchDestination = 'launch' | 'onboarding' | 'map';

export const AppLaunchGate = () => {
  const [destination, setDestination] =
    useState<LaunchDestination>('launch');

  useEffect(() => {
    let active = true;

    const resolveDestination = async () => {
      const minimumPresence = new Promise<void>(resolve => {
        setTimeout(resolve, motion.launchMinimumVisibleMs);
      });

      const completionCheck = hasCompletedCurrentOnboarding().catch(
        () => false,
      );

      const [, completed] = await Promise.all([
        minimumPresence,
        completionCheck,
      ]);

      if (active) {
        setDestination(completed ? 'map' : 'onboarding');
      }
    };

    resolveDestination().catch(() => {
      if (active) {
        setDestination('onboarding');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (destination === 'launch') {
    return <LaunchScreen />;
  }

  if (destination === 'onboarding') {
    return (
      <OnboardingScreen
        onComplete={async () => {
          await completeCurrentOnboarding();
          setDestination('map');
        }}
      />
    );
  }

  return <RootNavigator />;
};
