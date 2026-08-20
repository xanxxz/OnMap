import React from 'react';

import {
  StatusBar,
} from 'react-native';

import {RootNavigator} from './navigation/RootNavigator';
import {AppProviders} from './providers/AppProviders';

const App = () => {
  return (
    <AppProviders>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />

      <RootNavigator />
    </AppProviders>
  );
};

export default App;