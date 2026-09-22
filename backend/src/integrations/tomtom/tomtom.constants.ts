export const TOMTOM_TRAFFIC_INCIDENTS_ENDPOINT =
  'https://api.tomtom.com/traffic/services/5/incidentDetails';

export const TOMTOM_SEARCH_ENDPOINT = 'https://api.tomtom.com/search/2/search';

export const TOMTOM_REQUEST_TIMEOUT_MS = 5_000;

export const TOMTOM_TRAFFIC_CACHE_TTL_MS = 60_000;

export const TOMTOM_SEARCH_CACHE_TTL_MS = 5 * 60_000;

export const TOMTOM_SEARCH_CACHE_MAX_ENTRIES = 100;

export const TOMTOM_SEARCH_RESULT_LIMIT = 5;

export const TOMTOM_INCIDENT_FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,numberOfReports,lastReportTime}}}';
