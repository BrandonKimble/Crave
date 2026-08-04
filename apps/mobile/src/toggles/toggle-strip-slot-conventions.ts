/**
 * THE PER-SLOT STRIP CONVENTIONS (wave-3 §2.8) — ONE declaration.
 *
 * The ToggleStrip engine wraps each DIRECT child in a hole slot and reads three conventions
 * OFF THE ELEMENT to shape that slot. Because they travel as ordinary React props, every
 * participant has to agree on their spelling and every consumer has to SWALLOW them (a
 * convention prop forwarded to a native view is a React warning at best).
 *
 * F858 (2026-08-03): the engine declared this shape inline in a `child.props` cast and each
 * consumer re-declared it by hand — so a typo was silent on both sides (the engine simply
 * read `undefined`, and the slot rendered without the convention). There is now ONE type:
 * the engine casts to it, and every consumer component spreads it into its own props, which
 * makes a misspelled attribute an excess-property compile error at the JSX call site.
 *
 * NOT CHANGED (recorded deliberately): the finding also proposed a `stripSlot(props, node)`
 * helper the engine would recognize BY TYPE. That was not done — the engine's use of
 * `React.Children.toArray` cannot see through a component or fragment, a rule enforced only
 * by a leg-11 simulator RED (see EditModeActionRow's CONTRACT note). Changing how children
 * are identified needs that sim check, which is not available to a type-level pass.
 */
export type StripSlotConventionProps = {
  /** Window shape override — e.g. the undo/redo PILL cutout, radius 999. */
  stripHoleBorderRadius?: number;
  /**
   * The window fades white → clear when it appears mid-presentation: the engine mounts a
   * cover rect congruent with the fresh hole and animates it clear.
   */
  stripHoleFadeIn?: boolean;
  /** No window at all — plain chrome ON the white plate (e.g. the "Edit lists" label). */
  stripHoleDisabled?: boolean;
};
