import { EntityResolutionService } from './entity-resolution.service';

/**
 * F476: trigram similarity must be fold-aware. Before the fix it stripped
 * `[^a-z0-9]`, erasing every non-ASCII character — so a Cyrillic or CJK name
 * graded 0 against its own identical twin. These assertions show RED against
 * that code: `Пельменная` vs `Пельменная` returned 0, not 1.
 */
// The method is pure (uses no `this`) — invoke it off the prototype.
const trigram: (a: string, b: string) => number = (
  EntityResolutionService.prototype as unknown as {
    trigramSimilarity: (a: string, b: string) => number;
  }
).trigramSimilarity;

describe('trigramSimilarity is fold-aware (F476)', () => {
  it('an identical Cyrillic name scores 1, not 0', () => {
    expect(trigram('Пельменная', 'Пельменная')).toBe(1);
  });

  it('an identical CJK name scores 1, not 0', () => {
    expect(trigram('食べ放題', '食べ放題')).toBe(1);
  });

  it('distinct Cyrillic names score between 0 and 1 (not a constant 0)', () => {
    const score = trigram('Пельменная', 'Шашлычная');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });

  it('still works for ASCII (tex-mex == tex mex via the fold)', () => {
    expect(trigram('tex-mex', 'tex mex')).toBe(1);
  });
});
