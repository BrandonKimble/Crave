/**
 * The locale-resolution invariants (plan: multilingual.md M1/M7).
 *
 * These are the pure half of the locale story and the only half a hermetic node
 * test can reach — which is exactly why the resolution logic was kept free of
 * `expo-localization` and `i18next`. The two mutations these guard against are
 * real ones: a device tag we do not ship silently becoming a blank UI, and the
 * string bundle disagreeing with the `Accept-Language` header.
 */
import fs from 'fs';
import path from 'path';

import {
  TYPE,
  parse as parseIcu,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isRtlLocale,
  lookupBestMatch,
  normalizeBcp47,
  resolveFormattingLocale,
  resolveSupportedLocale,
} from './locale-resolution';

describe('normalizeBcp47', () => {
  it('canonicalizes case and the underscore form Android sometimes reports', () => {
    expect(normalizeBcp47('ES-mx')).toBe('es-MX');
    expect(normalizeBcp47('es_MX')).toBe('es-MX');
    expect(normalizeBcp47('zh-hant-tw')).toBe('zh-Hant-TW');
  });

  it('is a no-op on the empty string rather than producing a stray dash', () => {
    expect(normalizeBcp47('')).toBe('');
    expect(normalizeBcp47('   ')).toBe('');
  });
});

describe('lookupBestMatch (RFC 4647 §3.4)', () => {
  it('truncates to the base language when the region is not shipped', () => {
    expect(lookupBestMatch('es-MX')).toBe('es');
    expect(lookupBestMatch('es-419')).toBe('es');
  });

  it('prefers an exact match over a truncation', () => {
    expect(lookupBestMatch('es-MX', ['es', 'es-MX'])).toBe('es-MX');
  });

  it('drops a trailing singleton subtag with its truncation', () => {
    // `de-DE-u-co-phonebk` must never be probed as the meaningless `de-DE-u`.
    expect(lookupBestMatch('de-DE-u-co-phonebk', ['de-DE'])).toBe('de-DE');
  });

  it('returns null — not the default — when nothing in the range matches', () => {
    // The null is load-bearing: resolveSupportedLocale needs to distinguish
    // "this preference missed" from "this preference asked for English".
    expect(lookupBestMatch('ja-JP')).toBeNull();
  });
});

describe('resolveSupportedLocale', () => {
  it('takes the FIRST device preference that we ship, not merely the first', () => {
    expect(resolveSupportedLocale(['ja-JP', 'es-MX', 'en-US'])).toBe('es');
  });

  it('falls back to the default when the device shares no language with us', () => {
    expect(resolveSupportedLocale(['ja-JP', 'ko-KR'])).toBe(DEFAULT_LOCALE);
    expect(resolveSupportedLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe('resolveFormattingLocale', () => {
  it('keeps the device REGION even though strings key on the base language', () => {
    // The point of the split: `es` words, `es-MX` numbers and currency.
    expect(resolveFormattingLocale(['es-MX', 'en-US'], 'es')).toBe('es-MX');
  });

  it('drops the region when the resolved bundle is not the device language', () => {
    // German grouping around English words is worse than plain English.
    expect(resolveFormattingLocale(['de-DE'], 'en')).toBe('en');
  });
});

describe('isRtlLocale', () => {
  it('recognizes RTL languages with or without a region', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('he-IL')).toBe(true);
    expect(isRtlLocale('es-MX')).toBe(false);
  });
});

describe('the locale catalog', () => {
  const localesDir = path.join(__dirname, 'locales');

  const flatten = (value: unknown, prefix = ''): string[] => {
    if (typeof value !== 'object' || value === null) {
      return [prefix];
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key)
    );
  };

  const readBundle = (locale: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), 'utf8'));

  it('ships a bundle for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(fs.existsSync(path.join(localesDir, `${locale}.json`))).toBe(true);
    }
  });

  it('gives every locale the SAME key set as the source language', () => {
    // A key present in en.json and missing from es.json renders English inside
    // a Spanish screen — a defect no type or render test in this repo catches,
    // because i18next's fallback makes it look like success.
    const sourceKeys = flatten(readBundle(DEFAULT_LOCALE)).sort();
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === DEFAULT_LOCALE) {
        continue;
      }
      expect(flatten(readBundle(locale)).sort()).toEqual(sourceKeys);
    }
  });

  it('keeps the ICU placeholders of every message identical across locales', () => {
    // A translator who drops `{city}` produces a sentence with a hole in it and
    // no error anywhere. Compare the placeholder SETS, not the prose.
    //
    // Parsed with the real ICU parser rather than a regex: a regex over `{...}`
    // also captures the TEXT inside plural branches (`{See all # dishes}`), so
    // it reports a false mismatch on every correctly translated plural — which
    // is precisely the message shape most worth guarding. Parsing also means a
    // syntactically broken message fails the test instead of rendering as a raw
    // key on a user's screen.
    const collectArguments = (elements: MessageFormatElement[], into: Set<string>): void => {
      for (const element of elements) {
        // Literals carry prose in `.value`; every other element type carries an
        // ARGUMENT NAME there. `pound` (`#`) carries nothing.
        if (element.type !== TYPE.literal && element.type !== TYPE.pound) {
          into.add(element.value);
        }
        if ('options' in element) {
          for (const option of Object.values(element.options)) {
            collectArguments(option.value, into);
          }
        }
      }
    };

    const placeholdersOf = (message: string) => {
      const found = new Set<string>();
      collectArguments(parseIcu(message), found);
      return found;
    };

    const source = readBundle(DEFAULT_LOCALE);
    const sourceEntries = new Map(
      flatten(source).map((key) => [
        key,
        key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], source),
      ])
    );

    for (const locale of SUPPORTED_LOCALES) {
      if (locale === DEFAULT_LOCALE) {
        continue;
      }
      const bundle = readBundle(locale);
      for (const [key, sourceMessage] of sourceEntries) {
        const translated = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], bundle);
        expect(typeof translated).toBe('string');
        expect({ key, placeholders: [...placeholdersOf(translated as string)].sort() }).toEqual({
          key,
          placeholders: [...placeholdersOf(sourceMessage as string)].sort(),
        });
      }
    }
  });

  it('imports plural-rules locale data for every supported locale', () => {
    // The polyfill silently applies ENGLISH plural categories to a locale whose
    // data was never imported — which is invisible in es (same one/other
    // categories) and catastrophic in, say, Polish. Pin the two lists together.
    const polyfills = fs.readFileSync(path.join(__dirname, 'polyfills.ts'), 'utf8');
    for (const locale of SUPPORTED_LOCALES) {
      expect(polyfills).toContain(`@formatjs/intl-pluralrules/locale-data/${locale}`);
    }
  });
});
