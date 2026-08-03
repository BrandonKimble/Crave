import {
  carriesMonthlyQuotaShape,
  isVendorMonthlyCapError,
  vendorCapDetectorLooksRotted,
} from './vendor-cap-detector';

/**
 * F118 / D12. The monthly-cap poison hangs off a substring of Google's prose
 * — there is no structured signal, so the match stays. What did not exist
 * before was any way for its ROT to show RED. These specs pin both halves:
 * the shape of the real vendor message, and the contradiction detector.
 */
describe('isVendorMonthlyCapError (fixture: the real Google 429 prose)', () => {
  // The live message shape — the whole reason the substring exists.
  const REAL_CAP_MESSAGE =
    'got status: 429 RESOURCE_EXHAUSTED. {"error":{"code":429,"message":' +
    '"You exceeded your current quota. Please check your monthly spending ' +
    'cap in AI Studio.","status":"RESOURCE_EXHAUSTED"}}';

  it('fires on the vendor monthly-cap 429', () => {
    expect(isVendorMonthlyCapError(REAL_CAP_MESSAGE)).toBe(true);
  });

  it('does NOT fire on an ordinary per-minute 429 (a transient the poison must not eat)', () => {
    const rpm429 =
      'got status: 429 RESOURCE_EXHAUSTED. {"error":{"code":429,"message":' +
      '"Quota exceeded for quota metric \'Generate Content API requests per ' +
      'minute\'","status":"RESOURCE_EXHAUSTED"}}';
    expect(isVendorMonthlyCapError(rpm429)).toBe(false);
  });

  it('THE ROT CASE: a reworded cap message stops firing — which is exactly why the alert below exists', () => {
    const reworded =
      'You have reached your monthly billing limit for this project.';
    expect(isVendorMonthlyCapError(reworded)).toBe(false);
  });
});

describe('carriesMonthlyQuotaShape (structural, not prose)', () => {
  it('recognises month-grained quota metrics', () => {
    expect(
      carriesMonthlyQuotaShape([
        'generativelanguage.googleapis.com/generate_content_requests_per_month',
      ]),
    ).toBe(true);
    expect(carriesMonthlyQuotaShape([undefined, 'Monthly spend cap'])).toBe(
      true,
    );
  });

  it('ignores the transient grains — per-minute and per-day are ordinary rate limits', () => {
    expect(
      carriesMonthlyQuotaShape([
        'generativelanguage.googleapis.com/generate_content_requests_per_minute',
      ]),
    ).toBe(false);
    expect(
      carriesMonthlyQuotaShape([
        'generativelanguage.googleapis.com/generate_requests_per_day',
      ]),
    ).toBe(false);
    expect(carriesMonthlyQuotaShape([undefined, undefined])).toBe(false);
  });
});

describe('vendorCapDetectorLooksRotted (the detector for the detector)', () => {
  it('ALERTS on the contradiction: month-scoped payload, prose match silent', () => {
    expect(
      vendorCapDetectorLooksRotted({
        errorMessage: 'You have reached your monthly billing limit.',
        quotaMetric:
          'generativelanguage.googleapis.com/generate_content_requests_per_month',
      }),
    ).toBe(true);
  });

  it('stays silent when the prose match DID fire — the pool is already poisoned', () => {
    expect(
      vendorCapDetectorLooksRotted({
        errorMessage: 'Please check your monthly spending cap in AI Studio.',
        quotaMetric:
          'generativelanguage.googleapis.com/generate_content_requests_per_month',
      }),
    ).toBe(false);
  });

  it('stays silent on an ordinary per-minute 429 — no contradiction, nothing to report', () => {
    expect(
      vendorCapDetectorLooksRotted({
        errorMessage: "Quota exceeded for quota metric 'requests per minute'",
        quotaMetric:
          'generativelanguage.googleapis.com/generate_content_requests_per_minute',
      }),
    ).toBe(false);
  });

  it('fires on FIRST occurrence — there is no consecutive-failure threshold to wait out', () => {
    const once = vendorCapDetectorLooksRotted({
      errorMessage: 'monthly billing limit reached',
      providerMessage: 'Quota exceeded: generate_content_tokens_per_month',
    });
    expect(once).toBe(true);
  });
});
