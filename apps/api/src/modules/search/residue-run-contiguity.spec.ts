import { analyzeQuery } from '../entity-text-search/query-analyzer';
import {
  buildResidueRuns,
  type ResidueToken,
} from './search-query-interpretation.service';

/**
 * NEGATION V2 — LITERAL IGNORE (plan §12b). A cue word ("no", "sin",
 * "không") is an ORDINARY word to every lexical consumer: residue runs,
 * probes, the unresolved report, the on-demand collection ask, staging.
 * The ONLY place a cue is removed is the dense-embed input.
 *
 * These tests pin the shape the old covered()-marking broke: a mid-query
 * cue SPLIT one residue run into two, and a cue inside a NAME vanished
 * from the discovery ask ("No Name Burgers" → "Name Burgers").
 */
const toTokens = (query: string): ResidueToken[] =>
  analyzeQuery(query, null).tokens.map((t) => ({
    text: t.raw,
    start: t.start,
    end: t.end,
    separator: t.separator,
  }));

const runsFor = (query: string, groundedTexts: string[] = []) => {
  const spans = groundedTexts.map((text) => {
    const start = query.toLowerCase().indexOf(text.toLowerCase());
    return { start, end: start + text.length };
  });
  const covered = (t: { start: number; end: number }) =>
    spans.some((g) => g.start <= t.start && g.end >= t.end);
  return buildResidueRuns(toTokens(query), covered).map((r) => r.text);
};

describe('residue runs treat negation cues as ordinary words', () => {
  it('does not split a run at a mid-query cue — "no" behaves like "and"', () => {
    expect(runsFor('khachapuri no adjika')).toEqual(['khachapuri no adjika']);
    expect(runsFor('khachapuri no adjika')).toEqual(
      runsFor('khachapuri and adjika').map((t) => t.replace(' and ', ' no ')),
    );
  });

  it('keeps a cue word that lives inside a NAME — "No Name Burgers"', () => {
    // The discovery lane must be able to learn a cue-worded restaurant name.
    expect(runsFor('No Name Burgers')).toEqual(['No Name Burgers']);
  });

  it('keeps the cue in every language pack, not just English', () => {
    expect(runsFor('ramen sin cerdo')).toEqual(['ramen sin cerdo']);
    expect(runsFor('pho khong thit')).toEqual(['pho khong thit']);
  });

  it('still splits on GROUNDED coverage — the only contiguity authority', () => {
    expect(runsFor('brekfast tacos zzz', ['tacos'])).toEqual([
      'brekfast',
      'zzz',
    ]);
  });

  it('joins an unspaced CJK run with its own separator', () => {
    expect(runsFor('麻辣牛肉面').join('|')).not.toContain(' ');
  });

  it('asks on-demand for the RUN, never its characters (CJK addendum)', () => {
    // The unknown term in an unspaced query is the contiguous run. Treating
    // each sub-token as its own residue run sent 不, 要, 香 — three single
    // characters, none of them a food concept — to discovery.
    expect(runsFor('不要香菜的牛肉面')).toEqual(['不要香菜的牛肉面']);
    // Grounding a span splits the run exactly there, and the two halves
    // stay whole.
    expect(runsFor('不要香菜的牛肉面', ['牛肉面'])).toEqual(['不要香菜的']);
    expect(runsFor('牛肉面不要香菜', ['牛肉面'])).toEqual(['不要香菜']);
  });
});
