import React from 'react';

import {
  StatusBar,
} from 'react-native';

import {AppLaunchGate} from './launch/AppLaunchGate';
import {AppProviders} from './providers/AppProviders';

const App = () => {
  return (
    <AppProviders>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />

      <AppLaunchGate />
    </AppProviders>
  );
};

export default App;
