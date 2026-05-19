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
  displayCenter: number;
  displayScale: number;
  marketReliabilityK: number;
  entityConfidenceK: number;
  entityConfidencePower: number;
  robustSpreadFloor: number;
  pollAlpha: number;
  pollConfidenceK: number;
  directMentionWeight: number;
  upvoteMassWeight: number;
  sourceBreadthWeight: number;
  pollSignalWeight: number;
  pollBreadthWeight: number;
  supportMentionWeight: number;
}

export interface CraveScoreCandidate {
  subjectType: CraveScoreSubjectType;
  subjectId: string;
  scoringMarketKey: string | null;
  rawQualityScore: number;
  directMentionCount: number;
  supportMentionCount: number;
  upvoteMass: number;
  sourceDocumentCount: number;
  pollCount: number;
  pollVoteCount: number;
  distinctPollVoterCount: number;
  marketDistinctPollVoterCount?: number;
  pollSignal: number;
}

export interface ScoredCraveSubject extends CraveScoreCandidate {
  globalZ: number;
  marketZ: number | null;
  marketReliability: number;
  entityConfidence: number;
  normalizedSignal: number;
  posteriorSignal: number;
  displayScore: number;
  scoreDelta7d: number | null;
  scoreDelta28d: number | null;
  movementState: CraveScoreMovementState;
  factorTrace: Record<string, unknown>;
}

export interface CraveScoreMarketStat {
  subjectType: CraveScoreSubjectType;
  marketKey: string;
  eligibleSubjectCount: number;
  rawMedian: number;
  rawMad: number;
  rawIqr: number;
  rawSpread: number;
  globalMedian: number;
  globalSpread: number;
  marketReliability: number;
  evidenceSummary: Record<string, unknown>;
  factorTrace: Record<string, unknown>;
}
