import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface AnonymousIdentityPayload {
  type: 'anonymous';

  sub: string;
}

export interface AnonymousIdentityToken {
  token: string;
}

@Injectable()
export class IdentityService {
  private readonly signingSecret: Buffer;

  constructor(configService: ConfigService) {
    this.signingSecret = Buffer.from(
      configService.getOrThrow<string>('IDENTITY_SIGNING_SECRET'),
      'utf8',
    );
  }

  issueAnonymousIdentity(): AnonymousIdentityToken {
    const payload: AnonymousIdentityPayload = {
      type: 'anonymous',
      sub: randomUUID(),
    };

    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');

    const signingInput = `${TOKEN_VERSION}.${encodedPayload}`;

    return {
      token: `${signingInput}.${this.sign(signingInput)}`,
    };
  }

  verifyAnonymousIdentity(token: string): string {
    const [version, encodedPayload, encodedSignature, extraPart] =
      token.split('.');

    if (
      version !== TOKEN_VERSION ||
      !encodedPayload ||
      !encodedSignature ||
      extraPart !== undefined ||
      !SIGNATURE_PATTERN.test(encodedSignature)
    ) {
      throw this.invalidToken();
    }

    const signingInput = `${version}.${encodedPayload}`;
    const expectedSignature = Buffer.from(this.sign(signingInput), 'base64url');
    const receivedSignature = Buffer.from(encodedSignature, 'base64url');

    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw this.invalidToken();
    }

    let payload: unknown;

    try {
      const payloadBuffer = Buffer.from(encodedPayload, 'base64url');

      if (payloadBuffer.toString('base64url') !== encodedPayload) {
        throw new Error('Non-canonical payload encoding');
      }

      payload = JSON.parse(payloadBuffer.toString('utf8')) as unknown;
    } catch {
      throw this.invalidToken();
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('type' in payload) ||
      payload.type !== 'anonymous' ||
      !('sub' in payload) ||
      typeof payload.sub !== 'string' ||
      !UUID_V4_PATTERN.test(payload.sub)
    ) {
      throw this.invalidToken();
    }

    return payload.sub;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingSecret)
      .update(value, 'utf8')
      .digest('base64url');
  }

  private invalidToken() {
    return new UnauthorizedException('Invalid anonymous identity token');
  }
}
