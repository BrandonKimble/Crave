import {
  canonicalizeLocaleTag,
  localeLookupChain,
  lookupSupported,
  negotiateLocale,
  parseAcceptLanguage,
} from './accept-language';

describe('Accept-Language negotiation (M1)', () => {
  it('orders ranges by q-value, keeping header order on ties', () => {
    expect(parseAcceptLanguage('en;q=0.5, es, fr;q=0.8')).toEqual([
      'es',
      'fr',
      'en',
    ]);
  });

  it('treats q=0 as a REFUSAL, not a weak preference', () => {
    // The whole reason this is tested: an `es;q=0` client must NOT get es.
    expect(parseAcceptLanguage('es;q=0, en')).toEqual(['en']);
    expect(negotiateLocale({ acceptLanguage: 'es;q=0, en' })).toBe('en');
  });

  it('survives malformed headers instead of throwing', () => {
    expect(parseAcceptLanguage('es;;q=,,, ###, en')).toEqual(['es', 'en']);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });

  it('canonicalizes BCP 47 casing (R5-5 full tags)', () => {
    expect(canonicalizeLocaleTag('es-mx')).toBe('es-MX');
    expect(canonicalizeLocaleTag('ZH-hans-cn')).toBe('zh-Hans-CN');
  });

  it('RFC 4647 Lookup truncates subtags: es-MX resolves to es', () => {
    expect(lookupSupported('es-MX', ['en', 'es'])).toBe('es');
    expect(lookupSupported('es-419', ['en', 'es'])).toBe('es');
    expect(lookupSupported('de-DE', ['en', 'es'])).toBeNull();
  });

  it('prefers a declared macro-region over bare truncation', () => {
    // es-MX must reach es-419 BEFORE falling to es, when es-419 exists.
    expect(lookupSupported('es-MX', ['es', 'es-419'])).toBe('es-419');
  });

  it('the profile override beats the header, and is itself looked up', () => {
    expect(
      negotiateLocale({ acceptLanguage: 'en-US', profileLocale: 'es-MX' }),
    ).toBe('es');
    // An unsupported profile locale falls through to the header, not to a 500.
    expect(
      negotiateLocale({ acceptLanguage: 'es-ES', profileLocale: 'de' }),
    ).toBe('es');
  });

  it('defaults to English when nothing matches', () => {
    expect(negotiateLocale({ acceptLanguage: 'ja, ko;q=0.9' })).toBe('en');
    expect(negotiateLocale({})).toBe('en');
  });

  it('honours the wildcard by serving the first supported locale', () => {
    expect(negotiateLocale({ acceptLanguage: '*' })).toBe('en');
  });
});

describe('localeLookupChain — the RFC-4647 match set both SQL and TS share', () => {
  it('walks macro-region then base, always ending in und', () => {
    expect(localeLookupChain('es-MX')).toEqual([
      'es-mx',
      'es-419',
      'es',
      'und',
    ]);
    expect(localeLookupChain('es')).toEqual(['es', 'und']);
  });

  it('keeps script subtags distinct (a zh-Hans row is NOT in a zh-Hant chain)', () => {
    const chain = localeLookupChain('zh-Hant');
    expect(chain).toEqual(['zh-hant', 'zh', 'und']);
    expect(chain).not.toContain('zh-hans');
  });

  it('a null / wildcard / und request matches only universal rows', () => {
    expect(localeLookupChain(null)).toEqual(['und']);
    expect(localeLookupChain('*')).toEqual(['und']);
    expect(localeLookupChain('und')).toEqual(['und']);
  });

  it('canonicalizes casing so stored tags match case-insensitively', () => {
    expect(localeLookupChain('ES-mx')).toEqual([
      'es-mx',
      'es-419',
      'es',
      'und',
    ]);
  });
});
