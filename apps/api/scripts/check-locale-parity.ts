#!/usr/bin/env ts-node
/**
 * INVARIANT: i18n.mobile-locales-are-a-subset-of-the-api
 *
 * The mobile app declares SUPPORTED_LOCALES + DEFAULT_LOCALE in
 * apps/mobile/src/i18n/locale-resolution.ts; the api declares its own in
 * apps/api/src/shared/locale/supported-locales.ts. NOTHING binds the two.
 *
 * The failure this closes: the mobile client sets Accept-Language from ITS
 * list, the api negotiates against ITS list, and a locale the mobile side
 * supports but the api does not is silently served the DEFAULT_LOCALE — a
 * Spanish (or new-language) UI asking the api in a tongue it answers in
 * English. Adding a locale to one file and forgetting the other is a pure
 * drift bug with no compiler or test to catch it, because the two files live
 * in two apps that never import each other.
 *
 * So this check is the cross-app binding that the type system cannot provide:
 * it reads BOTH files (the api by import, the mobile file textually — a static
 * read across the app boundary is exactly the missing link) and asserts
 *
 *   1. every mobile-supported locale is in the api SUPPORTED_LOCALES, and
 *   2. the two DEFAULT_LOCALEs agree.
 *
 * A mobile locale the api cannot serve, or a disagreeing default, exits 1.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  DEFAULT_LOCALE as API_DEFAULT_LOCALE,
  SUPPORTED_LOCALES as API_SUPPORTED_LOCALES,
} from '../src/shared/locale/supported-locales';

const MOBILE_FILE = join(
  __dirname,
  '../../mobile/src/i18n/locale-resolution.ts',
);

/**
 * Pull a `export const SUPPORTED_LOCALES = ['en', 'es'] as const;` array
 * literal out of the mobile source textually. Textual, not imported: the
 * mobile module transitively reaches React Native, which does not load under
 * ts-node in the api. The array literal is a flat list of quoted strings, so a
 * source read is exact and total here.
 */
function parseMobileSupportedLocales(source: string): string[] {
  const match = source.match(
    /export const SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]\s*as const/,
  );
  if (!match) {
    throw new Error(
      `Could not find the SUPPORTED_LOCALES array literal in ${MOBILE_FILE}. ` +
        'The mobile declaration moved or changed shape — re-derive this parse; ' +
        'do not delete the check.',
    );
  }
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Pull `export const DEFAULT_LOCALE ... = 'en';` textually. */
function parseMobileDefaultLocale(source: string): string {
  const match = source.match(
    /export const DEFAULT_LOCALE[^=]*=\s*['"]([^'"]+)['"]/,
  );
  if (!match) {
    throw new Error(
      `Could not find DEFAULT_LOCALE in ${MOBILE_FILE}. The mobile ` +
        'declaration moved or changed shape — re-derive this parse.',
    );
  }
  return match[1];
}

function main(): number {
  const source = readFileSync(MOBILE_FILE, 'utf8');
  const mobileSupported = parseMobileSupportedLocales(source);
  const mobileDefault = parseMobileDefaultLocale(source);

  const apiSet = new Set<string>(API_SUPPORTED_LOCALES);
  const problems: string[] = [];

  const orphans = mobileSupported.filter((tag) => !apiSet.has(tag));
  if (orphans.length > 0) {
    problems.push(
      `Mobile SUPPORTED_LOCALES has ${orphans
        .map((t) => `'${t}'`)
        .join(', ')} that the api cannot serve.\n` +
        `    mobile: [${mobileSupported.map((t) => `'${t}'`).join(', ')}]\n` +
        `    api:    [${API_SUPPORTED_LOCALES.map((t) => `'${t}'`).join(', ')}]\n` +
        '    The mobile client will set Accept-Language to a tag the api ' +
        'negotiates back to DEFAULT_LOCALE — a Spanish UI answered in English.\n' +
        '    Add the locale to apps/api/src/shared/locale/supported-locales.ts ' +
        '(with its label rows) or remove it from the mobile list.',
    );
  }

  if (mobileDefault !== API_DEFAULT_LOCALE) {
    problems.push(
      `DEFAULT_LOCALE disagrees across apps: mobile '${mobileDefault}' vs ` +
        `api '${API_DEFAULT_LOCALE}'. The two ends must fall back to the same ` +
        'tag or an untranslated concept renders differently per client.',
    );
  }

  if (problems.length === 0) {
    console.log(
      `OK — mobile locales [${mobileSupported
        .map((t) => `'${t}'`)
        .join(', ')}] ⊆ api [${API_SUPPORTED_LOCALES.map((t) => `'${t}'`).join(
        ', ',
      )}], defaults agree ('${API_DEFAULT_LOCALE}').`,
    );
    return 0;
  }

  console.error('i18n locale parity violated:\n');
  for (const problem of problems) {
    console.error(`  ${problem}\n`);
  }
  return 1;
}

process.exit(main());
