import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * THE LAST COLUMN THAT NEEDS POLICING, POLICED.
 *
 * `signals.occurred_at` is the one `timestamp without time zone` column left
 * in the database — it is the RANGE partition key and Postgres refuses to
 * alter it (see sql-instant.ts). A bound JS Date compared against it is
 * coerced to the SESSION time zone's wall clock, so every comparison must go
 * through `utcInstantSql`. That was a helper nobody was FORCED to use, and on
 * 2026-08-02 the audit found the one place that had forgotten it: the sybil
 * sweep's 30-day lookback (F204), whose window silently slid by the server's
 * UTC offset.
 *
 * The general source scanner that policed 162 columns was retired when those
 * columns became timestamptz. With exactly ONE column left, a scanner keyed on
 * that one column is cheap and total.
 *
 * THIS CAN SHOW RED. Replace any `${utcInstantSql(x)}` below with `${x}` — or
 * write `occurred_at >= now() - make_interval(...)`, which is the exact form
 * F204 found — and this fails, naming the file and line.
 */

const API_ROOT = join(__dirname, '..', '..', '..');
const ROOTS = [join(API_ROOT, 'src'), join(API_ROOT, 'scripts')];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.includes('.spec.')) out.push(full);
  }
  return out;
}

/** A comparison of the naive column against something. */
const COMPARISON = /\boccurred_at\s*(>=|<=|<>|!=|>|<|=|between\b)/i;

/**
 * The two forms that are CORRECT for a naive-UTC column:
 *  - `utcInstantSql(instant)` — an instant, explicitly coerced. The law.
 *  - a `::date` / `::timestamp` cast of a day key string — a naive day
 *    boundary compared against a naive column, with no instant and therefore
 *    no time zone anywhere in the expression (signal-demand-aggregate's day
 *    slices).
 * Anything else — a bare `${date}` binding, `now()`, `CURRENT_TIMESTAMP`,
 * `make_interval` off a timestamptz — reintroduces the session-timezone slide.
 */
function isCoerced(line: string): boolean {
  return (
    line.includes('utcInstantSql(') ||
    /::\s*date\b/.test(line) ||
    /::\s*timestamp\b/.test(line)
  );
}

/** Column-to-column comparisons carry no instant and no binding. */
function comparesOnlyColumns(line: string): boolean {
  return !line.includes('${') && !/\bnow\s*\(|current_timestamp/i.test(line);
}

describe('signals.occurred_at is never compared without its coercion', () => {
  it('every raw-SQL comparison of occurred_at coerces through utcInstantSql', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const lines = readFileSync(file, 'utf-8').split('\n');
        lines.forEach((line, index) => {
          if (!COMPARISON.test(line)) return;
          if (comparesOnlyColumns(line)) return;
          if (isCoerced(line)) return;
          offenders.push(`${file.slice(API_ROOT.length + 1)}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the detector itself is not vacuous — it sees the comparisons that exist', () => {
    // If a refactor renames the column or moves every reader, this test fails
    // and the one above stops meaning anything. An always-green scanner is
    // the disease, not the cure.
    let comparisons = 0;
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        for (const line of readFileSync(file, 'utf-8').split('\n')) {
          if (COMPARISON.test(line) && !comparesOnlyColumns(line)) {
            comparisons += 1;
          }
        }
      }
    }
    expect(comparisons).toBeGreaterThanOrEqual(5);
  });
});
