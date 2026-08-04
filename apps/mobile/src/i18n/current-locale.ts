/**
 * THE resolved-locale cell (plan: multilingual.md M1 / ruling D4, client half).
 *
 * Split out of ./index deliberately. The API client needs `getCurrentLocale()`
 * for its `Accept-Language` header on every request, and if that answer lived in
 * the i18next bootstrap then importing the API client would drag i18next, the
 * ICU formatter, and both string bundles into every module graph that touches
 * the network — including node-side unit tests that have no business
 * initializing a translation runtime. One small module owns the state; ./index
 * initializes i18next AROUND it and re-exports the accessors.
 *
 * There is exactly ONE cell here, read by both the renderer and the wire, so
 * the header can never disagree with the words on screen.
 */
import { getLocales } from 'expo-localization';

import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  resolveFormattingLocale,
  resolveSupportedLocale,
} from './locale-resolution';

/**
 * The device's ordered preference list, read ONCE at module load.
 *
 * Not re-read per call: `getLocales()` is a synchronous native-module hop, and
 * both iOS and Android relaunch the app process when the system language
 * changes — a mid-session change is unobservable anyway, so caching costs
 * nothing and keeps this cheap enough for an axios interceptor.
 */
const readDevicePreferences = (): string[] => {
  try {
    return getLocales()
      .map((locale) => locale.languageTag)
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
  } catch {
    // expo-localization is a native module. Absent only in a jest/node host,
    // where English is the right answer.
    return [];
  }
};

const devicePreferences = readDevicePreferences();

let bundleLocale: SupportedLocale = resolveSupportedLocale(devicePreferences);
let formattingLocale: string = resolveFormattingLocale(devicePreferences, bundleLocale);

/**
 * The full BCP 47 tag for `Intl` formatting and `Accept-Language` — regionally
 * specific (`es-MX`) even when strings key on the plain `es` bundle.
 */
export const getCurrentLocale = (): string => formattingLocale;

/** The bundle locale — always one of SUPPORTED_LOCALES. */
export const getCurrentBundleLocale = (): SupportedLocale => bundleLocale;

/**
 * Resolve a requested tag and commit it. Returns the bundle locale so ./index
 * can hand it straight to `i18next.changeLanguage`. Callers outside ./index
 * should use `setLocale` there — changing this cell without telling i18next is
 * exactly the desync this module exists to prevent.
 */
export const commitRequestedLocale = (requested: string): SupportedLocale => {
  bundleLocale = resolveSupportedLocale([requested]);
  formattingLocale = resolveFormattingLocale([requested, ...devicePreferences], bundleLocale);
  return bundleLocale;
};

export { DEFAULT_LOCALE };
