import * as fs from 'fs';
import * as path from 'path';
import type { AddSurfacesOptions } from './entity-surface.service';

/**
 * F9968 — the adjudicated guard-bypass must be UNREPRESENTABLE, not
 * conventional. Two halves, each with its mutation proof:
 *
 * 1. TYPE HALF (compile-time): `adjudicated: true` must not typecheck.
 *    WordClaimVerdict is branded on a NON-EXPORTED unique symbol, so the
 *    only constructor is mintWordClaimVerdict. The @ts-expect-error below
 *    IS the mutation proof: if someone weakens the field back to boolean
 *    (or exports the brand), the directive becomes unused and tsc fails
 *    THIS file.
 *
 * 2. IMPORTER HALF (source scan): mintWordClaimVerdict may be imported by
 *    exactly one production file — the adjudicator. A second importer is a
 *    deliberate escape-hatch grab and must show RED here. Mutation-proven
 *    by construction: add `import { mintWordClaimVerdict }` to any other
 *    file and this test fails.
 */

// ── Type half ──────────────────────────────────────────────────────────────
// @ts-expect-error F9968: a bare boolean must NOT satisfy the branded verdict
const bypassAttempt: AddSurfacesOptions = { adjudicated: true };
void bypassAttempt;

// ── Importer half ──────────────────────────────────────────────────────────
const SRC_ROOT = path.resolve(__dirname, '../../..');
const ALLOWED_IMPORTERS = new Set([
  'modules/content-processing/entity-resolver/word-claim-adjudicator.service.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('F9968 — mintWordClaimVerdict single-importer law', () => {
  it('exactly the adjudicator imports the escape hatch', () => {
    const importers = walk(SRC_ROOT)
      .filter((file) =>
        /\bmintWordClaimVerdict\b/.test(fs.readFileSync(file, 'utf8')),
      )
      .map((file) => path.relative(SRC_ROOT, file))
      // The definition site itself is not an importer.
      .filter(
        (rel) =>
          rel !==
          'modules/content-processing/entity-resolver/entity-surface.service.ts',
      );
    const unexpected = importers.filter((rel) => !ALLOWED_IMPORTERS.has(rel));
    expect({ unexpected }).toEqual({ unexpected: [] });
    // The scanner itself must be able to show red the OTHER way too: if the
    // adjudicator ever stops importing it, the bypass door is dead code and
    // this list is stale.
    expect(importers).toEqual(Array.from(ALLOWED_IMPORTERS));
  });
});
