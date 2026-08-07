// F6604(a) / D112 — the sheet-motion parity gate: a FROZEN DIGEST over the full legacy domain
// plus a FROZEN READABLE SAMPLE. This file replaces `legacyOracleSheetMotionPlan`, the
// hand-transcribed second implementation whose own header told authors to edit it in lockstep
// with the code it was supposed to police. See app-route-sheet-motion-plan-parity-domain.ts.
//
// WHEN THIS GOES RED. It is telling you that a sheet-motion plan changed for at least one of
// 24,200 (source, target, kind, remembered, explicit) points. If the change is INTENTIONAL,
// bless it — `scripts/bless-sheet-motion-parity.sh --bless` — which rewrites the frozen file
// and prints the old and new digests. The bless lands as its own visible diff; it cannot happen
// as a side effect of running the suite.

import { writeFileSync } from 'fs';
import { join } from 'path';

import {
  computeSheetMotionParityDigest,
  deriveSheetMotionParityLines,
  deriveSheetMotionParitySample,
  hashSheetMotionParityLines,
  LEGACY_PARITY_SCENE_KEYS,
  PARITY_SNAPS,
  PARITY_TRANSITION_KINDS,
} from './app-route-sheet-motion-plan-parity-domain';
import {
  FROZEN_SHEET_MOTION_PARITY_DIGEST,
  FROZEN_SHEET_MOTION_PARITY_ROW_COUNT,
  FROZEN_SHEET_MOTION_PARITY_SAMPLE,
} from './app-route-sheet-motion-plan-parity-frozen';

const FROZEN_FILE_PATH = join(__dirname, 'app-route-sheet-motion-plan-parity-frozen.ts');

const renderFrozenFile = (params: {
  rowCount: number;
  digest: string;
  sample: Record<string, string>;
}): string => {
  const sampleBody = Object.entries(params.sample)
    .map(([key, plan]) => `  ${JSON.stringify(key)}: ${JSON.stringify(plan)},`)
    .join('\n');
  return `// GENERATED — DO NOT EDIT BY HAND.
// Regenerate with: scripts/bless-sheet-motion-parity.sh --bless
// (see app-route-sheet-motion-plan-parity-domain.ts for why this file exists)
//
// Editing these constants by hand to make a red spec go green is the exact failure the frozen
// digest was built to make visible. Bless deliberately, in its own diff, with the reason.

export const FROZEN_SHEET_MOTION_PARITY_ROW_COUNT = ${params.rowCount};

export const FROZEN_SHEET_MOTION_PARITY_DIGEST = ${JSON.stringify(params.digest)};

// One key per DISTINCT plan value over the parity domain, first key in canonical order.
export const FROZEN_SHEET_MOTION_PARITY_SAMPLE: Record<string, string> = {
${sampleBody}
};
`;
};

describe('sheet-motion plan parity (frozen digest + readable sample)', () => {
  const lines = deriveSheetMotionParityLines();
  const digest = hashSheetMotionParityLines(lines);
  const sample = deriveSheetMotionParitySample(lines);

  // The bless mode: OFF unless the env var is set, which only the bless script sets. It writes
  // the frozen file and prints both digests, then lets the assertions below run against the
  // freshly written values (so a bless run is green by construction — the diff is the record).
  if (process.env.BLESS_SHEET_MOTION_PARITY === '1') {
    // eslint-disable-next-line no-console
    console.log(
      [
        '[bless-sheet-motion-parity] rewriting frozen parity constants',
        `  old digest: ${FROZEN_SHEET_MOTION_PARITY_DIGEST}`,
        `  new digest: ${digest}`,
        `  old rows:   ${FROZEN_SHEET_MOTION_PARITY_ROW_COUNT}`,
        `  new rows:   ${lines.length}`,
        `  sample keys: ${Object.keys(sample).length} (one per distinct plan value)`,
      ].join('\n')
    );
    writeFileSync(
      FROZEN_FILE_PATH,
      renderFrozenFile({ rowCount: lines.length, digest, sample }),
      'utf8'
    );
  }

  const blessed = process.env.BLESS_SHEET_MOTION_PARITY === '1';
  const expectedDigest = blessed ? digest : FROZEN_SHEET_MOTION_PARITY_DIGEST;
  const expectedRowCount = blessed ? lines.length : FROZEN_SHEET_MOTION_PARITY_ROW_COUNT;
  const expectedSample = blessed ? sample : FROZEN_SHEET_MOTION_PARITY_SAMPLE;

  it('sweeps the whole legacy domain (the digest is only as good as its coverage)', () => {
    expect(lines.length).toBe(
      LEGACY_PARITY_SCENE_KEYS.length ** 2 *
        PARITY_TRANSITION_KINDS.length *
        PARITY_SNAPS.length ** 2
    );
    expect(lines.length).toBe(expectedRowCount);
    // Canonical keys are unique: a collision would let two points share a slot and hide a drift.
    expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length);
  });

  it('matches the frozen content digest over all 24,200 points', () => {
    if (digest !== expectedDigest) {
      const frozenKeys = new Set(Object.keys(expectedSample));
      const drifted = lines
        .filter((line) => frozenKeys.has(line.key) && expectedSample[line.key] !== line.plan)
        .map((line) => `${line.key}: frozen=${expectedSample[line.key]} now=${line.plan}`);
      throw new Error(
        [
          `sheet-motion parity digest mismatch: frozen=${expectedDigest} derived=${digest}`,
          drifted.length
            ? `sample rows that moved:\n  ${drifted.join('\n  ')}`
            : 'no sampled row moved — the drift is outside the readable slice; diff the plans ' +
              'for the tuple you changed, or bless if the change is intentional.',
          'Intentional? scripts/bless-sheet-motion-parity.sh --bless',
        ].join('\n')
      );
    }
    expect(digest).toBe(expectedDigest);
  });

  it('matches the frozen readable sample verbatim (one key per distinct plan value)', () => {
    expect(sample).toEqual(expectedSample);
    // Coverage of the slice is itself frozen: if the table starts emitting a plan shape the
    // sample never covered, the sample grows and this comparison shows it as a new line.
    expect(new Set(Object.values(sample)).size).toBe(Object.keys(sample).length);
  });

  it('recomputes the same digest twice (the derivation is deterministic)', () => {
    expect(computeSheetMotionParityDigest()).toBe(digest);
  });
});
