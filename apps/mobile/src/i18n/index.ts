/**
 * i18n bootstrap (plan: multilingual.md M7, modernized by R5-8).
 *
 * Stack, and why each piece:
 *   react-i18next  — the `useTranslation()` hook layer; re-renders on locale change.
 *   i18next-icu    — ICU MessageFormat 1. Plurals/selects/number+date formats live
 *                    INSIDE the message, which is the only way a translator can
 *                    reorder or re-inflect a sentence without a code change.
 *                    MessageFormat 2 is a deliberate 2027+ deferral (R5-8):
 *                    TC39 Stage 2, ~zero runtime adoption.
 *   expo-localization — the device's ordered locale preferences (via ./current-locale).
 *   @formatjs polyfills — see ./polyfills.
 *
 * IMPORT ORDER IS LOAD-BEARING. This module must be imported before the first
 * component renders (App.tsx does it near the top), and ./polyfills must be the
 * first import here — i18next-icu builds its formatters at init and reaches for
 * `Intl.PluralRules` while doing so.
 */
import './polyfills';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';

import en from './locales/en.json';
import es from './locales/es.json';
import { commitRequestedLocale, getCurrentBundleLocale, getCurrentLocale } from './current-locale';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isRtlLocale } from './locale-resolution';

export { getCurrentBundleLocale, getCurrentLocale } from './current-locale';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isRtlLocale,
  lookupBestMatch,
  normalizeBcp47,
  resolveFormattingLocale,
  resolveSupportedLocale,
  type SupportedLocale,
} from './locale-resolution';

/**
 * RTL WIRING POINT — intentionally inert (M7 scope here is "RTL prep only").
 *
 * When the first RTL locale (ar/he) joins SUPPORTED_LOCALES, this is the one
 * place that flips layout direction. It stays OFF because `I18nManager.forceRTL`
 * takes effect only after a full app RELOAD: enabling it before the ~800
 * physical-style sites become logical properties would ship a visibly broken
 * mirrored layout to every RTL-device user, with no RTL locale to justify it.
 * Uncomment together with that conversion, not before.
 *
 *   import { I18nManager } from 'react-native';
 *   import * as Updates from 'expo-updates';
 */
const applyLayoutDirection = (locale: string): void => {
  // The read is kept live so the RTL predicate stays exercised and honest;
  // only the mutation is parked.
  void isRtlLocale(locale);
  // if (I18nManager.isRTL !== isRtlLocale(locale)) {
  //   I18nManager.allowRTL(isRtlLocale(locale));
  //   I18nManager.forceRTL(isRtlLocale(locale));
  //   void Updates.reloadAsync(); // direction only applies after a reload
  // }
};

/**
 * Override the resolved locale (the user PROFILE preference half of D4). No
 * settings screen consumes this yet — it is the seam, and the only supported
 * way to change locale at runtime, because it moves the shared cell and
 * i18next together.
 */
export const setLocale = async (requested: string): Promise<void> => {
  const bundle = commitRequestedLocale(requested);
  applyLayoutDirection(getCurrentLocale());
  await i18next.changeLanguage(bundle);
};

void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: getCurrentBundleLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    // Our fallback is the RFC 4647 lookup in ./locale-resolution, applied
    // before i18next ever sees a tag — so i18next itself never strips regions
    // and `lng` is always an exact bundle name.
    load: 'currentOnly',
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    // Keys are dotted paths (`onboarding.cta.continue`). `:` is NOT a namespace
    // separator here because copy contains colons far more often than it
    // contains a namespace boundary ("How often:" would key-split).
    nsSeparator: false,
    keySeparator: '.',
    // i18next's own `{{var}}` interpolation is off: ICU's `{var}` is the single
    // placeholder syntax, so a translator never has to know which of two
    // templating languages a given string is written in.
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false },
  });

applyLayoutDirection(getCurrentLocale());

export default i18next;
