import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { collectSourceFiles } from '../../shared/testing/import-scan';
import { codeOnly } from '../../shared/testing/code-only';
import { linkerAdmits } from './evidence-admission';
import {
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
  LINKER_TIER_FLOORS,
} from './linker-calibration.generated';

/**
 * EXACTLY ONE DEFINITION OF THE LIVE LINK DECISION (audit 2026-08-03, F1260).
 *
 * Five search harnesses each re-implemented the linker's decision in-script and
 * each called its copy "the live rule". The design was sound only while someone
 * re-synced the replicas. The margin + per-tier-floor flip SHIPPED, the replicas
 * did not follow, and every one of them went on reporting a policy nothing
 * serves as the production baseline — with the worst case being the file that
 * was PARTIALLY updated: it imported the calibrated constants, used them, and
 * still printed `threshold=0.82` in its provenance line. Output that looks
 * freshly generated and names a policy the run did not execute is more
 * misleading than output that is simply stale.
 *
 * A harness holds CANDIDATE-policy code only. The INCUMBENT is imported.
 *
 * This guard can show RED: paste a `>= 0.82` linker literal back into any
 * harness and the census below names the file.
 */

const HARNESS_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'search-harness',
);

/**
 * The one file exempt BY CONSTRUCTION: the sweep GENERATES
 * linker-calibration.generated.ts, so it must keep its own derivation — a
 * unified sweep would calibrate the constants against their own output.
 */
const EXEMPT = ['linker-calibration-sweep.ts'];

describe('the link decision has one authority', () => {
  it('no harness re-implements the incumbent with a hard-coded threshold', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(HARNESS_ROOT)) {
      const name = relative(HARNESS_ROOT, file).split('\\').join('/');
      if (EXEMPT.includes(name)) continue;
      const code = codeOnly(readFileSync(file, 'utf8'));
      // A linker threshold spelled as a literal, in code — the exact shape
      // that rotted: `>= 0.82`, `const THRESH = 0.82`, `1.3 * runnerSim`.
      if (/(>=|===|=)\s*0\.82\b/.test(code) || /\b1\.3\s*\*/.test(code)) {
        offenders.push(name);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('the census actually reads the harness directory (no empty-loop green)', () => {
    expect(collectSourceFiles(HARNESS_ROOT).length).toBeGreaterThan(15);
  });

  it('linkerAdmits IS the three-branch decision, read from the calibration artifact', () => {
    // Behavioural, not textual: if someone re-derives the predicate wrongly,
    // these fail. `fuzzy` is present in every generated table so far; fall
    // back to the conservative floors if a future sweep drops it.
    const floors = LINKER_TIER_FLOORS['fuzzy'] ?? {
      absolute: 0.82,
      singleton: 0.65,
    };

    // HARD MINIMUM: below it, nothing links — not even a total singleton.
    expect(
      linkerAdmits({
        topSim: LINKER_MIN_FLOOR - 0.01,
        runnerSim: 0,
        eligibleCount: 1,
        tier: 'fuzzy',
      }),
    ).toBe(false);

    // ABSOLUTE floor: at or above it, a link stands on its own.
    expect(
      linkerAdmits({
        topSim: floors.absolute,
        runnerSim: floors.absolute,
        eligibleCount: 2,
        tier: 'fuzzy',
      }),
    ).toBe(true);

    // SINGLETON branch: only when nothing else competed.
    const singletonSim = Math.max(floors.singleton, LINKER_MIN_FLOOR);
    expect(
      linkerAdmits({
        topSim: singletonSim,
        runnerSim: 0,
        eligibleCount: 1,
        tier: 'fuzzy',
      }),
    ).toBe(true);
    expect(
      linkerAdmits({
        topSim: singletonSim,
        runnerSim: 0,
        eligibleCount: 3,
        tier: 'fuzzy',
      }),
    ).toBe(singletonSim >= floors.absolute);

    // MARGIN branch: dominance over a REAL runner-up, below the absolute floor.
    const runner = LINKER_MIN_FLOOR / LINKER_MARGIN + 0.001;
    const dominant = runner * LINKER_MARGIN;
    if (dominant < floors.absolute) {
      expect(
        linkerAdmits({
          topSim: dominant,
          runnerSim: runner,
          eligibleCount: 2,
          tier: 'fuzzy',
        }),
      ).toBe(true);
      expect(
        linkerAdmits({
          topSim: dominant,
          runnerSim: dominant, // no dominance
          eligibleCount: 2,
          tier: 'fuzzy',
        }),
      ).toBe(false);
    }
  });
});
