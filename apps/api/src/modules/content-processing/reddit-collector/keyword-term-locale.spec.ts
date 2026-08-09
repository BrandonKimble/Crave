import {
  KeywordSliceSelectionService,
  KeywordTermCandidate,
  KeywordSliceSelectionStats,
} from './keyword-slice-selection.service';

/**
 * GENERICNESS IS A CLAIM ABOUT A LANGUAGE, AND THE TERM NOW CARRIES ONE.
 *
 * Step 3 taught `stripGenericTokens` a locale and left the keyword lane's two
 * call sites resolving to English, because a keyword candidate carried no
 * language to give them. It does now (the unmet slice reads
 * `signals.detected_locale` through `territoryUnmetAsks`), and this file is
 * what makes that visible: 'top' is an English filler word and a REAL
 * Vietnamese word (top/tốp), so an English reading of a Vietnamese ask drops
 * the whole term from the cycle — the user's word is never collected, and the
 * only trace is a `generic_only_keyword` gate reject.
 */
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
    {} as never,
    { emit: jest.fn() } as never,
    logger as never,
  );
}

function emptyStats(): KeywordSliceSelectionStats {
  const zeroBySlice = { unmet: 0, refresh: 0, demand: 0, explore: 0 };
  return {
    candidatesBySlice: { ...zeroBySlice },
    eligibleBySlice: { ...zeroBySlice },
    selectedBySlice: { ...zeroBySlice },
    dropped: { invalid: 0, belowExpectedNew: 0, deduped: 0 },
  };
}

function filter(candidate: KeywordTermCandidate): KeywordTermCandidate[] {
  const service = buildService() as unknown as {
    normalizeAndFilterCandidates(
      candidates: KeywordTermCandidate[],
      stats: KeywordSliceSelectionStats,
    ): KeywordTermCandidate[];
  };
  return service.normalizeAndFilterCandidates([candidate], emptyStats());
}

function unmet(term: string, locale: string | null): KeywordTermCandidate {
  return { term, normalizedTerm: '', slice: 'unmet', score: 1, locale };
}

describe('keyword candidates strip generic tokens IN THEIR OWN LANGUAGE', () => {
  it('keeps a VIETNAMESE ask whose whole text is an English filler word', () => {
    // English reading: 'top' is generic-only -> the term is dropped and
    // r/... is never searched for it. Vietnamese reading: it is the ask.
    expect(filter(unmet('top', 'vi')).map((c) => c.term)).toEqual(['top']);
  });

  it('still strips the English filler out of an ENGLISH ask', () => {
    expect(filter(unmet('best tacos', 'en')).map((c) => c.term)).toEqual([
      'tacos',
    ]);
  });

  it('leaves a SPANISH ask whole — no Spanish generic vocabulary is authored, so nothing may be judged generic in it', () => {
    // Deliberately NOT 'tacos': we hold no Spanish stop-list, and inventing
    // one is how a real word gets deleted. Under the English reading this
    // term passed through unchanged too — but only by luck, and 'top' above
    // is the case where that luck runs out.
    expect(filter(unmet('mejores tacos', 'es-MX')).map((c) => c.term)).toEqual([
      'mejores tacos',
    ]);
  });

  it('an UNDECIDABLE language reads as English — the untagged corpus, unchanged', () => {
    expect(filter(unmet('best tacos', null)).map((c) => c.term)).toEqual([
      'tacos',
    ]);
  });
});
