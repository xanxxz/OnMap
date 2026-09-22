import {useEffect, useState} from 'react';

import type {StyleSpecification} from '@maplibre/maplibre-react-native';

import {createOnMapMapStyle} from './onMapMapStyle';

const styleCache = new Map<string, StyleSpecification>();

const STYLE_REQUEST_TIMEOUT_MS = 7_000;

export const useOnMapMapStyle = (
  styleUrl: string,
): string | StyleSpecification => {
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(
    () => styleCache.get(styleUrl) ?? styleUrl,
  );

  useEffect(() => {
    const cached = styleCache.get(styleUrl);
    if (cached) {
      setMapStyle(cached);
      return;
    }

    setMapStyle(styleUrl);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      STYLE_REQUEST_TIMEOUT_MS,
    );

    fetch(styleUrl, {signal: controller.signal})
      .then(response => {
        if (!response.ok) {
          throw new Error(`Map style request failed with ${response.status}`);
        }

        return response.json() as Promise<StyleSpecification>;
      })
      .then(sourceStyle => {
        const brandedStyle = createOnMapMapStyle(sourceStyle);
        styleCache.set(styleUrl, brandedStyle);
        setMapStyle(brandedStyle);
      })
      .catch(() => {
        // The Map component keeps the provider URL and its existing fallback flow.
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [styleUrl]);

  return mapStyle;
};
