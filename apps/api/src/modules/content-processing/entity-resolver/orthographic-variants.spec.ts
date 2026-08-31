import { canonicalFold } from './entity-identity';
import {
  hasOrthographicTrigger,
  orthographicVariants,
} from './orthographic-variants';

describe('orthographicVariants — the closed &↔and class', () => {
  it('mints the "and" retyping for an & name (the Salt & Time gap)', () => {
    expect(orthographicVariants('Salt & Time')).toContain('Salt and Time');
  });

  it('the variant actually bridges the fold gap the audit measured', () => {
    // Typed "salt and time" folds to `salt and time`; the stored name folds
    // to `salt time`. The variant row carries the fold the user produces.
    const [variant] = orthographicVariants('Salt & Time');
    expect(canonicalFold(variant)).toBe(canonicalFold('salt and time'));
    expect(canonicalFold('Salt & Time')).not.toBe(
      canonicalFold('salt and time'),
    );
  });

  it('handles glued ampersands', () => {
    expect(orthographicVariants('Ham&Eggs')).toContain('Ham and Eggs');
  });

  it('mints the & retyping for an "and" name (reverse direction)', () => {
    expect(orthographicVariants('Salt and Time')).toContain('Salt & Time');
  });

  it('does NOT touch "and" embedded inside a word', () => {
    // "Andy's Sandwiches" contains no word-bounded "and": nothing to mint.
    expect(orthographicVariants("Andy's Sandwiches")).toEqual([]);
    expect(hasOrthographicTrigger("Andy's Sandwiches")).toBe(false);
  });

  it('emits nothing for a form with no trigger', () => {
    expect(orthographicVariants('Uchi')).toEqual([]);
    expect(hasOrthographicTrigger('Uchi')).toBe(false);
  });

  it('never emits a variant whose fold equals the original (no-op rows)', () => {
    for (const name of ['Salt & Time', 'Fish and Chips Co', 'A&W']) {
      const base = canonicalFold(name);
      for (const variant of orthographicVariants(name)) {
        expect(canonicalFold(variant)).not.toBe(base);
      }
    }
  });

  it('is idempotent under its own output (variant of variant returns home)', () => {
    const variants = orthographicVariants('Salt & Time');
    expect(orthographicVariants(variants[0])).toContain('Salt & Time');
  });
});
