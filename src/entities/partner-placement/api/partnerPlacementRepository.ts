import {httpRequest} from '../../../shared/api/httpClient';
import type {MapBounds} from '../../../shared/types/map';
import type {PartnerPlacements, PartnerPoint} from '../model/partnerPlacement';
import {isPartnerAppearance} from '../lib/partnerAppearance';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);

const PARTNER_IMAGE_PATH = /^\/partner-placements\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const isPartnerImagePath = (value: unknown): value is string =>
  typeof value === 'string' && PARTNER_IMAGE_PATH.test(value);

const isContact = (value: unknown): boolean =>
  isRecord(value) &&
  (value.id === undefined || isString(value.id)) &&
  ['PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER'].includes(String(value.type)) &&
  isString(value.label) &&
  isString(value.value) &&
  typeof value.displayOrder === 'number';

const isPoint = (value: unknown): boolean =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.cityId) &&
  isString(value.title) &&
  isString(value.category) &&
  (value.appearance === undefined || isPartnerAppearance(value.appearance)) &&
  isNullableString(value.description) &&
  isNullableString(value.displayAddress) &&
  (value.imageUrl === null || isPartnerImagePath(value.imageUrl)) &&
  (value.promoCode === undefined || isNullableString(value.promoCode)) &&
  isRecord(value.coordinates) &&
  typeof value.coordinates.longitude === 'number' &&
  Number.isFinite(value.coordinates.longitude) &&
  typeof value.coordinates.latitude === 'number' &&
  Number.isFinite(value.coordinates.latitude) &&
  Array.isArray(value.contacts) &&
  value.contacts.every(isContact);

const isBanner = (value: unknown): boolean =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.cityId) &&
  isString(value.title) &&
  isString(value.text) &&
  isString(value.partnerPointId) &&
  (value.appearance === undefined || isPartnerAppearance(value.appearance)) &&
  isRecord(value.button) &&
  isString(value.button.label) &&
  isString(value.button.url);

export const parsePartnerPlacements = (
  payload: unknown,
  cityId: string,
): PartnerPlacements => {
  const banner = isRecord(payload) ? payload.banner : undefined;
  if (
    !isRecord(payload) ||
    payload.cityId !== cityId ||
    !Array.isArray(payload.points) ||
    !payload.points.every(point => isPoint(point) && point.cityId === cityId) ||
    !(banner === null || (isRecord(banner) && isBanner(banner) && banner.cityId === cityId))
  ) {
    throw new Error('API returned invalid partner placements');
  }

  const placements = payload as unknown as PartnerPlacements;
  return {
    ...placements,
    points: placements.points.map(point => ({...point, promoCode: point.promoCode ?? null})),
  };
};

export const partnerPlacementRepository = {
  async getActivePoint(id: string, cityId: string): Promise<PartnerPoint> {
    const point = await httpRequest<unknown>(
      `/partner-placements/points/${encodeURIComponent(id)}?cityId=${encodeURIComponent(cityId)}`,
    );
    if (!isPoint(point) || !isRecord(point) || point.cityId !== cityId) {
      throw new Error('API returned invalid partner point');
    }
    return {...point, promoCode: point.promoCode ?? null} as unknown as PartnerPoint;
  },
  async recordInteraction(action: 'POINT_OPEN' | 'CONTACT_CLICK' | 'BANNER_IMPRESSION' | 'BANNER_CLICK', targetId: string, contactId?: string): Promise<void> {
    await httpRequest('/partner-placements/interaction', {
      method: 'POST',
      body: JSON.stringify({action, targetId, ...(contactId ? {contactId} : {})}),
    });
  },
  async list(cityId: string, bounds: MapBounds): Promise<PartnerPlacements> {
    const [west, south, east, north] = bounds;
    const query = [
      ['cityId', cityId],
      ['west', String(west)],
      ['south', String(south)],
      ['east', String(east)],
      ['north', String(north)],
    ]
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return parsePartnerPlacements(
      await httpRequest<unknown>(`/partner-placements?${query}`),
      cityId,
    );
  },
};
