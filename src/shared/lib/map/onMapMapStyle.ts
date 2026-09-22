import type {StyleSpecification} from '@maplibre/maplibre-react-native';

type MutableStyleLayer = StyleSpecification['layers'][number] & {
  minzoom?: number;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  'source-layer'?: string;
};

const palette = {
  background: '#EDF1EA',
  land: '#F1F1E9',
  residential: '#EBEDE5',
  industrial: '#E5E4DB',
  park: '#DCE8D6',
  grass: '#E5EDE0',
  forest: '#CFDEC9',
  water: '#C5DEE5',
  waterLine: '#A9CED7',
  building: '#DCDDD4',
  roadMain: '#FFFEF7',
  roadMinor: '#F7F6EE',
  roadCasing: '#C9D0C8',
  roadQuiet: '#DEE2D9',
  label: '#29423A',
  labelHalo: 'rgba(247,244,234,0.94)',
} as const;

const includesAny = (value: string, terms: readonly string[]): boolean =>
  terms.some(term => value.includes(term));

const mergePaint = (
  layer: MutableStyleLayer,
  paint: Record<string, unknown>,
) => {
  layer.paint = {...(layer.paint ?? {}), ...paint};
};

const styleLayer = (layer: MutableStyleLayer) => {
  const identity = `${layer.id} ${layer['source-layer'] ?? ''}`.toLowerCase();

  if (layer.type === 'background') {
    mergePaint(layer, {'background-color': palette.background});
    return;
  }

  const isWater = includesAny(identity, ['water', 'ocean', 'river', 'lake']);
  if (isWater) {
    if (layer.type === 'fill') {
      mergePaint(layer, {'fill-color': palette.water, 'fill-opacity': 0.92});
    } else if (layer.type === 'line') {
      mergePaint(layer, {
        'line-color': palette.waterLine,
        'line-opacity': 0.72,
      });
    }
  }

  if (layer.type === 'fill') {
    if (includesAny(identity, ['forest', 'wood'])) {
      mergePaint(layer, {'fill-color': palette.forest, 'fill-opacity': 0.88});
    } else if (includesAny(identity, ['park', 'garden', 'recreation'])) {
      mergePaint(layer, {'fill-color': palette.park, 'fill-opacity': 0.9});
    } else if (includesAny(identity, ['grass', 'meadow', 'green'])) {
      mergePaint(layer, {'fill-color': palette.grass, 'fill-opacity': 0.82});
    } else if (includesAny(identity, ['residential', 'suburb'])) {
      mergePaint(layer, {
        'fill-color': palette.residential,
        'fill-opacity': 0.72,
      });
    } else if (includesAny(identity, ['industrial', 'commercial'])) {
      mergePaint(layer, {
        'fill-color': palette.industrial,
        'fill-opacity': 0.68,
      });
    } else if (includesAny(identity, ['building'])) {
      mergePaint(layer, {
        'fill-color': palette.building,
        'fill-outline-color': '#D2D5CD',
        'fill-opacity': 0.68,
      });
    } else if (includesAny(identity, ['landcover', 'landuse', 'natural'])) {
      mergePaint(layer, {'fill-color': palette.land, 'fill-opacity': 0.7});
    }
  }

  const isRoad =
    layer.type === 'line' &&
    includesAny(identity, ['road', 'street', 'transportation', 'highway']);

  if (isRoad) {
    const isCasing = includesAny(identity, ['casing', 'outline']);
    const isMajor = includesAny(identity, [
      'motorway',
      'trunk',
      'primary',
      'secondary',
      'major',
    ]);
    const isQuiet = includesAny(identity, [
      'path',
      'track',
      'service',
      'pedestrian',
    ]);

    mergePaint(layer, {
      'line-color': isCasing
        ? palette.roadCasing
        : isMajor
          ? palette.roadMain
          : isQuiet
            ? palette.roadQuiet
            : palette.roadMinor,
      'line-opacity': isCasing ? 0.62 : isQuiet ? 0.52 : 0.9,
    });
  }

  if (layer.type === 'symbol') {
    mergePaint(layer, {
      'text-color': palette.label,
      'text-halo-color': palette.labelHalo,
      'text-halo-width': 1.15,
      'text-halo-blur': 0.35,
    });

    if (includesAny(identity, ['poi', 'shop', 'amenity'])) {
      layer.minzoom = Math.max(layer.minzoom ?? 0, 15);
      mergePaint(layer, {'icon-opacity': 0.62, 'text-opacity': 0.72});
    }
  }

  if (layer.type === 'hillshade') {
    mergePaint(layer, {
      'hillshade-exaggeration': 0.12,
      'hillshade-shadow-color': '#28483B',
      'hillshade-highlight-color': '#F7F4EA',
      'hillshade-accent-color': '#78947D',
    });
  }

  if (layer.type === 'fill-extrusion') {
    mergePaint(layer, {
      'fill-extrusion-color': palette.building,
      'fill-extrusion-opacity': 0.42,
    });
  }
};

export const createOnMapMapStyle = (
  sourceStyle: StyleSpecification,
): StyleSpecification => {
  const style = JSON.parse(JSON.stringify(sourceStyle)) as StyleSpecification;

  style.layers.forEach(layer => styleLayer(layer as MutableStyleLayer));

  return style;
};
