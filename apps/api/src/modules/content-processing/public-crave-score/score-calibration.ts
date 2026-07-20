/**
 * §8 per-source score calibration — the pure kernel (the g PRIMITIVE, shared
 * conceptually with §11 deficiency's rep denominator).
 *
 * The SOURCE is the calibration room (§5): A_source(τ) = Σ its gate-passing
 * documents · 0.5^(age/τ), lanes {365d stable, 21d fast}, normalized per
 * OBSERVED day within τ (coverage — cadence variability cannot masquerade as
 * room size). g_source = max(A, A_floor) / A_ref, with A_ref and A_floor
 * PER-LANE constants pinned per scoreVersion epoch (re-pin only with a
 * version bump). Calibrated counts: each mention ÷ g of ITS OWN source,
 * INSIDE log1p; v3 downstream unchanged.
 *
 * sourceClassInfluence (§8): read-side per platform class, DEFAULT 1.0 —
 * launch = a poll vote ≈ a Reddit mention. The floor clamp means only
 * "refuse amplification of unmeasurable rooms," never a boost.
 */

export type CalibrationLane = 'stable' | 'fast';

export const CALIBRATION_LANES: readonly CalibrationLane[] = [
  'stable',
  'fast',
] as const;

export interface LaneCalibrationConstants {
  aRef: number;
  aFloor: number;
}

/** One source's measured room, both lanes. */
export interface SourceActivity {
  sourceId: string;
  platform: string;
  anchorPlaceId: string | null;
  engineId: string | null;
  /** A(τ) per lane: decayed gate-passing doc mass ÷ observed days within τ. */
  activity: Record<CalibrationLane, number>;
}

/**
 * Observed days within the lane window [now − τ, now]: the overlap of the
 * source's observed-coverage interval with the window, in days (min 1 so a
 * brand-new room never divides by zero).
 *
 * COVERAGE DERIVATION (interim, OWNER-RATIFY-adjacent): §10's first-class
 * coverage-interval rows are not built yet (ledger: advance-at-extraction +
 * expectedBatches reconciler pending), so the interval is DERIVED from facts
 * that already prove observation:
 *   from    = least(source.createdAt, earliest document) — an archive seed
 *             observed those past days; a poll_surface room exists (and is
 *             observed, being push-complete) from source creation.
 *   through = greatest(latest document, latest lane run, source.createdAt) —
 *             a chronological run observes through its run time even when it
 *             yields zero documents; for push-complete poll_surface sources
 *             the latest graduated/ballot document IS the closed-poll
 *             watermark (§8: coveredThrough advanced at graduation
 *             extraction-run creation).
 * Interior coverage GAPS are not representable in this derivation; the §10
 * interval primitive replaces it when built.
 */
export function observedDays(
  interval: { from: Date | null; through: Date | null },
  tauDays: number,
  now: Date,
): number {
  if (!interval.from) {
    return 1;
  }
  const windowStartMs = now.getTime() - tauDays * 86_400_000;
  const fromMs = Math.max(interval.from.getTime(), windowStartMs);
  const throughMs = Math.min(
    Math.max(interval.through?.getTime() ?? fromMs, fromMs),
    now.getTime(),
  );
  return Math.max(1, (throughMs - fromMs) / 86_400_000);
}

/** A(τ) = decayed gate-passing document mass ÷ observed days within τ. */
export function laneActivity(
  decayedDocMass: number,
  observedDaysInWindow: number,
): number {
  if (!Number.isFinite(decayedDocMass) || decayedDocMass <= 0) {
    return 0;
  }
  return decayedDocMass / Math.max(1, observedDaysInWindow);
}

/**
 * Derive the per-lane epoch constants from the measured corpus (§16: floors
 * and refs are DERIVED, never invented). Measured over sources with A > 0:
 *   A_ref   = median A   — the reference room is the TYPICAL measured room,
 *             so g = 1 means "an ordinary room" and calibration is centered.
 *   A_floor = p10 of A   — amplification of quiet rooms is capped at the
 *             typical-vs-bottom-decile ratio ("refuse amplification of
 *             unmeasurable rooms," §8).
 * Empty/immeasurable corpus → neutral pins (1, 1): g = 1 everywhere, i.e.
 * raw v3 behavior until rooms exist to measure.
 * The exact statistics (median / p10) are flagged OWNER-RATIFY(§18.1-style):
 * the plan pins WHERE the constants live (per-lane, per-epoch, measured),
 * not the quantile choices.
 */
export function deriveLaneConstants(activities: number[]): {
  constants: LaneCalibrationConstants;
  derivation: Record<string, unknown>;
} {
  const measured = activities
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!measured.length) {
    return {
      constants: { aRef: 1, aFloor: 1 },
      derivation: {
        statistic: 'empty-corpus-neutral',
        sampleSize: 0,
      },
    };
  }
  const quantile = (p: number): number => {
    const idx = (measured.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return measured[lo] + (measured[hi] - measured[lo]) * (idx - lo);
  };
  const aRef = quantile(0.5);
  const aFloor = Math.min(quantile(0.1), aRef);
  return {
    constants: { aRef, aFloor },
    derivation: {
      statistic: 'aRef=median(A>0); aFloor=p10(A>0) — OWNER-RATIFY quantiles',
      sampleSize: measured.length,
      sample: measured.map((value) => Number(value.toPrecision(6))),
    },
  };
}

/**
 * g for one source in one lane. A === null means the mention could not be
 * attributed to any source row (legacy provenance hole / unknown room):
 * g = 1 — refuse ALL amplification of a room that cannot be measured
 * (§8's clamp sentence taken to its limit), preserving raw v3 weight.
 */
export function gFor(
  activity: number | null,
  constants: LaneCalibrationConstants,
): number {
  if (activity === null) {
    return 1;
  }
  const ref = constants.aRef > 0 ? constants.aRef : 1;
  return Math.max(activity, constants.aFloor) / ref;
}

/** Resolved per-lane lookup handed to the scorer. */
export interface CalibrationIndex {
  lane: CalibrationLane;
  constants: LaneCalibrationConstants;
  /** g per sourceId; unknown sourceId / null source → 1 (see gFor). */
  gBySourceId: ReadonlyMap<string, number>;
  /** §8 sourceClassInfluence: per platform class, default 1.0. */
  influenceByPlatform: Readonly<Record<string, number>>;
}

export function buildCalibrationIndex(
  lane: CalibrationLane,
  constants: LaneCalibrationConstants,
  sources: SourceActivity[],
  influenceByPlatform: Record<string, number> = {},
): CalibrationIndex {
  const gBySourceId = new Map<string, number>();
  for (const source of sources) {
    gBySourceId.set(source.sourceId, gFor(source.activity[lane], constants));
  }
  return { lane, constants, gBySourceId, influenceByPlatform };
}

/** A neutral index (g = 1, influence 1.0): calibrated math == raw v3. */
export function neutralCalibrationIndex(
  lane: CalibrationLane,
): CalibrationIndex {
  return {
    lane,
    constants: { aRef: 1, aFloor: 1 },
    gBySourceId: new Map(),
    influenceByPlatform: {},
  };
}

export function calibrationG(
  index: CalibrationIndex,
  sourceId: string | null,
): number {
  if (sourceId === null) {
    return 1;
  }
  return index.gBySourceId.get(sourceId) ?? 1;
}

export function calibrationInfluence(
  index: CalibrationIndex,
  platform: string | null,
): number {
  if (platform === null) {
    return 1;
  }
  return index.influenceByPlatform[platform] ?? 1;
}
