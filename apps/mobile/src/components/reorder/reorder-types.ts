import type React from 'react';

import type { SharedValue } from 'react-native-reanimated';

/**
 * Scroll adapter for edge auto-scroll (page-registry §8.14: dragging to the list's
 * top/bottom edge AUTO-SCROLLS the list). The reorder rows usually live inside a
 * scroll container they do not own (the shared sheet scroll), so the consumer hands
 * in a handle instead of the primitive reaching for a ref.
 *
 * `scrollOffset` MUST be the live UI-thread offset of that container — the drag math
 * reads it in a worklet to keep the lifted row pinned under the finger while the
 * container scrolls beneath it.
 */
export type ReorderScrollAdapter = {
  scrollOffset: SharedValue<number>;
  /** Imperative relative scroll; called on the JS thread at ~frame rate during edge hover. */
  scrollBy: (dy: number) => void;
};

export type ReorderRowRenderContext = {
  /** False for pinned rows (e.g. system default lists) — render them visually distinct. */
  isDraggable: boolean;
  /** True while THIS row is lifted. */
  isActiveDrag: boolean;
};

export type ReorderableRowsProps<T> = {
  items: readonly T[];
  keyExtractor: (item: T) => string;
  /** Uniform row height (px). The 60fps contract: slot math is `index * rowHeight` on the UI thread. */
  rowHeight: number;
  /**
   * The first N rows are PINNED: they sort first, get no handle, and the drag range
   * clamps below them (§8.11 wave note: system default lists are not draggable).
   */
  pinnedLeadingCount?: number;
  renderRowContent: (item: T, context: ReorderRowRenderContext) => React.ReactNode;
  /**
   * LIVE reorder callback — fired each time the lifted row crosses into a new slot
   * (and per-press in accessibility mode). Indexes are into `items` as currently
   * rendered; the consumer applies the move to its own state, which re-derives row
   * slots. The consumer's array is the single source of truth.
   */
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  /**
   * WCAG 2.5.7 non-drag path: rows render move-up / move-down / move-to-top buttons
   * instead of drag handles. The consumer toggles (e.g. from screen-reader state).
   */
  accessibilityMode?: boolean;
  scrollAdapter?: ReorderScrollAdapter | null;
  testIDPrefix?: string;
};
