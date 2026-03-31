export const TRIPLE_DIGIT_RANK_MIN = 100;
export const FOUR_DIGIT_RANK_MIN = 1000;
export const TRIPLE_DIGIT_RANK_FONT_SIZE_DELTA = 2;

export const getRankFontSize = (baseFontSize: number, rank: number): number =>
  rank >= TRIPLE_DIGIT_RANK_MIN ? baseFontSize - TRIPLE_DIGIT_RANK_FONT_SIZE_DELTA : baseFontSize;

export const formatRankLabel = (rank: number): string =>
  rank >= FOUR_DIGIT_RANK_MIN ? `${Math.floor(rank / FOUR_DIGIT_RANK_MIN)}k+` : String(rank);
