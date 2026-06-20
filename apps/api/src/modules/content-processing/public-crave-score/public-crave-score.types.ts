export type CraveScoreSubjectType = 'restaurant' | 'connection';
export type CraveScoreMovementState =
  | 'rising'
  | 'cooling'
  | 'stable'
  | 'insufficient_history';

export interface PublicCraveScoreConfig {
  scoreVersion: string;
  displayCurveVersion: string;
  displayMin: number;
  displayMax: number;
  // dish (atomic) endorsement strength = mention/upvote log-weights
  dishMentionWeight: number;
  dishUpvoteWeight: number;
  // restaurant composite: discounted dish-acclaim + by-name praise
  discountRho: number; // geometric discount on sorted dish scores (peak↔breadth dial)
  dishWeight: number; // weight on the discounted dish-acclaim term
  praiseWeight: number; // weight on the restaurant-level praise term
  // exponential decay half-life (days) applied to each mention by Reddit post date
  endorsementHalfLifeDays: number;
}

// A dish (connection): its own endorsement, plus the restaurant it rolls up into.
export interface DishCandidate {
  connectionId: string;
  restaurantId: string;
  scoringMarketKey: string | null;
  mentions: number; // direct + support mention count
  upvotes: number; // direct + support upvote mass
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
  displayScore: number;
  scoreDelta7d: number | null;
  scoreDelta28d: number | null;
  movementState: CraveScoreMovementState;
  factorTrace: Record<string, unknown>;
}
