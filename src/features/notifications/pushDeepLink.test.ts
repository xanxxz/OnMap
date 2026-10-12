import {parsePushDeepLink, pushTargetUrl} from './pushDeepLink';

const id = 'c54d405d-d951-46f1-9ecb-52a90b3022f2';

test.each(['ROAD_EVENT', 'PARTNER_POINT'] as const)('%s deep link survives cold/warm URL handoff', kind => {
  const target = {kind, targetId: id, cityId: 'balakovo'};
  expect(parsePushDeepLink(pushTargetUrl(target))).toEqual(target);
});

test('rejects malformed or untrusted targets', () => {
  expect(parsePushDeepLink('https://example.com/open/road_event/' + id)).toBeNull();
  expect(parsePushDeepLink('onmap://open/road_event/../../?cityId=balakovo')).toBeNull();
});
