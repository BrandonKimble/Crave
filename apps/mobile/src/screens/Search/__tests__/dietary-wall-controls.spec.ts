import { normalizeDietary, resolveDietaryControls } from '../dietary-controls';
import {
  areDietarySetsEqual,
  canonicalDietary,
} from '../runtime/shared/search-desired-state-contract';

// A dietary wall is the one filter that can legitimately empty a result set.
// That makes "the wall is in force but nothing on screen can release it" the
// failure mode worth spending a test on — each case below is a way the user
// could previously get walled with no way out.

describe('dietary wall controls', () => {
  it('gives an active wall a control even when the vocabulary does not know it', () => {
    // Offline first launch (fetch returned []) or an attribute retired by
    // curation after the user persisted it.
    const controls = resolveDietaryControls([], ['gluten free']);
    expect(controls).toEqual([{ name: 'gluten free', label: 'Gluten Free' }]);
  });

  it('does not duplicate a wall the vocabulary already covers', () => {
    const options = [{ name: 'vegan', label: 'Vegan' }];
    expect(resolveDietaryControls(options, ['vegan'])).toBe(options);
  });

  it('normalizes a corrupt persisted blob instead of carrying junk into the lens', () => {
    expect(normalizeDietary(['  VEGAN ', 'vegan', 7, null, ''])).toEqual(['vegan']);
    expect(normalizeDietary('vegan')).toEqual([]);
  });

  it('treats tap order and repetition as the same set of walls', () => {
    expect(areDietarySetsEqual(['vegan', 'halal'], ['halal', 'vegan'])).toBe(true);
    expect(areDietarySetsEqual(['vegan'], ['vegan', 'halal'])).toBe(false);
    expect(canonicalDietary(['vegan', 'halal', 'vegan'])).toEqual(['halal', 'vegan']);
  });
});
