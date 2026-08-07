/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

/**
 * F9315 (owner-ruled 2026-08-07): PII VALUES are scrubbed from log/error
 * payloads; the internal userId is deliberately KEPT as the debug handle, and
 * already-hashed audit fields (`ip_hash`, `subnetHash`) stay joinable.
 */
describe('redaction — PII vocabulary (F9315)', () => {
  it('scrubs PII while KEEPING the hashed audit field and the debug handle', () => {
    const redacted = redactSensitiveDeep({
      email: 'a@b.com',
      phone: '555',
      ip_hash: 'abc',
      userId: 'u1',
    }) as any;

    expect(redacted.email).toBe('[REDACTED]');
    expect(redacted.phone).toBe('[REDACTED]');
    expect(redacted.ip_hash).toBe('abc');
    expect(redacted.userId).toBe('u1');
  });

  it('matches PII across snake_case, camelCase and casing variants', () => {
    for (const key of [
      'email',
      'e_mail',
      'emailAddress',
      'phone',
      'phone_number',
      'phoneNumber',
      'mobile',
      'address',
      'home_address',
      'street',
      'streetAddress',
      'dob',
      'DOB',
      'date_of_birth',
      'dateOfBirth',
      'birthdate',
      'first_name',
      'firstName',
      'last_name',
      'lastName',
      'full_name',
      'real_name',
      'display_name',
      'ip',
      'IP',
      'client_ip',
      'remoteIp',
    ]) {
      expect([key, isSensitiveKey(key)]).toEqual([key, true]);
    }
  });

  it('never redacts an ALREADY-HASHED field — those are the joinable audit keys', () => {
    for (const key of [
      'ip_hash',
      'ipHash',
      'subnet_hash',
      'subnetHash',
      'email_hash',
      'emailHmac',
      'phone_hmac',
    ]) {
      expect([key, isSensitiveKey(key)]).toEqual([key, false]);
    }
    // …but a credential-shaped hash keeps redacting: losing it costs nothing.
    expect(isSensitiveKey('passwordHash')).toBe(true);
  });

  it('keeps ids — an id names a row, PII names a person', () => {
    for (const key of [
      'userId',
      'user_id',
      'actorId',
      'actor_id',
      'entityId',
    ]) {
      expect([key, isSensitiveKey(key)]).toEqual([key, false]);
    }
  });

  it('does not over-match: short needles are whole-key only, coords pass through', () => {
    for (const key of [
      'description', // contains "ip"
      'zip',
      'recipeId',
      'multiplier',
      'latitude',
      'longitude',
      'lat',
      'lng',
      'name', // restaurant/dish/city names are not person names
      'restaurantName',
    ]) {
      expect([key, isSensitiveKey(key)]).toEqual([key, false]);
    }
  });
});
