export type PartnerContactType =
  | 'PHONE'
  | 'EMAIL'
  | 'WEBSITE'
  | 'TELEGRAM'
  | 'OTHER';

export interface PartnerContact {
  id?: string;
  type: PartnerContactType;
  label: string;
  value: string;
  displayOrder: number;
}

export interface PartnerPoint {
  id: string;
  cityId: string;
  title: string;
  category: string;
  appearance?: PartnerAppearance;
  description: string | null;
  coordinates: { longitude: number; latitude: number };
  displayAddress: string | null;
  startsAt: string;
  endsAt: string;
  imageUrl: string | null;
  promoCode: string | null;
  contacts: PartnerContact[];
}

export interface PartnerAppearance {
  backgroundColor: string;
  textColor: string;
}

export interface PartnerBanner {
  id: string;
  cityId: string;
  title: string;
  partnerPointId: string;
  appearance?: PartnerAppearance;
  text: string;
  button: { label: string; url: string };
  startsAt: string;
  endsAt: string;
}

export interface PartnerPlacements {
  cityId: string;
  points: PartnerPoint[];
  banner: PartnerBanner | null;
}
