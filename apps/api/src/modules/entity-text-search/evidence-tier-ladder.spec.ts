import {
  EVIDENCE_TIER_LADDER,
  evidenceTierStrength,
} from './entity-text-search.service';
import { EVIDENCE_CONFIDENCE_FOR_TEST } from '../autocomplete/entity-search.service';

/**
 * ONE TIER TABLE (F582). The evidence-tier ORDER used to be restated in three
 * places; it now has a single home (EVIDENCE_TIER_LADDER) from which
 * autocomplete's ordinal strengths are DERIVED. What a derivation cannot cover
 * is the third table: entity-search's EVIDENCE_CONFIDENCE, whose values are
 * calibrated MAGNITUDES (bounded bands sized against the ≤1.35× popularity
 * boost) and therefore owner-set, not derivable. The design's requirement for
 * it is weaker but real: it must AGREE with the ladder's order.
 *
 * This spec is that agreement check — and it PINS the one place the two do not
 * agree today rather than hiding it. See the `contains` case below.
 */
describe('the evidence tier ladder is the single order (F582)', () => {
  it('derived ordinals are strictly decreasing down the ladder, tied within a group', () => {
    const groupStrengths = EVIDENCE_TIER_LADDER.map((group) => {
      const strengths = group.map((tier) => evidenceTierStrength(tier));
      // Every member of a group ties — that is what a group MEANS.
      expect(new Set(strengths).size).toBe(1);
      return strengths[0];
    });
    for (let i = 1; i < groupStrengths.length; i += 1) {
      expect(groupStrengths[i]).toBeLessThan(groupStrengths[i - 1]);
    }
  });

  it('a tier that is not on the ladder has no rank', () => {
    // 'weak' is deliberately absent (dropped from type-ahead), so it cannot
    // borrow a position by accident.
    expect(evidenceTierStrength('weak')).toBe(0);
  });

  it('EVIDENCE_CONFIDENCE agrees with the ladder order — with ONE pinned exception', () => {
    // The known, deliberate-looking divergence: the ladder ranks whole-word
    // containment ABOVE an FTS name/alias token match, while the confidence
    // bands rank name/alias (0.60) above contains (0.55). Both tables are
    // load-bearing and the magnitudes are owner-calibrated, so this is
    // RECORDED, not silently unified (see audit/FINDINGS.md F582).
    const KNOWN_DIVERGENCE = new Set(['contains|name', 'contains|alias']);

    const disagreements: string[] = [];
    const flat = EVIDENCE_TIER_LADDER.flatMap((group) => group);
    for (let i = 0; i < flat.length; i += 1) {
      for (let j = i + 1; j < flat.length; j += 1) {
        const higher = flat[i];
        const lower = flat[j];
        if (evidenceTierStrength(higher) === evidenceTierStrength(lower)) {
          continue; // a tie carries no order claim
        }
        const a = EVIDENCE_CONFIDENCE_FOR_TEST[higher];
        const b = EVIDENCE_CONFIDENCE_FOR_TEST[lower];
        if (a === undefined || b === undefined) {
          continue; // a tier the confidence table deliberately drops
        }
        if (!(a > b)) {
          disagreements.push(`${higher}|${lower}`);
        }
      }
    }
    expect(new Set(disagreements)).toEqual(KNOWN_DIVERGENCE);
  });
});
