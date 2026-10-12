import React from 'react';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {MapScreen} from '../../screens/MapScreen/MapScreen';
import {PushRegistrationGate} from '../../features/notifications/PushRegistrationGate';

export type RootStackParamList = {
  Map: undefined;
};

const Stack =
  createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  return (
    <NavigationContainer>
      <PushRegistrationGate />
      <Stack.Navigator
        initialRouteName="Map"
        screenOptions={{
          headerShown: false,

          animation: 'fade',
        }}>
        <Stack.Screen
          name="Map"
          component={MapScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
