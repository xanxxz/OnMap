import 'dotenv/config';

import { BALAKOVO_CITY_CONFIG } from '../src/cities/balakovo/balakovo.config';

interface IncidentEvent {
  code?: number;
  description?: string;
  iconCategory?: number;
}

interface IncidentProperties {
  id?: string;
  iconCategory?: number;
  magnitudeOfDelay?: number;
  events?: IncidentEvent[];
  startTime?: string;
  endTime?: string;
  from?: string;
  to?: string;
  length?: number;
  delay?: number;
  roadNumbers?: string[];
  timeValidity?: string;
  probabilityOfOccurrence?: string;
  numberOfReports?: number;
  lastReportTime?: string;
}

interface IncidentGeometry {
  type?: string;
  coordinates?: unknown;
}

interface Incident {
  type?: string;
  geometry?: IncidentGeometry;
  properties?: IncidentProperties;
}

interface IncidentResponse {
  incidents?: Incident[];
}

interface FlowSegmentData {
  frc?: string;
  currentSpeed?: number;
  freeFlowSpeed?: number;
  currentTravelTime?: number;
  freeFlowTravelTime?: number;
  confidence?: number;
  roadClosure?: boolean;
}

interface FlowResponse {
  flowSegmentData?: FlowSegmentData;
}

const INCIDENT_DETAILS_ENDPOINT =
  'https://api.tomtom.com/traffic/services/5/incidentDetails';

const FLOW_SEGMENT_ENDPOINT =
  'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/14/json';

const INCIDENT_FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,numberOfReports,lastReportTime}}}';

const ICON_CATEGORY_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'Accident',
  2: 'Fog',
  3: 'Dangerous Conditions',
  4: 'Rain',
  5: 'Ice',
  6: 'Jam',
  7: 'Lane Closed',
  8: 'Road Closed',
  9: 'Road Works',
  10: 'Wind',
  11: 'Flooding',
  14: 'Broken Down Vehicle',
};

const bounds = BALAKOVO_CITY_CONFIG.coverageBounds;

const countValues = (
  values: Array<string | number | undefined>,
): Record<string, number> => {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value === undefined ? 'missing' : String(value);

    counts[key] = (counts[key] ?? 0) + 1;

    return counts;
  }, {});
};

const collectCoordinatePairs = (
  value: unknown,
  pairs: Array<[number, number]>,
): void => {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    pairs.push([value[0], value[1]]);

    return;
  }

  for (const nested of value) {
    collectCoordinatePairs(nested, pairs);
  }
};

const summarizeGeometry = (geometry: IncidentGeometry | undefined) => {
  const pairs: Array<[number, number]> = [];

  collectCoordinatePairs(geometry?.coordinates, pairs);

  return {
    type: geometry?.type ?? 'missing',
    pointCount: pairs.length,
    firstCoordinate: pairs[0] ?? null,
    lastCoordinate: pairs.at(-1) ?? null,
    hasPointInsideBalakovoBbox: pairs.some(
      ([longitude, latitude]) =>
        longitude >= bounds.west &&
        longitude <= bounds.east &&
        latitude >= bounds.south &&
        latitude <= bounds.north,
    ),
  };
};

const formatFreshness = (lastReportTime: string | undefined): string | null => {
  if (!lastReportTime) {
    return null;
  }

  const timestamp = Date.parse(lastReportTime);

  if (!Number.isFinite(timestamp)) {
    return lastReportTime;
  }

  const ageMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));

  return `${lastReportTime} (${ageMinutes} min ago)`;
};

const fetchJson = async <T>(label: string, url: URL): Promise<T | null> => {
  try {
    const response = await fetch(url);

    console.log(`${label} HTTP status: ${response.status}`);

    if (!response.ok) {
      console.error(
        `${label} request was rejected; response body is intentionally omitted`,
      );

      process.exitCode = 1;

      return null;
    }

    try {
      return (await response.json()) as T;
    } catch {
      console.error(`${label} returned invalid JSON`);

      process.exitCode = 1;

      return null;
    }
  } catch {
    console.error(
      `${label} request failed before an HTTP response was received`,
    );

    process.exitCode = 1;

    return null;
  }
};

