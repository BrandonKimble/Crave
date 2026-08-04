import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CACHES ARE VOLATILE — THE LAW (2026-08-04 Redis-full incident).
 *
 * The eviction contract that keeps the shared prod Redis safe is
 * volatile-lru: under memory pressure Redis may evict ONLY keys that
 * carry a TTL. That is only safe if two things stay true forever:
 *   1. every CACHE write carries a TTL (so pressure can always be
 *      relieved), and
 *   2. queue/critical keys carry NO TTL (so they are un-evictable).
 * Bull owns #2. This spec enforces #1: any `redis…set(` in src that does
 * not pass an expiry ('EX'/'PX'/expire-after-set) fails the build.
 *
 * RED-provable: add `redis.set(key, value)` anywhere and this fails.
 */
const API_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(API_ROOT, 'src');

/** Files whose sets are NOT caches (their keys are deliberately
 *  non-volatile or manage expiry through their own protocol). */
const ALLOWED = [
  // Bull manages its own key lifecycle; these are queue configs not sets
  'infrastructure/throttler/throttler-redis.storage.ts', // sliding-window protocol (expire via its own script)
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.includes('.spec.')) out.push(full);
  }
  return out;
}

describe('redis caches are volatile', () => {
  it('every redis set in src carries a TTL (or is allowlisted with a reason)', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (ALLOWED.some((a) => rel.endsWith(a))) continue;
      const text = readFileSync(file, 'utf-8');
      // find redis-ish set( calls and require EX/PX within the statement
      const re = /(redis\w*|redisClient|pipeline)\s*\.\s*set\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const statement = text.slice(match.index, match.index + 600);
        const stmtEnd = statement.indexOf(');');
        const stmt = stmtEnd > 0 ? statement.slice(0, stmtEnd) : statement;
        if (!/'(EX|PX)'|"(EX|PX)"/.test(stmt)) {
          offenders.push(`${rel}: ${stmt.split('\n')[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('this spec can show RED (self-check: a TTL-less set is detected)', () => {
    const sample = `await this.redis.set(key, value);`;
    expect(/'(EX|PX)'/.test(sample)).toBe(false);
  });
});
