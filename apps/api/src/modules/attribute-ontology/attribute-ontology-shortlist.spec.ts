import { AttributeOntologyService } from './attribute-ontology.service';

/**
 * THE LEXICAL-RECALL FLOORS, AGAINST THE CASES THAT DERIVED THEM (F368).
 *
 * `trigramSim(...) >= 0.4` and the `length >= 3` token floor were bare numbers
 * in a method that cites a MEASURED figure for its other arm. They are
 * measured now — against the live vocabulary, 411 active restaurant_attribute
 * entities / 84,255 pairs on the local mirror, 2026-08-03 — and these are the
 * pairs the measurement turned on:
 *
 *  - at 0.4 the trigram arm admits 56 pairs, all real near-duplicates;
 *    at 0.5 it loses cocktails/serves cocktails and breakfast/serves
 *    breakfast, the exact collisions adjudication exists to catch.
 *  - the 3-character token floor is what stops 18 pairs joined by an English
 *    function word ('no frills'/'no cash', 'wine on tap'/'on a boat') from
 *    reaching the LLM as if they shared a concept.
 */
const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new AttributeOntologyService(
  {} as never,
  {} as never,
  {} as never,
  logger,
  {} as never, // merge door — unused by this spec
);

const trigram = (a: string, b: string): number =>
  (
    service as unknown as { trigramSim(a: string, b: string): number }
  ).trigramSim(a, b);
const sharesToken = (a: string, b: string): boolean =>
  (
    service as unknown as { sharesToken(a: string, b: string): boolean }
  ).sharesToken(a, b);

describe('trigram near-duplicate floor = 0.4 (measured)', () => {
  it.each([
    ['cocktails', 'serves cocktails'],
    ['breakfast', 'serves breakfast'],
    ['mexican', 'mexican owned'],
    ['korean', 'korean bbq'],
    ['delivery', 'free delivery'],
    ['parking', 'valet parking'],
    ['food truck', 'food truck park'],
  ])('admits the real near-duplicate %s / %s', (a, b) => {
    expect(trigram(a, b)).toBeGreaterThanOrEqual(0.4);
  });

  it.each([
    ['ramen', 'wine bar'],
    ['live music', 'outdoor seating'],
    ['third wave', 'indoor play area'],
  ])('refuses the unrelated pair %s / %s', (a, b) => {
    expect(trigram(a, b)).toBeLessThan(0.4);
  });

  it('a floor of 0.5 would lose the collisions adjudication exists for', () => {
    // The measurement, asserted: raising the floor is not a free tightening.
    expect(trigram('cocktails', 'serves cocktails')).toBeLessThan(0.55);
    expect(trigram('breakfast', 'serves breakfast')).toBeLessThan(0.55);
  });
});

describe('significant-token length = 3 (measured)', () => {
  it.each([
    ['no frills', 'no cash'],
    ['no tipping', 'no reservations'],
    ['wine on tap', 'on a boat'],
    ['dine in', 'hole in the wall'],
    ['walk-up', 'holiday pop up'],
  ])('a shared FUNCTION WORD is not a shared concept: %s / %s', (a, b) => {
    expect(sharesToken(a, b)).toBe(false);
  });

  it.each([
    ['korean bbq', 'korean fried chicken'],
    ['valet parking', 'free parking'],
    ['rooftop bar', 'rooftop patio'],
  ])('a shared CONTENT word still recalls: %s / %s', (a, b) => {
    expect(sharesToken(a, b)).toBe(true);
  });
});
