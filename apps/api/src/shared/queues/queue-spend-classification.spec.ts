import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  QUEUE_SPEND_CLASSIFICATION,
  SPEND_BEARING_QUEUE_NAMES,
  isSpendBearingQueue,
} from './queue-spend-classification';

/**
 * THE ANTI-ROT GUARD for the spend classification.
 *
 * The worker-boot spend guard only freezes what the classification says
 * spends money. A queue added later and never classified would be invisible
 * to it — the guard would look healthy while the $25 hole reopened one queue
 * to the left. So: every queue name the codebase actually registers or
 * processes must appear in the classification, and vice versa.
 *
 * This scans SOURCE rather than importing the modules because the truth we
 * need is "what names does the codebase hand to Bull", which only the
 * registration sites know.
 */

const SRC = path.resolve(__dirname, '..', '..');

/**
 * SINGLE-quoted shell escaping. `JSON.stringify` produces DOUBLE quotes, in
 * which `sh` still expands a backtick as command substitution — and this
 * scanner's patterns now contain backticks (template-literal queue names).
 * Single quotes are the only shell quoting that is literal throughout.
 */
const shq = (value: string): string => `'${value.split("'").join(`'\\''`)}'`;

const grep = (pattern: string): string => {
  try {
    return execSync(
      `grep -rEoh ${shq(pattern)} ${shq(SRC)} --include=*.ts --exclude=*.spec.ts`,
      { encoding: 'utf8' },
    );
  } catch (error) {
    // grep exits 1 on "no matches" — a legitimate empty result. Any other
    // status (2 = usage/IO error, 127 = grep missing) is a BROKEN SCAN and
    // must fail the spec, never read as "nothing to classify".
    const status = (error as { status?: number }).status;
    if (status === 1) return '';
    throw new Error(`queue-name scan failed (grep exit ${String(status)})`);
  }
};

/** Files matching a pattern. Exit 1 = no files, which is a real answer. */
const grepFiles = (pattern: string): string[] => {
  try {
    return execSync(
      `grep -rl ${shq(pattern)} ${shq(SRC)} --include=*.ts --exclude=*.spec.ts`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw new Error(`queue-file scan failed (grep exit ${String(status)})`);
  }
};

/**
 * A string literal in ANY of TypeScript's three quotings. Single quotes are
 * what prettier writes here, but a template literal is legal, compiles to the
 * same name, and used to walk straight past this scanner (red team
 * 2026-08-11): `@Processor(GHOST)` with ``const GHOST = `ghost-queue` ``
 * resolved to null and was silently DROPPED, so the queue was invisible to
 * the classification and therefore to the boot spend guard.
 */
const QUOTE_CHARS = '\'"\x60'; // \x60 = backtick, spelled as an escape so this
// file never contains a backtick inside a template literal (that ends it).
const GREP_QUOTED = `[${QUOTE_CHARS}][a-z0-9:_-]+[${QUOTE_CHARS}]`;

const literalOf = (token: string): string | null =>
  token.match(
    new RegExp(`^[${QUOTE_CHARS}]([a-z0-9:_-]+)[${QUOTE_CHARS}]$`),
  )?.[1] ?? null;

/**
 * Resolve `@Processor(SOME_CONST)` to the literal SOME_CONST holds, following
 * re-exports: the enrichment queue name is `const QUEUE_NAME = '...'` in one
 * file and `export const RESTAURANT_ENRICHMENT_QUEUE_NAME = QUEUE_NAME` in
 * the next, and the single-hop version of this returned null for it.
 */
const resolveIdentifier = (
  identifier: string,
  seen = new Set<string>(),
): string | null => {
  if (!/^[A-Za-z_$][\w$.]*$/.test(identifier)) return null;
  if (seen.has(identifier)) return null;
  seen.add(identifier);

  const assignments = [
    ...grep(`${identifier} = ${GREP_QUOTED}`).split('\n'),
    ...grep(`${identifier} = [A-Za-z_$][A-Za-z0-9_$]*`).split('\n'),
  ]
    .map((line) => line.slice(line.indexOf('=') + 1).trim())
    .filter(Boolean);

  for (const rhs of assignments) {
    const literal = literalOf(rhs);
    if (literal) return literal;
  }
  for (const rhs of assignments) {
    const nested = resolveIdentifier(rhs, seen);
    if (nested) return nested;
  }
  return null;
};

/**
 * Names the codebase hands to Bull, plus the tokens the scan could NOT
 * resolve. An unresolvable token is an UNKNOWN queue, never an absent one:
 * dropping it silently is how a spend-bearing lane goes unclassified while
 * every test stays green.
 */
const registeredQueueNames = (): { names: string[]; unresolved: string[] } => {
  const names = new Set<string>();
  const unresolved = new Set<string>();

  const take = (rawToken: string, site: string): void => {
    const token = rawToken.trim();
    if (!token) return;
    const resolved = literalOf(token) ?? resolveIdentifier(token);
    if (resolved) names.add(resolved);
    else unresolved.add(`${site}: ${token}`);
  };

  // BullModule.registerQueue({ name: 'x' }) and .registerQueueAsync({...}) —
  // registerQueueAsync registers a consuming queue exactly as much as the
  // synchronous form does, and was not scanned at all until the red team
  // planted one and this spec stayed GREEN.
  for (const file of grepFiles('registerQueue')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of source.matchAll(
      /registerQueue(?:Async)?\(\{\s*name:\s*([^,}]+)/g,
    )) {
      take(block[1], 'registerQueue');
    }
  }

  // @Processor('x') / @Processor(SOME_CONST)
  for (const raw of grep('@Processor\\([^)]+\\)').split('\n')) {
    take(raw.replace(/^@Processor\(/, '').replace(/\)$/, ''), '@Processor');
  }

  return { names: Array.from(names).sort(), unresolved: [...unresolved] };
};

describe('queue spend classification', () => {
  const { names: scanned, unresolved } = registeredQueueNames();

  it('resolves every queue name it sees (an unreadable name is an unknown queue)', () => {
    expect(unresolved).toEqual([]);
  });

  it('the scan itself finds queues (a silently-empty scan is a lying guard)', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(8);
  });

  it('classifies every queue the codebase registers or processes', () => {
    const unclassified = scanned.filter(
      (name) => !(name in QUEUE_SPEND_CLASSIFICATION),
    );
    expect(unclassified).toEqual([]);
  });

  it('classifies nothing that no longer exists', () => {
    const stale = Object.keys(QUEUE_SPEND_CLASSIFICATION).filter(
      (name) => !scanned.includes(name),
    );
    expect(stale).toEqual([]);
  });

  it('gives every entry a vendor rationale', () => {
    for (const [name, entry] of Object.entries(QUEUE_SPEND_CLASSIFICATION)) {
      expect(`${name}: ${entry.why}`.length).toBeGreaterThan(name.length + 30);
    }
  });

  it('names the money lanes from the incident as spend-bearing', () => {
    expect(SPEND_BEARING_QUEUE_NAMES).toEqual(
      expect.arrayContaining([
        'restaurant-primary-enrichment',
        'restaurant-secondary-location-expansion',
        'restaurant-cuisine-extraction',
      ]),
    );
    expect(isSpendBearingQueue('chronological-collection')).toBe(false);
    expect(isSpendBearingQueue('restaurant-primary-enrichment')).toBe(true);
  });
});
