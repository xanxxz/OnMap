import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
} from './push-provider';

type ApnsConfig = {
  teamId: string;
  keyId: string;
  topic: string;
  privateKey: string;
  host: 'api.push.apple.com' | 'api.sandbox.push.apple.com';
};

type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

const nonempty = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const readApns = (): ApnsConfig | null => {
  const {
    APNS_TEAM_ID,
    APNS_KEY_ID,
    APNS_BUNDLE_ID,
    APNS_PRIVATE_KEY_FILE,
    APNS_ENVIRONMENT,
  } = process.env;
  if (
    ![APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY_FILE].every(
      nonempty,
    )
  )
    return null;
  if (APNS_ENVIRONMENT !== 'production' && APNS_ENVIRONMENT !== 'sandbox')
    return null;
  const privateKey = readFileSync(APNS_PRIVATE_KEY_FILE!, 'utf8');
  createPrivateKey(privateKey);
  return {
    teamId: APNS_TEAM_ID!,
    keyId: APNS_KEY_ID!,
    topic: APNS_BUNDLE_ID!,
    privateKey,
    host:
      APNS_ENVIRONMENT === 'production'
        ? 'api.push.apple.com'
        : 'api.sandbox.push.apple.com',
  };
};

const readFcm = (): FcmConfig | null => {
  const path = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (!nonempty(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object')
    throw new Error('Invalid FCM service account file');
  const record = parsed as Record<string, unknown>;
  if (
    !nonempty(record.project_id as string) ||
    !nonempty(record.client_email as string) ||
    !nonempty(record.private_key as string)
  )
    throw new Error('Incomplete FCM service account file');
  createPrivateKey(record.private_key as string);
  return {
    projectId: record.project_id as string,
    clientEmail: record.client_email as string,
    privateKey: record.private_key as string,
  };
};

const jwt = (
  header: object,
  claims: object,
  key: string,
  algorithm: 'ES256' | 'RS256',
) => {
  const content = [header, claims]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  const signature = sign('sha256', Buffer.from(content), {
    key,
    ...(algorithm === 'ES256' ? { dsaEncoding: 'ieee-p1363' as const } : {}),
  });
  return `${content}.${signature.toString('base64url')}`;
};

const sendApns = (
  config: ApnsConfig,
  message: PushMessage,
): Promise<PushSendResult> =>
  new Promise((resolve) => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const bearer = jwt(
      { alg: 'ES256', kid: config.keyId },
      { iss: config.teamId, iat: issuedAt },
      config.privateKey,
      'ES256',
    );
    const client = connect(`https://${config.host}`);
    let completed = false;
    const timeout = setTimeout(
      () => finish({ status: 'RETRY', code: 'TIMEOUT' }),
      10_000,
    );
    const finish = (result: PushSendResult) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      client.destroy();
      resolve(result);
    };
    client.on('error', () =>
      finish({ status: 'RETRY', code: 'NETWORK_ERROR' }),
    );
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${encodeURIComponent(message.token)}`,
      authorization: `bearer ${bearer}`,
      'apns-topic': config.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-collapse-id': message.collapseKey,
      'content-type': 'application/json',
    });
    let status = 0;
    let response = '';
    request.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    request.on('data', (chunk) => {
      if (response.length < 1024) response += String(chunk);
    });
    request.on('end', () => {
      if (status === 200) return finish({ status: 'SENT' });
      let reason = '';
      try {
        reason = String(
          (JSON.parse(response) as { reason?: string }).reason ?? '',
        );
      } catch {
        /* response may not be JSON */
      }
      if (
        status === 410 ||
        ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(
          reason,
        )
      )
        return finish({ status: 'INVALID_TOKEN' });
      finish({
        status: 'RETRY',
        code:
          status >= 500 || status === 429
            ? 'PROVIDER_UNAVAILABLE'
            : 'PROVIDER_REJECTED',
      });
    });
    request.on('error', () =>
      finish({ status: 'RETRY', code: 'NETWORK_ERROR' }),
    );
    request.end(
      JSON.stringify({
        aps: {
          alert: { title: message.title, body: message.body },
          sound: 'default',
        },
        ...message.data,
      }),
    );
  });

const sendFcm = async (
  config: FcmConfig,
  message: PushMessage,
): Promise<PushSendResult> => {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    config.privateKey,
    'RS256',
  );
  const oauth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!oauth.ok) return { status: 'RETRY', code: 'AUTH_UNAVAILABLE' };
  const auth = (await oauth.json()) as { access_token?: string };
  if (!auth.access_token) return { status: 'RETRY', code: 'AUTH_UNAVAILABLE' };
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.access_token}`,
      },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: { collapse_key: message.collapseKey },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok) return { status: 'SENT' };
  const error = (await response.json().catch(() => null)) as {
    error?: { details?: Array<{ errorCode?: string }> };
  } | null;
  const code = error?.error?.details?.find((item) => item.errorCode)?.errorCode;
  if (code === 'UNREGISTERED') return { status: 'INVALID_TOKEN' };
  return {
    status: 'RETRY',
    code:
      response.status >= 500 || response.status === 429
        ? 'PROVIDER_UNAVAILABLE'
        : 'PROVIDER_REJECTED',
  };
};

export class ConfiguredPushProvider implements PushProvider {
  private readonly apns: ApnsConfig | null;
  private readonly fcm: FcmConfig | null;
  readonly ready: boolean;

  constructor() {
    // Existing deployments are unchanged until delivery is explicitly enabled.
    const enabled = process.env.PUSH_DELIVERY_ENABLED === 'true';
    this.apns = enabled ? readApns() : null;
    this.fcm = enabled ? readFcm() : null;
    this.ready = this.apns !== null || this.fcm !== null;
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    try {
      if (message.provider === 'APNS' && this.apns)
        return await sendApns(this.apns, message);
      if (message.provider === 'FCM' && this.fcm)
        return await sendFcm(this.fcm, message);
      return { status: 'RETRY', code: 'PROVIDER_NOT_CONFIGURED' };
    } catch {
      return { status: 'RETRY', code: 'NETWORK_ERROR' };
    }
  }
}
