import { isAllowedOrigin, parseAllowedOrigins } from './allowed-origins';

describe('CORS allowed origins', () => {
  it('parses a normalized explicit allowlist', () => {
    expect(
      parseAllowedOrigins(
        'https://app.onmap.example, https://admin.onmap.example',
      ),
    ).toEqual(['https://app.onmap.example', 'https://admin.onmap.example']);
  });

  it('allows native requests without Origin and exact configured origins only', () => {
    const allowed = parseAllowedOrigins('https://app.onmap.example');
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin('https://app.onmap.example', allowed)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', allowed)).toBe(false);
  });

  it('rejects wildcard, paths, and non-http schemes', () => {
    for (const value of ['*', 'https://app.example/path', 'capacitor://app']) {
      expect(() => parseAllowedOrigins(value)).toThrow('CORS_ALLOWED_ORIGINS');
    }
  });
});
