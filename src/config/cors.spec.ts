import { getCorsOrigin } from './cors';

describe('getCorsOrigin', () => {
  it('does not allow every origin in production when CORS_ORIGIN is unset', () => {
    expect(getCorsOrigin(undefined, 'production')).toBe(false);
  });

  it('parses a comma-separated CORS_ORIGIN allowlist', () => {
    expect(getCorsOrigin('https://app.example.test, https://admin.example.test', 'production')).toEqual([
      'https://app.example.test',
      'https://admin.example.test',
    ]);
  });
});
