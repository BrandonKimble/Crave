import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { isRateLimitExempt } from './throttler.module';

// THE BYPASS THAT WAS LIVE IN PRODUCTION (audit 2026-08-01).
//
// `skipIf` decided exemption with `url.includes('/webhooks/')` against
// Fastify's `request.url`, which carries the QUERY STRING. Appending
// `?x=/webhooks/` to any request therefore turned rate limiting off
// app-wide. Measured against live prod: 40 parallel unauthenticated POSTs to
// the Apple auth route gave 12x400 + 28x429 plain, and 40x400 with ZERO 429
// once the query param was added.
//
// These tests exist so that shape can never come back. Every case below is
// RED against a substring match and green against an exact-path match.

function requestFor(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ url }) }),
  } as unknown as ExecutionContext;
}

describe('rate-limit exemptions', () => {
  it('exempts the health probes (they must answer during an incident)', () => {
    expect(isRateLimitExempt(requestFor('/health'))).toBe(true);
    expect(isRateLimitExempt(requestFor('/health/live'))).toBe(true);
    expect(isRateLimitExempt(requestFor('/health/ready'))).toBe(true);
  });

  it('ignores the query string when deciding — THE production bypass', () => {
    expect(
      isRateLimitExempt(requestFor('/api/v1/auth/apple/native?x=/webhooks/')),
    ).toBe(false);
    expect(
      isRateLimitExempt(requestFor('/api/v1/search/natural?next=/health')),
    ).toBe(false);
    expect(
      isRateLimitExempt(
        requestFor('/api/v1/polls/query?redirect=/health/live'),
      ),
    ).toBe(false);
  });

  it('does not exempt a path that merely CONTAINS an exempt path', () => {
    expect(isRateLimitExempt(requestFor('/api/v1/health'))).toBe(false);
    expect(isRateLimitExempt(requestFor('/health/../api/v1/polls'))).toBe(
      false,
    );
    expect(isRateLimitExempt(requestFor('/nothealth'))).toBe(false);
    expect(isRateLimitExempt(requestFor('/health-check'))).toBe(false);
    expect(isRateLimitExempt(requestFor('/health/live/extra'))).toBe(false);
  });

  it('does NOT exempt the webhooks — they carry a tier now, not an exemption', () => {
    expect(
      isRateLimitExempt(requestFor('/api/v1/billing/webhooks/stripe')),
    ).toBe(false);
    expect(
      isRateLimitExempt(requestFor('/api/v1/billing/webhooks/revenuecat')),
    ).toBe(false);
    expect(
      isRateLimitExempt(requestFor('/api/v1/photos/webhooks/cloudinary')),
    ).toBe(false);
  });

  it('exempts nothing when the url is absent or empty', () => {
    expect(isRateLimitExempt(requestFor(''))).toBe(false);
    expect(
      isRateLimitExempt({
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as unknown as ExecutionContext),
    ).toBe(false);
  });
});
