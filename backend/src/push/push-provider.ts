export interface PushMessage {
  provider: 'APNS' | 'FCM';
  token: string;
  collapseKey: string;
  title: string;
  body: string;
  data: {
    kind: 'ROAD_EVENT' | 'PARTNER_POINT';
    targetId: string;
    cityId: string;
  };
}

export type PushSendResult =
  | { status: 'SENT' }
  | { status: 'INVALID_TOKEN' }
  | { status: 'RETRY'; code: string };

export interface PushProvider {
  readonly ready: boolean;
  send(message: PushMessage): Promise<PushSendResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export class DisabledPushProvider implements PushProvider {
  readonly ready = false;
  send(): Promise<PushSendResult> {
    return Promise.resolve({
      status: 'RETRY',
      code: 'PROVIDER_NOT_CONFIGURED',
    });
  }
}

/** Local-only adapter. Never wired into production by default. */
export class RecordingPushProvider implements PushProvider {
  readonly ready = true;
  readonly messages: PushMessage[] = [];
  send(message: PushMessage): Promise<PushSendResult> {
    this.messages.push(message);
    return Promise.resolve({ status: 'SENT' });
  }
}
