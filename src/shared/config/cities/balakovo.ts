export interface CityConfig {
  id: string;

  name: string;

  center: [number, number];

  navigationBounds: [
    number,
    number,
    number,
    number,
  ];

  defaultZoom: number;

  minZoom: number;

  maxZoom: number;
}

export const balakovoCity: CityConfig = {
  id: 'balakovo',

  name: 'Балаково',

  center: [47.8007, 52.0278],

  navigationBounds: [
    47.64,
    51.9,
    48.04,
    52.16,
  ],

  defaultZoom: 13,

  minZoom: 10.8,

  maxZoom: 19,
};