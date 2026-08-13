import {
  canonicalizeLocaleTag,
  localeLookupChain,
  bankableLanguageTag,
  normalizeLocaleTag,
  lookupSupported,
  negotiateLocale,
  parseAcceptLanguage,
  primaryLanguageSubtag,
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

describe('normalizeLocaleTag — validate + canonicalize at the write ingress', () => {
  it('canonicalizes casing', () => {
    expect(normalizeLocaleTag('ES')).toBe('es');
    expect(normalizeLocaleTag('pt-br')).toBe('pt-BR');
    expect(normalizeLocaleTag('zh-hant')).toBe('zh-Hant');
  });
  it('rejects malformed tags to und (never free text)', () => {
    for (const bad of ['es_MX', 'xxxxxxxxxxxxxxxxxxxx', '', 'e', '*', '  ']) {
      expect(normalizeLocaleTag(bad)).toBe('und');
    }
  });
  it('keeps und and well-formed-but-unregistered tags', () => {
    expect(normalizeLocaleTag('und')).toBe('und');
    expect(normalizeLocaleTag(null)).toBe('und');
    expect(normalizeLocaleTag('es-419')).toBe('es-419');
  });
});

describe('bankableLanguageTag — the tag a claim about a WORD may carry', () => {
  it('drops the region, because the lookup chain cannot reach it', () => {
    // THE MEASURED DEFECT (A0 R4): the poll seed banked Google's raw
    // `zh-TW`, and localeLookupChain('zh') is ['zh','und'] — it does not
    // contain 'zh-tw'. The row we paid Google for was invisible to every
    // Chinese reader who did not ask with that exact region.
    expect(bankableLanguageTag('zh-TW')).toBe('zh');
    expect(localeLookupChain('zh')).not.toContain('zh-tw');
    expect(localeLookupChain('zh')).toContain(bankableLanguageTag('zh-TW'));

    expect(bankableLanguageTag('es-MX')).toBe('es');
    expect(bankableLanguageTag('pt-BR')).toBe('pt');
    expect(bankableLanguageTag('en-US')).toBe('en');
    // A script subtag goes too — 'zh' IS in localeLookupChain('zh-Hant'),
    // so the row stays reachable from the more specific request.
    expect(bankableLanguageTag('zh-Hant')).toBe('zh');
    expect(localeLookupChain('zh-Hant')).toContain('zh');
  });

  it('normalizes BEFORE splitting — a malformed tag banks nothing', () => {
    // The predecessor lowercased and split on [-_], so 'es_MX' yielded 'es':
    // a language nobody validated, inferred from a string that is not a tag.
    expect(bankableLanguageTag('es_MX')).toBeUndefined();
    expect(bankableLanguageTag('not a locale')).toBeUndefined();
    expect(bankableLanguageTag('und')).toBeUndefined();
    expect(bankableLanguageTag('')).toBeUndefined();
    expect(bankableLanguageTag(null)).toBeUndefined();
    expect(bankableLanguageTag(undefined)).toBeUndefined();
    // Casing is canonicalized, not rejected.
    expect(bankableLanguageTag('ES')).toBe('es');
    expect(bankableLanguageTag('  vi  ')).toBe('vi');
  });
});

/**
 * THE DISPLAY PATHS' LANGUAGE KEY (H2 residue, 2026-08-12). Three sites —
 * the label-row prefix band, the message catalogue, and the title-casing
 * convention — each hand-rolled `locale.split('-')[0].toLowerCase()`. These
 * cases pin EQUIVALENCE for every input those sites see today, and pin the
 * one place the module deliberately differs: a malformed tag.
 */
describe('primaryLanguageSubtag — the module owns the truncation', () => {
  it('is byte-identical to the retired split for every well-formed input', () => {
    const split = (locale: string, fallback = 'en') =>
      (locale || fallback).split('-')[0].toLowerCase();
    for (const tag of [
      'en',
      'es',
      'vi',
      'zh',
      'es-MX',
      'es-419',
      'zh-Hans',
      'zh-Hant',
      'pt-BR',
      'EN-us',
      'ES',
    ]) {
      expect(primaryLanguageSubtag(tag)).toBe(split(tag));
    }
  });

  it('falls back exactly where the split did — empty, null, undefined', () => {
    expect(primaryLanguageSubtag('')).toBe('en');
    expect(primaryLanguageSubtag(null)).toBe('en');
    expect(primaryLanguageSubtag(undefined)).toBe('en');
    expect(primaryLanguageSubtag('', 'es')).toBe('es');
  });

  it('a MALFORMED tag lands on the fallback, not on a language nobody parsed', () => {
    // The split read 'es_MX' as the language 'es_mx' and then filtered label
    // rows on a prefix nothing can match: an English fallback with no visible
    // cause. Same floor as every other locale write — see normalizeLocaleTag.
    expect(primaryLanguageSubtag('es_MX')).toBe('en');
    expect(primaryLanguageSubtag('not a locale')).toBe('en');
    expect(primaryLanguageSubtag('und')).toBe('en');
  });
});
