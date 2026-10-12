export type PushTarget = {
  kind: 'ROAD_EVENT' | 'PARTNER_POINT';
  targetId: string;
  cityId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const pushTargetUrl = (target: PushTarget): string =>
  `onmap://open/${target.kind.toLowerCase()}/${target.targetId}?cityId=${encodeURIComponent(target.cityId)}`;

export const parsePushDeepLink = (url: string): PushTarget | null => {
  const match = /^onmap:\/\/open\/(road_event|partner_point)\/([0-9a-f-]{36})\?cityId=([a-z0-9_-]{1,64})$/iu.exec(url);
  if (!match || !UUID.test(match[2])) return null;
  return {
    kind: match[1].toUpperCase() as PushTarget['kind'],
    targetId: match[2],
    cityId: match[3],
  };
};
