export type CraveScoreSubjectType = 'restaurant' | 'connection';

export interface PublicCraveScoreConfig {
  scoreVersion: string;
  displayCurveVersion: string;
  displayMin: number;
  displayMax: number;
  // display-distribution SHAPE. null = uniform (score = percentile, linear). A number = the std of a
  // truncated-normal bell, so the displayed-score distribution is bell-shaped (most places mid,
  // extremes rare); ~2.5 = a gentle bell, larger = flatter/closer to uniform. Ranking is identical
  // either way — this is a pure presentation reshape on the percentile substrate.
  bellK: number | null;
  // restaurant composite: discounted dish-acclaim + by-name praise
  discountRho: number; // geometric discount on sorted dish scores (peak↔breadth dial)
  dishWeight: number; // weight on the discounted dish-acclaim term
  praiseWeight: number; // weight on the restaurant-level praise term
  // per-endorsement weight when pooling in `endorse`: a written mention (Reddit comment / poll
  // comment) counts as 1; an upvote / poll-like counts as `upvoteWeight` — a gentle premium for the
  // conviction + origination of writing, while still counting agreement as a strong signal.
  upvoteWeight: number;
  // Pooled-mass compression in `endorse`. 'log1p' (v3-era default) was born
  // BEFORE the one-ballot floor, when 2,125-upvote applause posts needed
  // brute taming; with the floor doing that job at the source, gentler
  // curves become viable — 'sqrt' preserves breadth-of-support gaps that
  // log crushes (20 votes vs 200: log 3.0→5.3, sqrt 4.5→14.1). Probe dial;
  // any live change rides a calibration epoch.
  compression?: 'log1p' | 'sqrt';
  // Restaurant-level aggregation. 'structured' (default) = discounted
  // dish-acclaim + weighted praise (two aggregation laws for one kind of
  // endorsement — the SP-vs-Uchi asymmetry). 'one-pool' = a restaurant's
  // endorsement is compress(EVERY decayed ballot naming it, dish-directed
  // and place-directed alike): one person one ballot, one law, no
  // praiseWeight/rho at the restaurant level. Dish structure still builds
  // each DISH's own score. Probe dial; live change rides a calibration
  // epoch.
  pooling?: 'structured' | 'one-pool';
  // exponential decay half-life (days) applied to each mention by Reddit post date.
  // The STABLE/all-time axis. Doubles as the stable calibration lane's τ (§8).
  endorsementHalfLifeDays: number;
  // fast half-life (days) for the recency-weighted second pass whose display delta
  // vs the stable pass is `rising`. Doubles as the fast calibration lane's τ (§8).
  risingHalfLifeDays: number;
  // §8 sourceClassInfluence: read-side multiplier per platform class,
  // DEFAULT 1.0 for every class — launch = a poll vote ≈ a Reddit mention;
  // the Reddit→polls transition happens by decay + accumulation. Only
  // deviations from 1.0 are listed here.
  sourceClassInfluence: Record<string, number>;
}

// One source room's decayed masses for a subject in a SINGLE lane (§8: the
// mention is calibrated by the g of ITS OWN source). sourceId null = the
// mention could not be attributed to a source row (unmeasurable room → g 1).
export interface SourceContribution {
  sourceId: string | null;
  platform: string | null;
  mentions: number; // decayed mention mass in this room
  upvotes: number; // decayed upvote mass in this room
}

// A dish (connection): its per-source endorsement, plus the restaurant it
// rolls up into. The caller supplies the stable or the fast lane's masses;
// scoreCandidates pools them as Σ influence·(m + upvoteWeight·u)/g, then log1p.
export interface DishCandidate {
  connectionId: string;
  placeId: string;
  contributions: SourceContribution[];
}

// A restaurant: its by-name endorsement (general praise / name mentions),
// per source room.
export interface PlaceCandidate {
  placeId: string;
  praiseContributions: SourceContribution[];
}

export interface CraveScoreCandidates {
  dishes: DishCandidate[];
  places: PlaceCandidate[];
}

export interface ScoredCraveSubject {
  subjectType: CraveScoreSubjectType;
  subjectId: string;
  /** §5 scoring provenance: the source with the dominant calibrated mass. */
  provenanceSourceId: string | null;
  endorsementRaw: number;
  percentileRank: number;
  // Un-rounded display value (displayMin..displayMax, i.e. 0..10). Carried so the dual
  // pass can diff stable vs fast WITHOUT the rounding that would make `rising` mushy.
  rawDisplay: number;
  displayScore: number; // rawDisplay rounded to 0.01 on the 0-10 scale (the visible all-time score)
  // Recent-vs-baseline point surge = rawDisplay(fast) − rawDisplay(stable), 3dp.
  // Set by the dual pass in rebuildAllScores; a single scoreCandidates() pass leaves it null.
  rising: number | null;
  factorTrace: Record<string, unknown>;
}
