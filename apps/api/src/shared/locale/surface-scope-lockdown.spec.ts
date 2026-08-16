import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * THE 11TH HAND-ROLLED `locale = 'und'` IDENTITY PREDICATE CANNOT APPEAR.
 *
 * Same shape as entity-display-lockdown.spec.ts: a boundary a code review
 * cannot hold on its own gets an executable frozen list.
 *
 * THE LAW (surface-scope.ts): identity is LOCALE-BLIND. Nine readers
 * hand-wrote `locale = 'und'` on identity probes and each one silently made
 * "same thing" mean "same thing, and banked language-less" — 1,055 corpus
 * entities owned a twin-naming surface those reads could not see, and misses
 * MINT DUPLICATE ENTITIES. A tenth instance (restaurant-cuisine-extraction)
 * survived the door adoption and was caught by the foundational red team;
 * this spec makes the eleventh impossible to land quietly.
 *
 * The scanned shape is the SQL equality predicate `<alias>.locale = 'und'` —
 * the exact spelling every one of the ten instances used. Legitimate uses of
 * the string 'und' (write-side defaults, chain construction, `<>` exclusions
 * in the locale INDEX, comments without an alias dot) do not match. A read
 * that genuinely wants the und-only slice says so through the door:
 * `recallScope(null)` IS the chain ['und'], byte-identical.
 *
 * PROVEN RED at authoring time: planting
 * `AND s.locale = 'und'` in any non-spec src file fails the first case, and
 * deleting an ALLOWLIST entry (when one exists) fails the staleness case.
 */

const SRC = join(__dirname, '..', '..');

/** Alias-dotted SQL equality — the disease's one spelling across all ten
 *  instances. A FRESH regex per file (a shared /g regex carries lastIndex). */
const PREDICATE_SOURCE = String.raw`\w+\.locale\s*=\s*'und'`;
const hasPredicate = (text: string): boolean =>
  new RegExp(PREDICATE_SOURCE).test(text);

/** file (relative to src/) → why a hand-rolled und-equality is allowed.
 *  Empty today: every identity probe reads through identityScope(), and
 *  every und-only recall read is recallScope(null). Keep it that way. */
const ALLOWLIST: Readonly<Record<string, string>> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

function offendingFiles(): string[] {
  return walk(SRC)
    .filter((file) => hasPredicate(readFileSync(file, 'utf-8')))
    .map((file) =>
      file
        .slice(SRC.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();
}

describe("identity is locale-blind — no hand-rolled locale = 'und' predicates (surface-scope lockdown)", () => {
  it("every file with a raw `<alias>.locale = 'und'` SQL predicate is classified", () => {
    const found = offendingFiles();
    const unclassified = found.filter((file) => !(file in ALLOWLIST));
    const hint =
      "A hand-rolled locale = 'und' predicate appeared. If it is an identity probe (same-thing question), use identityScope()/identityScopeWhere() — identity is locale-blind by law. If it truly wants the und-only recall slice, recallScope(null) is that slice. Only then, allowlist it with the reason.";
    expect({ unclassified, hint }).toEqual({ unclassified: [], hint });
  });

  it('the allowlist has no stale entries (a deleted site must leave the list)', () => {
    const found = new Set(offendingFiles());
    const stale = Object.keys(ALLOWLIST).filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('the door itself still carries no locale predicate on identity (the other half)', () => {
    const door = readFileSync(join(__dirname, 'surface-scope.ts'), 'utf-8');
    const start = door.indexOf('export function identityScope');
    const identityBody = door.slice(start, door.indexOf('\n}', start));
    expect(identityBody).toContain("status = 'active'");
    expect(identityBody).not.toContain('locale');
  });
});
