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
  // exponential decay half-life (days) applied to each mention by Reddit post date.
  // The STABLE/all-time axis.
  endorsementHalfLifeDays: number;
  // fast half-life (days) for the recency-weighted second pass whose display delta
  // vs the stable pass is `rising`.
  risingHalfLifeDays: number;
}

// A dish (connection): its own endorsement, plus the restaurant it rolls up into.
// `mentions`/`upvotes` are decayed masses for a SINGLE pass (the caller supplies the
// stable or the fast masses); pooled in `endorse` as mentions + upvoteWeight·upvotes.
export interface DishCandidate {
  connectionId: string;
  restaurantId: string;
  scoringMarketKey: string | null;
  mentions: number; // direct + support mention count (decayed)
  upvotes: number; // direct + support upvote mass (decayed)
}

// A restaurant: its by-name endorsement (general praise / name mentions).
export interface RestaurantCandidate {
  restaurantId: string;
  scoringMarketKey: string | null;
  praiseMentions: number;
  praiseUpvotes: number;
}

export interface CraveScoreCandidates {
  dishes: DishCandidate[];
  restaurants: RestaurantCandidate[];
}

export interface ScoredCraveSubject {
  subjectType: CraveScoreSubjectType;
  subjectId: string;
  scoringMarketKey: string | null;
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
