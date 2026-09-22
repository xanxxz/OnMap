jest.mock(
  'react-native-config',
  () => ({}),
);

import {
  resolveMapStyleConfiguration,
} from './env';

describe('map style configuration', () => {
  it('selects MapTiler Streets as primary when a key is configured', () => {
    const configuration =
      resolveMapStyleConfiguration(
        'map-key',
      );

    expect(
      configuration.primary,
    ).toEqual({
      id: 'maptiler',

      styleUrl:
        'https://api.maptiler.com/maps/streets-v4/style.json?key=map-key',
    });

    expect(
      configuration.initial,
    ).toBe(
      configuration.primary,
    );
  });

  it('selects OpenFreeMap when primary configuration is absent', () => {
    const configuration =
      resolveMapStyleConfiguration(
        '   ',
      );

    expect(
      configuration.primary,
    ).toBeNull();

    expect(
      configuration.initial,
    ).toBe(
      configuration.fallback,
    );

    expect(
      configuration.fallback,
    ).toEqual({
      id: 'openfreemap',

      styleUrl:
        'https://tiles.openfreemap.org/styles/liberty',
    });
  });
});
