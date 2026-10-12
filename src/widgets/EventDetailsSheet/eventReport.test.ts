import type { RoadEvent, TelegramRoadEvent, TomTomRoadEvent } from '../../entities/road-event/model/roadEvent';

import { buildEventReportMessage, buildEventReportUrl } from './eventReport';

const userEvent: RoadEvent = {
  id: 'event-123',
  source: 'USER',
  cityId: 'balakovo',
  type: 'ROAD_PATROL',
  status: 'ACTIVE',
  title: 'ДПС',
  coordinate: [47.8, 52.02],
  geometry: {type: 'Point', coordinates: [47.8, 52.02]},
  confirmationCount: 0,
  rejectionCount: 0,
  confidence: 0.4,
  createdAt: '2026-09-25T12:00:00.000Z',
  expiresAt: '2026-09-25T12:20:00.000Z',
};

describe('event report draft', () => {
  it('contains only searchable event metadata and the chosen reason', () => {
    const message = buildEventReportMessage(userEvent, 'WRONG_LOCATION');

    expect(message).toContain('ID: event-123');
    expect(message).toContain('Тип: ROAD_PATROL');
    expect(message).toContain('Создано: 2026-09-25T12:00:00.000Z');
    expect(message).toContain('Причина: Точка указана неверно');
    expect(message).not.toContain('identity');
  });

  it('URL-encodes the complete draft for the support chat', () => {
    const message = buildEventReportMessage(userEvent, 'OTHER_ABUSE');
    const url = buildEventReportUrl(message);

    expect(url).toMatch(/^https:\/\/t\.me\/onMapSupport\?text=/);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(message);
  });

  it('does not include Telegram source text or any author data', () => {
    const telegramEvent: TelegramRoadEvent = {
      ...userEvent,
      source: 'TELEGRAM',
      locationPrecision: 'STREET',
      sourceText: 'Личный номер 123456789, имя автора',
    };

    const message = buildEventReportMessage(telegramEvent, 'WRONG_TYPE');

    expect(message).not.toContain(telegramEvent.sourceText);
    expect(message).not.toContain('автора');
  });

  it('labels TomTom fetch time honestly instead of inventing createdAt', () => {
    const tomTomEvent: TomTomRoadEvent = {
      id: 'tomtom:incident-1',
      source: 'TOMTOM',
      cityId: 'balakovo',
      type: 'ROADWORKS',
      title: 'Работы',
      geometry: {type: 'Point', coordinates: [47.8, 52.02]},
      fetchedAt: '2026-09-25T12:05:00.000Z',
    };

    expect(buildEventReportMessage(tomTomEvent, 'DUPLICATE')).toContain(
      'Получено: 2026-09-25T12:05:00.000Z',
    );
  });
});
