import type { RoadEventRealtimePayload } from '../road-events.types';

import { RoadEventsGateway } from './road-events.gateway';

const event: RoadEventRealtimePayload = {
  id: 'event-1',
  source: 'TELEGRAM',
  cityId: 'balakovo',
  type: 'ACCIDENT',
  status: 'ACTIVE',
  title: 'ДТП',
  coordinate: [47.8, 52.02],
  confirmationCount: 0,
  rejectionCount: 0,
  confidence: 0.9,
  createdAt: '2026-08-31T08:00:00.000Z',
  expiresAt: '2026-08-31T10:00:00.000Z',
};

const setup = () => {
  const emitMock = jest.fn();
  const toMock = jest.fn().mockReturnValue({ emit: emitMock });
  const gateway = new RoadEventsGateway();

  (
    gateway as unknown as {
      server: { to: typeof toMock };
    }
  ).server = { to: toMock };

  return { gateway, emitMock, toMock };
};

describe('RoadEventsGateway city broadcasts', () => {
  it.each([
    ['road-event:created', 'broadcastCreated'],
    ['road-event:updated', 'broadcastUpdated'],
  ] as const)('emits %s only to the event city room', (eventName, method) => {
    const { gateway, emitMock, toMock } = setup();

    gateway[method](event);

    expect(toMock).toHaveBeenCalledWith('road-events:balakovo');
    expect(emitMock).toHaveBeenCalledWith(eventName, event);
  });

  it('emits resolved through the existing city room contract', () => {
    const { gateway, emitMock, toMock } = setup();
    const payload = {
      id: 'event-1',
      cityId: 'balakovo',
      resolvedAt: '2026-08-31T08:10:00.000Z',
    };

    gateway.broadcastResolved(payload);

    expect(toMock).toHaveBeenCalledWith('road-events:balakovo');
    expect(emitMock).toHaveBeenCalledWith('road-event:resolved', payload);
  });

  it('uses a synthetic city room without a Balakovo fallback', () => {
    const { gateway, toMock } = setup();

    gateway.broadcastCreated({ ...event, cityId: 'test-city' });

    expect(toMock).toHaveBeenCalledWith('road-events:test-city');
    expect(toMock).not.toHaveBeenCalledWith('road-events:balakovo');
  });
});
