import type {StyleSpecification} from '@maplibre/maplibre-react-native';

import {createOnMapMapStyle} from './onMapMapStyle';

const baseStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {id: 'background', type: 'background', paint: {'background-color': '#fff'}},
    {id: 'water', type: 'fill', source: 'base', 'source-layer': 'water'},
    {id: 'park', type: 'fill', source: 'base', 'source-layer': 'park'},
    {id: 'building', type: 'fill', source: 'base', 'source-layer': 'building'},
    {id: 'road-primary', type: 'line', source: 'base', 'source-layer': 'road'},
    {id: 'road-casing', type: 'line', source: 'base', 'source-layer': 'road'},
    {id: 'poi-shop', type: 'symbol', source: 'base', 'source-layer': 'poi'},
  ],
};

describe('createOnMapMapStyle', () => {
  it('applies the OnMap palette without changing provider sources', () => {
    const result = createOnMapMapStyle(baseStyle);

    expect(result.sources).toEqual(baseStyle.sources);
    expect(result.layers.find(layer => layer.id === 'water')?.paint).toEqual(
      expect.objectContaining({'fill-color': '#C5DEE5'}),
    );
    expect(
      result.layers.find(layer => layer.id === 'road-primary')?.paint,
    ).toEqual(expect.objectContaining({'line-color': '#FFFEF7'}));
  });

  it('reduces generic POI density but preserves the layer', () => {
    const result = createOnMapMapStyle(baseStyle);
    const poi = result.layers.find(layer => layer.id === 'poi-shop');

    expect(poi).toBeDefined();
    expect(poi?.minzoom).toBe(15);
  });

  it('does not mutate the downloaded provider style', () => {
    createOnMapMapStyle(baseStyle);

    expect(baseStyle.layers.find(layer => layer.id === 'water')?.paint).toBeUndefined();
  });
});
