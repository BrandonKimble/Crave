/**
 * The chin rule (F1465): five sites, four numbers, one home.
 *
 * These cases are the BEFORE arithmetic, spelled as the five call sites used to spell it —
 * so the extraction is provably behavior-preserving, and any future change to the shared
 * home has to come here and say so out loud.
 * RED recipe: change any constant or formula in overlay-sheet-chin-geometry.ts — the matching
 * case fails naming the old number.
 */
import {
  OVERLAY_CHIN_PADDING_BOTTOM,
  OVERLAY_CHIN_PADDING_TOP,
  OVERLAY_COMPOSE_CHIN_RESERVED_HEIGHT,
  OVERLAY_PUBLISH_CHIN_RESERVED_HEIGHT,
  resolveChinContentBottomPadding,
  resolveChinlessContentBottomPadding,
  resolveComposerBodyBasePaddingBottom,
} from './overlay-sheet-chin-geometry';

describe('overlay sheet chin geometry', () => {
  it('the chin BOX is one height for both chins (nine matching style properties)', () => {
    expect(OVERLAY_CHIN_PADDING_TOP).toBe(10);
    expect(OVERLAY_CHIN_PADDING_BOTTOM).toBe(12);
  });

  // The 88-vs-64 divergence is PRESERVED, not reconciled — the owner decision F1465 names.
  // Pinned here so it is a stated fact rather than two numbers nobody can see side by side.
  it('reserves the Publish chin at 88 and the compose chin at 64 (unreconciled, on purpose)', () => {
    expect(OVERLAY_PUBLISH_CHIN_RESERVED_HEIGHT).toBe(88);
    expect(OVERLAY_COMPOSE_CHIN_RESERVED_HEIGHT).toBe(64);
  });

  it('PollCreationPanel: expanded + insets.bottom + 88', () => {
    expect(
      resolveChinContentBottomPadding({
        expandedTop: 120,
        insetBottom: 34,
        chinReservedHeight: OVERLAY_PUBLISH_CHIN_RESERVED_HEIGHT,
      })
    ).toBe(120 + 34 + 88);
  });

  it('PollDetailPanel: expandedSnapTop + insets.bottom + 64', () => {
    expect(
      resolveChinContentBottomPadding({
        expandedTop: 120,
        insetBottom: 34,
        chinReservedHeight: OVERLAY_COMPOSE_CHIN_RESERVED_HEIGHT,
      })
    ).toBe(120 + 34 + 64);
  });

  it('MessagingPanels: expandedTop + max(insets.bottom, 12) — the flex-column composer', () => {
    expect(resolveComposerBodyBasePaddingBottom({ expandedTop: 120, insetBottom: 34 })).toBe(154);
    // A device with no home inset still gets a floor.
    expect(resolveComposerBodyBasePaddingBottom({ expandedTop: 120, insetBottom: 0 })).toBe(132);
    expect(resolveComposerBodyBasePaddingBottom({ expandedTop: 0, insetBottom: 8 })).toBe(12);
  });

  it('the chinless pair (polls feed + restaurant panel): max(insets.bottom + 48, 72)', () => {
    expect(resolveChinlessContentBottomPadding(34)).toBe(82);
    expect(resolveChinlessContentBottomPadding(0)).toBe(72);
    // The floor binds up to an inset of 24.
    expect(resolveChinlessContentBottomPadding(24)).toBe(72);
    expect(resolveChinlessContentBottomPadding(25)).toBe(73);
  });
});
