import {
  KeywordSliceSelectionService,
  KeywordTermCandidate,
  KeywordSlice,
  UNMET_FLOOR_FRACTION,
  EXPLORE_FLOOR_FRACTION,
} from './keyword-slice-selection.service';

/**
 * §11 portfolio specs: TWO floors only — unmet + explore FRACTIONS of each
 * dispatch (K2 priors, OWNER-RATIFY §18.1) — with refresh + demand competing
 * for all remaining capacity via WITHIN-FAMILY percentile normalization
 * (cross-family weights do not exist). Floors guarantee attention when real
 * candidates exist; slack returns to the competitive pool.
 */

function makeCandidates(
  slice: KeywordSlice,
  count: number,
  scoreOf: (index: number) => number,
): KeywordTermCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    term: `${slice}-${index}`,
    normalizedTerm: `${slice}-${index}`,
    slice,
    score: scoreOf(index),
  }));
}

function buildService(): KeywordSliceSelectionService {
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return new KeywordSliceSelectionService(
    {} as never,
    {} as never,
    {} as never,
    logger as never,
  );
}

type Selection = {
  selected: KeywordTermCandidate[];
  selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
};

function select(
  candidatesBySlice: Partial<Record<KeywordSlice, KeywordTermCandidate[]>>,
  maxTerms = 25,
): Selection {
  const service = buildService() as unknown as {
    selectWithFloorsAndCompetition(params: {
      candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]>;
      floors: { unmet: number; explore: number };
      maxTerms: number;
    }): Selection;
  };
  return service.selectWithFloorsAndCompetition({
    candidatesBySlice: {
      unmet: [],
      refresh: [],
      demand: [],
      explore: [],
      ...candidatesBySlice,
    },
    floors: {
      unmet: Math.round(UNMET_FLOOR_FRACTION * maxTerms),
      explore: Math.round(EXPLORE_FLOOR_FRACTION * maxTerms),
    },
    maxTerms,
  });
}

describe('§11 portfolio floors + competition', () => {
  it('the two floors are FRACTIONS of the dispatch', () => {
    expect(Math.round(UNMET_FLOOR_FRACTION * 25)).toBe(5);
    expect(Math.round(EXPLORE_FLOOR_FRACTION * 25)).toBe(2);
  });

  it('unmet and explore get their floor slots even against a flood of refresh/demand', () => {
    const result = select({
      unmet: makeCandidates('unmet', 10, () => 5),
      explore: makeCandidates('explore', 10, () => 0.9),
      refresh: makeCandidates('refresh', 100, () => 0.99),
      demand: makeCandidates('demand', 100, () => 99),
    });
    expect(result.selected).toHaveLength(25);
    expect(result.selectedBySlice.unmet).toHaveLength(5);
    expect(result.selectedBySlice.explore).toHaveLength(2);
  });

  it('refresh + demand compete by within-family PERCENTILE, not raw score units', () => {
    // demand scores are ~100x refresh scores; percentile normalization must
    // interleave the families instead of letting demand sweep every slot.
    const result = select({
      refresh: makeCandidates('refresh', 40, (index) => 0.9 - index * 0.01),
      demand: makeCandidates('demand', 40, (index) => 90 - index),
    });
    expect(result.selectedBySlice.refresh.length).toBeGreaterThanOrEqual(10);
    expect(result.selectedBySlice.demand.length).toBeGreaterThanOrEqual(10);
    expect(result.selected).toHaveLength(25);
  });

  it('floor slack returns to the competitive pool (floors never manufacture busywork)', () => {
    const result = select({
      unmet: makeCandidates('unmet', 1, () => 5), // 4 unmet slots go unused
      demand: makeCandidates('demand', 100, () => 10),
    });
    expect(result.selectedBySlice.unmet).toHaveLength(1);
    expect(result.selected).toHaveLength(25);
    expect(result.selectedBySlice.demand).toHaveLength(24);
  });

  it('floor families backfill remaining capacity when competitive families are thin (floors are minimums, not caps)', () => {
    const result = select({
      unmet: makeCandidates('unmet', 20, () => 5),
      demand: makeCandidates('demand', 2, () => 10),
    });
    expect(result.selected).toHaveLength(22);
    expect(result.selectedBySlice.unmet).toHaveLength(20);
  });

  it('sub-quality candidates never fill a floor (score gates hold)', () => {
    const result = select({
      unmet: makeCandidates('unmet', 5, () => 0.5), // below unmet min score 1
      demand: makeCandidates('demand', 10, () => 10),
    });
    expect(result.selectedBySlice.unmet).toHaveLength(0);
    expect(result.selectedBySlice.demand).toHaveLength(10);
  });
});
