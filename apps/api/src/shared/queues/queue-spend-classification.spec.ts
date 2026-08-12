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

const grep = (pattern: string): string => {
  try {
    return execSync(
      `grep -rEoh ${JSON.stringify(pattern)} ${JSON.stringify(SRC)} --include=*.ts --exclude=*.spec.ts`,
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

/** Resolve `@Processor(SOME_CONST)` by finding the literal SOME_CONST holds. */
const resolveIdentifier = (identifier: string): string | null => {
  const hits = grep(`${identifier} = '[a-z0-9:_-]+'`)
    .split('\n')
    .map((line) => line.match(/'([^']+)'/)?.[1])
    .filter((value): value is string => Boolean(value));
  return hits[0] ?? null;
};

const registeredQueueNames = (): string[] => {
  const names = new Set<string>();

  // BullModule.registerQueue({ name: 'x' }) — the `name:` key, possibly on
  // its own line.
  for (const raw of grep("registerQueue\\(\\{[[:space:]]*name: '[^']+'").split(
    '\n',
  )) {
    const match = raw.match(/'([^']+)'/);
    if (match) names.add(match[1]);
  }
  // Multi-line registerQueue blocks: read the files whole.
  const moduleFiles = execSync(
    `grep -rl "BullModule.registerQueue" ${JSON.stringify(SRC)} --include=*.ts --exclude=*.spec.ts`,
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  for (const file of moduleFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of source.matchAll(
      /registerQueue\(\{\s*name:\s*([^,}]+)/g,
    )) {
      const token = block[1].trim();
      const literal = token.match(/^'([^']+)'$/)?.[1];
      const resolved = literal ?? resolveIdentifier(token);
      if (resolved) names.add(resolved);
    }
  }

  // @Processor('x') / @Processor(SOME_CONST)
  for (const raw of grep('@Processor\\([^)]+\\)').split('\n')) {
    const token = raw
      .replace(/^@Processor\(/, '')
      .replace(/\)$/, '')
      .trim();
    if (!token) continue;
    const literal = token.match(/^'([^']+)'$/)?.[1];
    const resolved = literal ?? resolveIdentifier(token);
    if (resolved) names.add(resolved);
  }

  return Array.from(names).sort();
};

describe('queue spend classification', () => {
  const scanned = registeredQueueNames();

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
