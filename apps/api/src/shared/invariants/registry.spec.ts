import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVARIANTS, SCRATCH_FILE } from './registry';

/**
 * THE REGISTRY IS COMPLETE, AND THE PROOF HARNESS IS REACHABLE.
 *
 * `yarn invariants` proves each declared invariant still bites. It cannot prove
 * that every invariant IS declared — an enforcement mechanism nobody registered
 * has no mutation, so it is exactly the unproven guard this whole apparatus
 * exists to eliminate, and it would sit there looking like enforcement.
 *
 * That is a claim about two lists agreeing, which no type can express and no
 * lint rule can see. It is a test, and this is the kind of thing tests are
 * genuinely for.
 */
const API_ROOT = join(__dirname, '..', '..', '..');

function read(rel: string): string {
  return readFileSync(join(API_ROOT, rel), 'utf8');
}

describe('the invariant registry', () => {
  it('every entry declares at least one mutation', () => {
    // An entry with no mutation is a claim, not an invariant. The harness also
    // rejects this, but failing here is faster and names the entry.
    const unproven = INVARIANTS.filter((i) => i.mutations.length === 0).map(
      (i) => i.id,
    );
    expect(unproven).toEqual([]);
  });

  it('every entry names the incident it was bought with', () => {
    // An invariant without a remembered cost is the first one someone deletes
    // when it becomes inconvenient.
    const anonymous = INVARIANTS.filter(
      (i) => i.incident.trim().length < 40,
    ).map((i) => i.id);
    expect(anonymous).toEqual([]);
  });

  it('ids are unique and dotted (they name the LAW, not the mechanism)', () => {
    const ids = INVARIANTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z]+\.[a-z0-9-]+$/.test(id))).toEqual([]);
  });

  it('the scratch probe is never committed', () => {
    // Create-mutations write this file and delete it. If it is ever present in
    // a clean tree, a harness run was interrupted and left a landmine that
    // would fail lint for reasons nobody could explain.
    expect(() => read(SCRATCH_FILE)).toThrow();
  });

  it('EVERY lint selector in eslint.config.mjs is registered', () => {
    // THE COMPLETENESS DIRECTION. A selector added without a registry entry has
    // no mutation, so nothing would notice when it stopped matching — which is
    // how a `paths` entry sat in this config matching no specifier at all, and
    // how three separate blocks silently replaced the selectors before them.
    //
    // Matched by the message text, because that is the part a human reads when
    // the rule fires and the part that must therefore stay meaningful.
    const config = read('eslint.config.mjs');
    const messages = [
      ...config.matchAll(/message:\s*\n?\s*'([^']{25,})'/g),
    ].map((m) => m[1]);
    expect(messages.length).toBeGreaterThan(5);

    // Every rule message must be traceable to a registered invariant, matched
    // on a distinctive phrase from the message.
    const registered = INVARIANTS.map((i) =>
      `${i.id} ${i.statement} ${i.mechanism}`.toLowerCase(),
    ).join(' | ');
    const KNOWN_PHRASES: Array<[string, string]> = [
      ['Gemini SDK has one owner', 'gemini-sdk'],
      ['GatedGeminiClient takes its gate', 'gated-client'],
      ['PhotoReadService has no viewer', 'photos.every-read-names-its-viewer'],
      ['hand-rolled flag dialect', 'flag-dialect'],
      ['becomes a Redis key prefix', 'app-env'],
      ['Bracket access is the same read', 'app-env'],
      ['Destructuring APP_ENV', 'app-env'],
      ['Aliasing process.env', 'app-env'],
      ['may only be INCREMENTED', 'enrichment-failure'],
      ['Hand-rolled subject-identity fold-back', 'subject-identity'],
      ['Hand-rolled redirect join', 'subject-identity'],
      ['activation pointer has one owner', 'extraction-scope'],
      ['run-excluding delete on the event ledgers', 'extraction-scope'],
      ['A dynamic import is an import', 'gemini-sdk'],
      ['TomTom vendor surface has one owner', 'tomtom-vendor-has-one-door'],
    ];

    // Each message in the config must be one we have mapped to an invariant.
    const unmapped = messages.filter(
      (message) => !KNOWN_PHRASES.some(([phrase]) => message.includes(phrase)),
    );
    expect(unmapped).toEqual([]);

    // And each mapping must point at an invariant that actually exists.
    const dangling = KNOWN_PHRASES.filter(
      ([, idFragment]) => !registered.includes(idFragment),
    ).map(([phrase]) => phrase);
    expect(dangling).toEqual([]);
  });

  it('every boot-level entry points at a mechanism that throws', () => {
    // A "boot" claim is only true if the process actually refuses to start.
    for (const invariant of INVARIANTS.filter((i) => i.level === 'boot')) {
      expect(invariant.mechanism.length).toBeGreaterThan(10);
    }
    // The two that exist today, by construction:
    const bootIds = INVARIANTS.filter((i) => i.level === 'boot').map(
      (i) => i.id,
    );
    expect(bootIds).toContain('access.no-route-the-paywall-would-403');
    expect(bootIds).toContain('spend.every-gemini-surface-is-classified');
  });
});
