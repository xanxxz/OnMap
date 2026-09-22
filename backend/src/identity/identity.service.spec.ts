import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AnonymousIdentityGuard } from './anonymous-identity.guard';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

const TEST_SIGNING_SECRET = 'test-only-identity-signing-secret-32-characters';

describe('anonymous identity', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(TEST_SIGNING_SECRET),
  };

  const identityService = new IdentityService(
    configService as unknown as ConfigService,
  );
  const controller = new IdentityController(identityService);
  const guard = new AnonymousIdentityGuard(identityService);

  const createContext = (authorization?: string) => {
    const request: {
      headers: { authorization?: string };
      anonymousIdentityId?: string;
    } = {
      headers: authorization ? { authorization } : {},
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  };

  it('issues an anonymous identity from the endpoint', () => {
    const response = controller.createAnonymousIdentity();

    expect(Object.keys(response)).toEqual(['token']);
    expect(response.token).toEqual(expect.any(String));
    expect(identityService.verifyAnonymousIdentity(response.token)).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it('accepts a valid Bearer token', () => {
    const { token } = identityService.issueAnonymousIdentity();
    const expectedIdentityId = identityService.verifyAnonymousIdentity(token);
    const { context, request } = createContext(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.anonymousIdentityId).toBe(expectedIdentityId);
  });

  it.each(['payload', 'signature'] as const)(
    'rejects a token with a changed %s',
    (part) => {
      const { token } = identityService.issueAnonymousIdentity();
      const [version, encodedPayload, signature] = token.split('.');

      if (!version || !encodedPayload || !signature) {
        throw new Error('Issued token has an invalid test format');
      }

      const tamperedToken =
        part === 'payload'
          ? [
              version,
              Buffer.from(
                JSON.stringify({
                  type: 'anonymous',
                  sub: '00000000-0000-4000-8000-000000000099',
                }),
                'utf8',
              ).toString('base64url'),
              signature,
            ].join('.')
          : [
              version,
              encodedPayload,
              `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`,
            ].join('.');

      const { context } = createContext(`Bearer ${tamperedToken}`);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid anonymous identity token',
      );
    },
  );

  it('rejects a request without an identity token', () => {
    const { context } = createContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(
      'Anonymous identity token is required',
    );
  });
});
