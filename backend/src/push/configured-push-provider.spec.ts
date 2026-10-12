import { ConfiguredPushProvider } from './configured-push-provider';

describe('ConfiguredPushProvider', () => {
  it('is inert without an explicit delivery flag and does not read credential files', async () => {
    const previousEnabled = process.env.PUSH_DELIVERY_ENABLED;
    const previousPath = process.env.APNS_PRIVATE_KEY_FILE;
    process.env.PUSH_DELIVERY_ENABLED = 'false';
    process.env.APNS_PRIVATE_KEY_FILE = '/not/a/real/key';
    try {
      const provider = new ConfiguredPushProvider();
      expect(provider.ready).toBe(false);
      expect(
        await provider.send({
          provider: 'APNS',
          token: 'fake-token',
          collapseKey: 'road:test',
          title: 'Test',
          body: 'Test',
          data: { kind: 'ROAD_EVENT', targetId: 'event', cityId: 'balakovo' },
        }),
      ).toEqual({ status: 'RETRY', code: 'PROVIDER_NOT_CONFIGURED' });
    } finally {
      if (previousEnabled === undefined)
        delete process.env.PUSH_DELIVERY_ENABLED;
      else process.env.PUSH_DELIVERY_ENABLED = previousEnabled;
      if (previousPath === undefined) delete process.env.APNS_PRIVATE_KEY_FILE;
      else process.env.APNS_PRIVATE_KEY_FILE = previousPath;
    }
  });
});
