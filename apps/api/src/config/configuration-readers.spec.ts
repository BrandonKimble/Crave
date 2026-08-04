import { readFileSync } from 'fs';
import { join } from 'path';
import configuration from './configuration';
import { codeOnly } from '../shared/testing/code-only';
import { collectSourceFiles } from '../shared/testing/import-scan';

/**
 * EVERY DECLARED CONFIG LEAF MUST HAVE A READER (audit 2026-08-02, F405).
 *
 * A census found ~160 of this file's 559 lines governed nothing: seven whole
 * namespaces (`logging`, `sentry`, `throttler`, `jwt`, `onDemand`,
 * `restaurantEnrichment`, `clerk.publishableKey`) plus ~95 lines of dead
 * `pushshift` sub-blocks had ZERO readers. Each had compensated for a
 * subsystem since deleted (JWT auth → Clerk), rewritten (throttler → per-route
 * decorator tiers), or half-adopted. Nothing removed the declaration, so the
 * file read as a promise the code does not keep — and the "every default is a
 * fact, an owner choice, or a derivation" law cannot be audited when a third
 * of the defaults govern nothing.
 *
 * THE TRAP THIS SPEC EXISTS TO CATCH (learned during that very deletion):
 * `throttler` looked deadest of all — a literal `get('throttler.` finds
 * NOTHING in the tree — yet it is live and load-bearing, because
 * `readThrottlerWindow` builds its key as a TEMPLATE LITERAL. Deleting it
 * would have failed boot. So this scan resolves template-literal reads too,
 * and anything it still cannot see must be declared below with the reason.
 */

const API_SRC = join(__dirname, '..');

/** Every `get('a.b.c')` and `` get(`a.${x}.c`) `` path in the API sources. */
function readConfigPaths(): { literal: Set<string>; prefixes: Set<string> } {
  const literal = new Set<string>();
  const prefixes = new Set<string>();

  for (const file of collectSourceFiles(API_SRC)) {
    if (file.endsWith('.spec.ts')) continue;
    const source = codeOnly(readFileSync(file, 'utf8'));

    // The generic argument may span lines and contain `>` (`get<Record<K,V>>`),
    // and the quoted path is frequently on the NEXT line — both forms hid real
    // readers when this scan was first written with a naive `<[^>]*>`.
    for (const m of source.matchAll(
      /\bget\s*(?:<[^()]*?>)?\s*\(\s*['"]([A-Za-z][A-Za-z0-9_.]*)['"]/g,
    )) {
      literal.add(m[1]);
    }
    // Named config accessors count as readers too: `requireCeiling('a.b.c')`
    // wraps configService.get with fail-closed validation (D51/F114) — the
    // literal-get scan alone went RED on googlePlaces.* the day it landed.
    for (const m of source.matchAll(
      /\brequireCeiling\s*\(\s*['"]([A-Za-z][A-Za-z0-9_.]*)['"]/g,
    )) {
      literal.add(m[1]);
    }
    // Template-literal paths, wherever they are built. `readThrottlerWindow`
    // assigns `` `throttler.${window}.${field}` `` to a local FIRST and passes
    // the variable to get(), so matching only inline `get(\`...\`)` misses it.
    for (const m of source.matchAll(/`([A-Za-z][A-Za-z0-9_]*)\.\$\{/g)) {
      prefixes.add(m[1]);
    }
  }
  return { literal, prefixes };
}

/** Flatten the assembled config to its leaf paths. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

/**
 * Leaves consumed somewhere a source scan cannot see. Each entry states WHO
 * reads it — an unexplained entry here is how the next dead block hides.
 */
const READ_OUTSIDE_THE_SCAN: Record<string, string> = {
  appEnv:
    'the resolved environment itself; read via config.appEnv and passed down',
  port: 'main.ts app.listen',
  'database.url': 'PrismaService / DATABASE_URL',
};

/**
 * KNOWN ORPHANS, QUARANTINED — NOT forgiven.
 *
 * Both were found by THIS spec on the day it was written, after the F405
 * deletion sweep had already removed the seven namespaces the audit
 * enumerated. They are the same defect one layer down: a declared default and
 * a documented env var (`REDDIT_REQUESTS_PER_MINUTE` is even published in
 * REDDIT_API_INTEGRATION.md) that govern nothing. They are NOT deleted here
 * because they were outside the ratified deletion list; they are listed so the
 * next reader sees them, and so a NEW dead key still turns this suite red
 * instead of joining an ever-growing silence.
 */
const KNOWN_ORPHANS = ['reddit.requestsPerMinute', 'tomtom.apiVersion'];

describe('configuration.ts declares nothing it does not read', () => {
  it('every leaf key has a reader (a key nothing reads is a lie)', () => {
    const config = configuration();
    const { literal, prefixes } = readConfigPaths();

    const orphans = leafPaths(config).filter((path) => {
      if (READ_OUTSIDE_THE_SCAN[path]) return false;
      if (prefixes.has(path.split('.')[0])) return false;
      // A read of any ANCESTOR reads this leaf (`get('database')`).
      const parts = path.split('.');
      for (let i = parts.length; i > 0; i -= 1) {
        if (literal.has(parts.slice(0, i).join('.'))) return false;
      }
      return true;
    });

    // EXACT equality, not a subset: a key leaving the orphan list must delete
    // its entry, and a new dead key fails immediately.
    expect(orphans.sort()).toEqual([...KNOWN_ORPHANS].sort());
  });

  it('sees the template-literal reader that a naive grep misses', () => {
    // The regression guard for the near-miss: if this scan ever stops
    // resolving `throttler.${window}.${field}`, the throttler block looks dead
    // and the next census deletes a block whose absence fails boot.
    expect(readConfigPaths().prefixes.has('throttler')).toBe(true);
  });
});
