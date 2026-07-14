import { create } from 'zustand';

import type { SharedValue } from 'react-native-reanimated';

import type { FavoriteListType } from '../../../services/favorite-lists';

/**
 * THE BOOKMARKS HOME CONTROL STATE (leg 3 — plans/toggle-strip-rebuild-ledger.md §5).
 *
 * listType / sortMode used to be useState inside BookmarksDataSurface — body-tree
 * state, which is why the strip was trapped inside the display:none-gated data
 * surface. With the strip on the persistent-header mount the controls are CHROME:
 * the header strip (chrome) writes here, the data surface (body) reads here.
 *
 * Wave-3 §1.1 (correcting the wave-2 misread): HOME EDIT MODE IS BACK — reordering
 * the LISTS THEMSELVES on the home page (list CONTENTS stay editable only inside a
 * list). The mode session itself is the useEditModeSession PRIMITIVE, declared by
 * the DATA SURFACE (whose effects fire); the surface publishes this EDIT SEAT so the
 * header strip (a separate chrome mount) can render the Edit chip + action row
 * against the live session. Same one-way law: the body writes the seat, the strip
 * reads it.
 */
export type BookmarksSortMode = 'recent' | 'custom';

export type BookmarksEditSeat = {
  isEditing: boolean;
  /** False when there is nothing to reorder (rows = 0) — the chip citizen exits. */
  canEnterEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** True once any edit dropped this session (§2.8 "Edit lists" label → undo/redo pill). */
  hasEverEdited: boolean;
  isSaving: boolean;
  /** The session primitive's morph progress — feeds ToggleStrip's actionProgress. */
  actionProgress: SharedValue<number>;
  enterEdit: () => void;
  cancelEdit: () => void;
  undo: () => void;
  redo: () => void;
  saveEdit: () => void;
};

export type BookmarksHomeControlsState = {
  listType: FavoriteListType;
  sortMode: BookmarksSortMode;
  editSeat: BookmarksEditSeat | null;
  setListType: (value: FavoriteListType) => void;
  setSortMode: (value: BookmarksSortMode) => void;
  setEditSeat: (seat: BookmarksEditSeat | null) => void;
};

export const useBookmarksHomeControlsStore = create<BookmarksHomeControlsState>((set) => ({
  listType: 'restaurant',
  sortMode: 'recent',
  editSeat: null,
  setListType: (value) => set({ listType: value }),
  setSortMode: (value) => set({ sortMode: value }),
  setEditSeat: (seat) => set({ editSeat: seat }),
}));
