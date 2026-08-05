import { isSensitiveKey, redactSensitiveDeep } from './redaction';

/**
 * F416 lockdown: redaction was exact-key-match only (so apiKey/accessToken/
 * clientSecret passed through) and non-recursive (so a nested credential in
 * a logged request body leaked). This proves both are fixed.
 */
describe('redaction (F416)', () => {
  it('catches non-exact spellings that an exact-match denylist would miss', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('clientSecret')).toBe(true);
    expect(isSensitiveKey('webhookSecret')).toBe(true);
    expect(isSensitiveKey('sessionId')).toBe(true);
    expect(isSensitiveKey('Authorization')).toBe(true);
  });

  it('redacts a NESTED credential, not just a top-level one', () => {
    const body = {
      user: { name: 'a', credentials: { apiKey: 'sk-live-abc123' } },
    };
    const redacted = redactSensitiveDeep(body) as any;
    expect(redacted.user.credentials.apiKey).toBe('[REDACTED]');
    expect(redacted.user.name).toBe('a');
  });

  it('redacts inside arrays too', () => {
    const body = { items: [{ secret: 'x' }, { fine: 'y' }] };
    const redacted = redactSensitiveDeep(body) as any;
    expect(redacted.items[0].secret).toBe('[REDACTED]');
    expect(redacted.items[1].fine).toBe('y');
  });
});