const probeIncidents = async (apiKey: string): Promise<void> => {
  const url = new URL(INCIDENT_DETAILS_ENDPOINT);

  url.searchParams.set('key', apiKey);
  url.searchParams.set(
    'bbox',
    [bounds.west, bounds.south, bounds.east, bounds.north].join(','),
  );
  url.searchParams.set('fields', INCIDENT_FIELDS);
  url.searchParams.set('language', 'ru-RU');
  url.searchParams.set('timeValidityFilter', 'present');

  const payload = await fetchJson<IncidentResponse>('Incident Details v5', url);

  if (!payload) {
    return;
  }

  const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];

  console.log(`Incident count: ${incidents.length}`);
  console.log(
    'Incident feature types:',
    countValues(incidents.map((incident) => incident.type)),
  );
  console.log(
    'Geometry types:',
    countValues(incidents.map((incident) => incident.geometry?.type)),
  );
  console.log(
    'Icon categories:',
    countValues(
      incidents.map((incident) => {
        const category = incident.properties?.iconCategory;

        return category === undefined
          ? undefined
          : `${category} (${ICON_CATEGORY_LABELS[category] ?? 'Unmapped'})`;
      }),
    ),
  );
  console.log(
    'Event descriptions:',
    countValues(
      incidents.flatMap(
        (incident) =>
          incident.properties?.events?.map((event) => event.description) ?? [],
      ),
    ),
  );

  for (const [index, incident] of incidents.slice(0, 5).entries()) {
    const properties = incident.properties ?? {};

    console.log(`Incident example ${index + 1}:`, {
      id: properties.id ?? null,
      iconCategory:
        properties.iconCategory === undefined
          ? null
          : {
              value: properties.iconCategory,
              label:
                ICON_CATEGORY_LABELS[properties.iconCategory] ?? 'Unmapped',
            },
      geometry: summarizeGeometry(incident.geometry),
      events:
        properties.events?.map((event) => ({
          description: event.description ?? null,
          code: event.code ?? null,
          iconCategory: event.iconCategory ?? null,
        })) ?? [],
      from: properties.from ?? null,
      to: properties.to ?? null,
      roadNumbers: properties.roadNumbers ?? [],
      startTime: properties.startTime ?? null,
      endTime: properties.endTime ?? null,
      delaySeconds: properties.delay ?? null,
      lengthMeters: properties.length ?? null,
      lastReportTime: formatFreshness(properties.lastReportTime),
      numberOfReports: properties.numberOfReports ?? null,
      timeValidity: properties.timeValidity ?? null,
    });
  }
};

const probeFlow = async (apiKey: string): Promise<void> => {
  const longitudeSpan = bounds.east - bounds.west;
  const latitudeSpan = bounds.north - bounds.south;

  const probes = [
    {
      label: 'western Balakovo probe',
      longitudeFraction: 0.35,
      latitudeFraction: 0.48,
    },
    {
      label: 'central Balakovo probe',
      longitudeFraction: 0.5,
      latitudeFraction: 0.5,
    },
    {
      label: 'eastern Balakovo probe',
      longitudeFraction: 0.65,
      latitudeFraction: 0.52,
    },
  ];

  for (const probe of probes) {
    const longitude = bounds.west + longitudeSpan * probe.longitudeFraction;
    const latitude = bounds.south + latitudeSpan * probe.latitudeFraction;

    const url = new URL(FLOW_SEGMENT_ENDPOINT);

    url.searchParams.set('key', apiKey);
    url.searchParams.set('point', `${latitude},${longitude}`);
    url.searchParams.set('unit', 'kmph');

    const payload = await fetchJson<FlowResponse>(
      `Flow Segment v4 (${probe.label})`,
      url,
    );

    if (!payload) {
      continue;
    }

    const flow = payload.flowSegmentData;

    console.log(`Flow result (${probe.label}):`, {
      requestedPoint: {
        latitude,
        longitude,
      },
      functionalRoadClass: flow?.frc ?? null,
      currentSpeedKmph: flow?.currentSpeed ?? null,
      freeFlowSpeedKmph: flow?.freeFlowSpeed ?? null,
      confidence: flow?.confidence ?? null,
      currentTravelTimeSeconds: flow?.currentTravelTime ?? null,
      freeFlowTravelTimeSeconds: flow?.freeFlowTravelTime ?? null,
      roadClosure: flow?.roadClosure ?? null,
    });
  }
};

const main = async (): Promise<void> => {
  const apiKey = process.env.TOMTOM_API_KEY?.trim() ?? '';

  if (apiKey.length === 0) {
    console.error(
      'TOMTOM_API_KEY is missing. Add it to backend/.env or the process environment, then run: npm run probe:tomtom-traffic',
    );

    process.exitCode = 1;

    return;
  }

  console.log('Balakovo bbox source: city registry coverageBounds');
  console.log('Balakovo bbox:', bounds);

  await probeIncidents(apiKey);
  await probeFlow(apiKey);
};

void main();
