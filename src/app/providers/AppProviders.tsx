import React, {
  PropsWithChildren,
  useState,
} from 'react';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import {
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';

import {styles} from './AppProviders.styles';

export const AppProviders = ({
  children,
}: PropsWithChildren) => {
  const [queryClient] =
    useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: {
              retry: 1,

              staleTime:
                30_000,
            },
          },
        }),
    );

  return (
    <GestureHandlerRootView
      style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider
          client={queryClient}>
          {children}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};