// Refit layer 2 — match highlighting (plans/suggest-ideal-shape.md): the split
// contract for bolding the predictive completion in suggestion rows.
import {
  hasSuggestionMatchSegments,
  splitSuggestionMatchSegments,
} from './suggestion-match-highlight';

describe('splitSuggestionMatchSegments', () => {
  it('prefix match: typed span first, completion after', () => {
    expect(splitSuggestionMatchSegments('pi', 'pizza')).toEqual([
      { text: 'pi', isMatch: true },
      { text: 'zza', isMatch: false },
    ]);
  });

  it('mid-word match: completion on both sides of the typed span', () => {
    expect(splitSuggestionMatchSegments('pic', 'spicy')).toEqual([
      { text: 's', isMatch: false },
      { text: 'pic', isMatch: true },
      { text: 'y', isMatch: false },
    ]);
  });

  it('no match: one non-match segment (fuzzy/semantic rows get no bolding split)', () => {
    const segments = splitSuggestionMatchSegments('sushi', 'pizza');
    expect(segments).toEqual([{ text: 'pizza', isMatch: false }]);
    expect(hasSuggestionMatchSegments(segments)).toBe(false);
  });

  it('case-insensitive: match found across casing, original casing preserved', () => {
    expect(splitSuggestionMatchSegments('TAC', 'Tacos El Rey')).toEqual([
      { text: 'Tac', isMatch: true },
      { text: 'os El Rey', isMatch: false },
    ]);
  });

  it('multiple occurrences: every non-overlapping occurrence is a match segment', () => {
    expect(splitSuggestionMatchSegments('an', 'banana pancake')).toEqual([
      { text: 'b', isMatch: false },
      { text: 'an', isMatch: true },
      { text: 'an', isMatch: true },
      { text: 'a p', isMatch: false },
      { text: 'an', isMatch: true },
      { text: 'cake', isMatch: false },
    ]);
  });

  it('empty query: whole text as one non-match segment', () => {
    const segments = splitSuggestionMatchSegments('   ', 'pizza');
    expect(segments).toEqual([{ text: 'pizza', isMatch: false }]);
    expect(hasSuggestionMatchSegments(segments)).toBe(false);
  });

  it('whole-text match: one match segment, nothing bold', () => {
    const segments = splitSuggestionMatchSegments('pizza', 'Pizza');
    expect(segments).toEqual([{ text: 'Pizza', isMatch: true }]);
    expect(hasSuggestionMatchSegments(segments)).toBe(true);
  });

  it('empty display text: no segments', () => {
    expect(splitSuggestionMatchSegments('pi', '')).toEqual([]);
  });

  it('accent-folded: unaccented query highlights accented text, original preserved', () => {
    expect(splitSuggestionMatchSegments('cafe', 'Café du Monde')).toEqual([
      { text: 'Café', isMatch: true },
      { text: ' du Monde', isMatch: false },
    ]);
  });

  it('accent-folded both ways: accented query highlights unaccented text', () => {
    expect(splitSuggestionMatchSegments('café', 'Cafe Deluxe')).toEqual([
      { text: 'Cafe', isMatch: true },
      { text: ' Deluxe', isMatch: false },
    ]);
  });

  it('mixed accents mid-word: jalapeno finds jalapeño with exact index mapping', () => {
    expect(splitSuggestionMatchSegments('jalapeno', 'Spicy Jalapeño Poppers')).toEqual([
      { text: 'Spicy ', isMatch: false },
      { text: 'Jalapeño', isMatch: true },
      { text: ' Poppers', isMatch: false },
    ]);
  });

  it('emoji/astral text never corrupts segment boundaries', () => {
    expect(splitSuggestionMatchSegments('taco', '🌮 Taco Truck')).toEqual([
      { text: '🌮 ', isMatch: false },
      { text: 'Taco', isMatch: true },
      { text: ' Truck', isMatch: false },
    ]);
  });
});
