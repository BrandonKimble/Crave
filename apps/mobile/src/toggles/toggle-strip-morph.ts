/**
 * ACTION-ROW MORPH MATH (strip engine — plans/toggle-strip-rebuild-ledger.md;
 * design: plans/favorites-edit-mode-ideal.md decision 1; distance corrected leg 4).
 *
 * Pure, worklet-safe geometry for the strip's first-class action-row slot. The morph
 * itself is owned by `ToggleStrip` (one implementation; the two hand-rolled panel
 * morphs were its delete-list, executed leg 3); this module keeps the math jest-able.
 *
 * THE GEOMETRY (leg-4 correction): the exit translation is applied to the CLIPPED
 * VIEWPORT CONTAINER — the full-band-width wrapper around the strip's horizontal
 * ScrollView — and the band clips at `overflow: 'hidden'`. Translating that container
 * by exactly one viewport width moves the whole visible window past the band's right
 * edge: fully exited, by construction, regardless of content width or scroll offset.
 * The "exit from the LIVE scroll position" property is a property of WHAT translates
 * (the container carries its inner scroll offset with it — the row departs showing
 * exactly the controls the user was looking at), not of the distance. The ideal-doc
 * formula `viewportWidth + (contentWidth − scrollX)` described translating the CONTENT
 * inside a fixed window; applied to the container it only made exit SPEED scale with
 * content width (a long strip zipped out disproportionately fast against the action
 * row's one-viewport entry). Corrected: both rows traverse exactly one viewport width
 * over the same progress, so exit and entry speeds match.
 *
 * - TOGGLE ROW exit: `translateX = progress × viewportWidth`.
 * - ACTION ROW entry (static chrome sliding in from the left):
 *   `translateX = (progress − 1) × viewportWidth` (offscreen-left at 0, seated at 1).
 */

export const resolveToggleRowExitDistance = ({
  viewportWidth,
}: {
  viewportWidth: number;
}): number => {
  'worklet';
  if (!(viewportWidth > 0)) {
    return 0;
  }
  return viewportWidth;
};

export const resolveActionRowEnterTranslateX = ({
  actionProgress,
  viewportWidth,
}: {
  actionProgress: number;
  viewportWidth: number;
}): number => {
  'worklet';
  return (actionProgress - 1) * viewportWidth;
};
