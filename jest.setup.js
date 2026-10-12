/* global jest */

require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: callback => callback(),
}));

jest.mock('react-native-config', () => ({}));
jest.mock('react-native-permissions', () => require('react-native-permissions/mock'));
jest.mock('@react-native-clipboard/clipboard', () =>
  require('@react-native-clipboard/clipboard/jest/clipboard-mock.js'),
);
jest.mock('@sbaiahmed1/react-native-blur', () => {
  const ReactNative = require('react-native');

  return {BlurView: ReactNative.View};
});
jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const createStorage = () => {
      const values = new Map();

      return {
        getItem: jest.fn(key => Promise.resolve(values.get(key) ?? null)),
        setItem: jest.fn((key, value) => {
          values.set(key, value);
          return Promise.resolve();
        }),
        removeItem: jest.fn(key => {
          values.delete(key);
          return Promise.resolve();
        }),
        clear: jest.fn(() => {
          values.clear();
          return Promise.resolve();
        }),
      };
    };
    const defaultStorage = createStorage();

    return {
      __esModule: true,
      default: defaultStorage,
      createAsyncStorage: jest.fn(() => createStorage()),
    };
  },
);

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');

  return {
    __esModule: true,
    default: {View: ReactNative.View},
    ReduceMotion: {System: 'system'},
    useSharedValue: initialValue => ({
      get: () => initialValue,
      set: jest.fn(),
    }),
    useAnimatedStyle: factory => factory(),
    useReducedMotion: () => false,
    interpolate: (value, input, output) => output[input.indexOf(value)] ?? output[0],
    withSpring: value => value,
    withTiming: value => value,
  };
});

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const ReactNative = require('react-native');
  const Component = React.forwardRef(({children, ...props}, ref) => (
    <ReactNative.View {...props} ref={ref}>
      {children}
    </ReactNative.View>
  ));

  return {
    Camera: Component,
    GeoJSONSource: Component,
    Layer: Component,
    Map: Component,
    Marker: Component,
    UserLocation: Component,
    LocationManager: {
      requestPermission: jest.fn(() => Promise.resolve(false)),
      requestPermissions: jest.fn(() => Promise.resolve(false)),
      addListener: jest.fn(() => ({remove: jest.fn()})),
      removeListener: jest.fn(),
    },
    useCurrentPosition: jest.fn(() => null),
  };
});
