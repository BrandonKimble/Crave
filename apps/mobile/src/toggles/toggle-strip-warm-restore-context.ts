/**
 * Warm-restore wiring between the ToggleStrip engine and its control citizens
 * (leaf module — imported by both `ToggleStrip` and `SegmentedToggle`, so neither
 * imports the other).
 *
 * The engine owns the per-surface layout cache (`toggle-strip-layout-cache.ts`).
 * Controls with internal measured geometry (the pill's segment rects) self-seed and
 * self-report through THIS context, keyed by their hole-slot key — the strip wraps
 * every child in a `StripHoleSlot`, which provides that key via
 * `ToggleStripSlotKeyContext`. No consumer writes join code (the old bespoke
 * SearchFilters shell+segment join is deleted).
 */

import React from 'react';

import type { ToggleStripControlRect } from './toggle-strip-layout-cache';

export type ToggleStripWarmRestore = {
  /** First-render seed for a control's measured geometry (from the surface cache). */
  readControlSeed: (slotKey: string) => readonly (ToggleStripControlRect | undefined)[] | undefined;
  /** Live geometry report — the engine folds it into the surface cache. */
  reportControlLayouts: (
    slotKey: string,
    layouts: readonly (ToggleStripControlRect | undefined)[]
  ) => void;
};

export const ToggleStripWarmRestoreContext = React.createContext<ToggleStripWarmRestore | null>(
  null
);

export const ToggleStripSlotKeyContext = React.createContext<string | null>(null);
