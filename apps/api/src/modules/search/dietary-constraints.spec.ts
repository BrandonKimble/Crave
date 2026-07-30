import {
  attributeIdsForStage,
  hasSoftAttributeIds,
} from './dietary-constraints';

const VEGAN = 'vegan-id';
const SPICY = 'spicy-id';
const PATIO = 'patio-id';
const dietary = new Set([VEGAN]);

/**
 * Dietary hardness (spec §1.3, owner-ratified). Each spec fails against the
 * pre-fix behavior, where every relaxation stage zeroed its whole bucket —
 * "spicy vegan tacos" going thin dropped VEGAN along with spicy, which for
 * a vegan user is a wrong answer, not degradation.
 */
describe('attributeIdsForStage', () => {
  it('a dropping stage keeps the dietary subset and sheds only soft ids', () => {
    const staged = attributeIdsForStage({
      stage: 'relaxed_food_attributes',
      foodAttributeIds: [VEGAN, SPICY],
      restaurantAttributeIds: [PATIO],
      dietaryIds: dietary,
    });
    expect(staged.foodAttributeIds).toEqual([VEGAN]);
    // The other bucket is untouched by this stage.
    expect(staged.restaurantAttributeIds).toEqual([PATIO]);
  });

  it('relaxed_modifiers drops both buckets but NEVER a dietary id', () => {
    const staged = attributeIdsForStage({
      stage: 'relaxed_modifiers',
      foodAttributeIds: [VEGAN, SPICY],
      restaurantAttributeIds: [PATIO, VEGAN],
      dietaryIds: dietary,
    });
    expect(staged.foodAttributeIds).toEqual([VEGAN]);
    expect(staged.restaurantAttributeIds).toEqual([VEGAN]);
  });

  it('strict drops nothing', () => {
    const staged = attributeIdsForStage({
      stage: 'strict',
      foodAttributeIds: [VEGAN, SPICY],
      restaurantAttributeIds: [PATIO],
      dietaryIds: dietary,
    });
    expect(staged.foodAttributeIds).toEqual([VEGAN, SPICY]);
    expect(staged.restaurantAttributeIds).toEqual([PATIO]);
  });
});

describe('hasSoftAttributeIds', () => {
  it('an all-dietary bucket has nothing to drop (no stage offered)', () => {
    // Offering a stage that drops nothing would re-execute the identical
    // query — probe waste at best, and the capability computation is what
    // keeps the ladder honest about it.
    expect(hasSoftAttributeIds([VEGAN], dietary)).toBe(false);
  });

  it('one soft id makes the bucket droppable', () => {
    expect(hasSoftAttributeIds([VEGAN, SPICY], dietary)).toBe(true);
  });

  it('an empty bucket has nothing to drop', () => {
    expect(hasSoftAttributeIds([], dietary)).toBe(false);
  });
});
