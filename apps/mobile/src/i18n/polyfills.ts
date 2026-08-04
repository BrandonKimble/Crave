/**
 * Intl polyfills for Hermes (plan: multilingual.md R5-9).
 *
 * Hermes ships a partial Intl: `Intl.NumberFormat` / `Intl.DateTimeFormat` /
 * `Intl.Collator` exist (ICU-backed on iOS), but `Intl.PluralRules` and
 * `Intl.Segmenter` DO NOT. ICU MessageFormat `{count, plural, ...}` — the whole
 * reason we chose i18next-icu — resolves its plural category through
 * `Intl.PluralRules`, so without this file every plural string throws at render
 * time in a release build, on device only, in whichever language you did not
 * test. Hence: polyfill unconditionally, imported before i18next initializes.
 *
 * `Intl.getCanonicalLocales` is a dependency of the plural-rules polyfill's own
 * locale resolution and is likewise absent, so it is loaded first.
 *
 * NOT polyfilled, deliberately: `Intl.Segmenter`. R5-9 declares segmentation
 * (ja/zh/th word breaking, M6) SERVER-SIDE. Adding `unicode-segmenter` here
 * would be a client capability with no consumer.
 */

// Order matters: getCanonicalLocales must exist before intl-pluralrules loads.
import '@formatjs/intl-getcanonicallocales/polyfill';
import '@formatjs/intl-pluralrules/polyfill';

// One locale-data import per supported locale. Adding a locale to
// SUPPORTED_LOCALES (locale-resolution.ts) without adding its plural data here
// makes that locale fall back to the polyfill's default rules — English's —
// which is silently wrong for e.g. Polish or Arabic. The locale-catalog spec
// asserts the two lists agree.
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/es';
