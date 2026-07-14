import React from 'react';

import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { showAppModal } from '../components/app-modal-store';
import { publishEditSessionLive } from '../navigation/runtime/edit-session-liveness-contract';
import { registerHeaderCloseAction } from '../navigation/runtime/header-nav-action-registry';
import { isSessionDirty, type EditModeSessionState } from './edit-mode-session-core';
import { acquireOverlaySheetEditLock } from './overlaySheetEditLockRuntime';
import type { OverlayKey } from './types';

// ─── Edit-mode SESSION primitive (leg 10 step 6; charter §6 owner clarification) ─────────────
//
// The ONE declarable mode-session every reorder-editing surface uses — extracted from the
// hand-rolled ListDetail/Bookmarks copies the leg-9 proving ground flagged (primitive defect
// #2). A surface DECLARES the session; the primitive owns, uniformly:
//
//   • the pure order/history session (order · history · historyIndex; undo/redo; live
//     reorder; the settled-order dedupe on drop),
//   • CHILD-PAGE semantics while the session is live: the sheet edit LOCK (swipe-down
//     rubber-bands; token is per-entry so stacked entries of one scene each hold their own)
//     and the header X = CANCEL override (discard-confirm when the history has uncommitted
//     moves) on the sanctioned close-override lane,
//   • the action-row MORPH progress shared value (0 = toggle row, 1 = action row), timed
//     with the house strip-morph duration — feed it straight to ToggleStrip's actionProgress.
//
// Geometry stays with the surface: ListDetail declares 1-column variable-height rich rows
// (ReorderableRows variableHeights), Bookmarks' 2-column tile grid is the same declaration
// with grid geometry. Save/persistence also stays with the surface (the PATCH vocabulary is
// per-API); call `exit()` after a successful save.

const ACTION_ROW_MORPH_MS = 240;

export type EditModeSession = {
  /** True while the mode session is live. */
  isEditing: boolean;
  /** The live key order (null when not editing). The surface renders rows in this order. */
  order: readonly string[] | null;
  /** Enter the session with the baseline key order (also fires onEnter — e.g. sheet promote). */
  enter: (baselineOrder: readonly string[]) => void;
  /** End the session unconditionally (cancel or post-save). */
  exit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** True once ANY edit dropped this session (survives undo-to-baseline — §2.8 label→pill). */
  hasEverEdited: boolean;
  /** True when the history holds uncommitted moves (drives the discard-confirm). */
  isDirty: boolean;
  /** Live slot-crossing reorder (feed to the reorder primitive's onReorder). */
  handleReorder: (fromIndex: number, toIndex: number) => void;
  /** Accessibility-mode reorder: applies the move AND commits a history entry per press. */
  handleAccessibleReorder: (fromIndex: number, toIndex: number) => void;
  /** Drop = commit one history entry (feed to the reorder primitive's onDragStateChange). */
  handleDragStateChange: (isDragging: boolean) => void;
  /** 0→1 action-row morph progress — ToggleStrip's actionProgress input. */
  actionProgress: SharedValue<number>;
};

type UseEditModeSessionArgs = {
  /** The scene whose header X becomes CANCEL while the session is live. */
  sceneKey: OverlayKey;
  /** The route entry backing the surface — the edit-lock token is per-entry. */
  entryId: string | null;
  /** Fired on enter — the surface's promote verb (e.g. glide the sheet to top snap). */
  onEnter?: () => void;
  /** Discard-confirm copy (house defaults below). */
  discardTitle?: string;
  discardMessage?: string;
};

const applyMove = (order: readonly string[], from: number, to: number): string[] => {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const useEditModeSession = ({
  sceneKey,
  entryId,
  onEnter,
  discardTitle = 'Discard changes?',
  discardMessage = 'Your new order has not been saved.',
}: UseEditModeSessionArgs): EditModeSession => {
  const [session, setSession] = React.useState<EditModeSessionState | null>(null);
  const isEditing = session != null;

  const onEnterRef = React.useRef(onEnter);
  onEnterRef.current = onEnter;

  const enter = React.useCallback((baselineOrder: readonly string[]) => {
    const baseline = [...baselineOrder];
    setSession({ order: baseline, history: [baseline], historyIndex: 0 });
    onEnterRef.current?.();
  }, []);

  const exit = React.useCallback(() => {
    setSession(null);
  }, []);

  // Sheet edit LOCK while live — acquired from an effect so the cleanup releases on BOTH
  // session end and scene unmount. Token is PER-ENTRY: two live entries of one scene each
  // hold their own lock (a constant token would collide on first release).
  const editLockToken = `edit-mode:${sceneKey}:${entryId ?? 'root'}`;
  React.useEffect(() => {
    if (!isEditing) {
      return undefined;
    }
    return acquireOverlaySheetEditLock(editLockToken);
  }, [editLockToken, isEditing]);

  // Leg 9 — CHILD-PAGE liveness publication (wave-2 §2: "edit mode is a CHILD PAGE wherever it
  // lives"). While the session is live the PresentationFrame derives nav-out=true (the tab bar
  // leaves; no tab-switching mid-edit) and headerNavAction='close' (the plus rotates to the X,
  // which the close-override below answers as CANCEL) for this scene. On a role-child scene
  // (listDetail) the derivation is already true — the publication is a harmless no-op there.
  // Same effect lifecycle as the edit lock, so liveness can never outlive the session or the
  // surface unmount.
  React.useEffect(() => {
    if (!isEditing) {
      return undefined;
    }
    return publishEditSessionLive(sceneKey);
  }, [isEditing, sceneKey]);

  // Action-row morph progress (0 = toggle row, 1 = action row).
  const actionProgress = useSharedValue(0);
  React.useEffect(() => {
    actionProgress.value = withTiming(isEditing ? 1 : 0, { duration: ACTION_ROW_MORPH_MS });
  }, [actionProgress, isEditing]);

  // Header X = CANCEL while the session is live (discard-confirm when dirty) — the
  // sanctioned close-override lane search/restaurant session closes use.
  const sessionRef = React.useRef<EditModeSessionState | null>(session);
  sessionRef.current = session;
  React.useEffect(() => {
    if (!isEditing) {
      return undefined;
    }
    return registerHeaderCloseAction(sceneKey, () => {
      if (!isSessionDirty(sessionRef.current)) {
        exit();
        return;
      }
      showAppModal({
        title: discardTitle,
        message: discardMessage,
        actions: [
          { label: 'Keep editing', style: 'cancel' },
          { label: 'Discard', style: 'destructive', onPress: exit },
        ],
      });
    });
  }, [discardMessage, discardTitle, exit, isEditing, sceneKey]);

  const handleReorder = React.useCallback((fromIndex: number, toIndex: number) => {
    setSession((live) => {
      if (live == null || fromIndex === toIndex) {
        return live;
      }
      return { ...live, order: applyMove(live.order, fromIndex, toIndex) };
    });
  }, []);

  const commitHistoryEntry = React.useCallback(() => {
    setSession((live) => {
      if (live == null) {
        return live;
      }
      const settled = live.history[live.historyIndex];
      if (settled != null && settled.join(' ') === live.order.join(' ')) {
        return live;
      }
      const truncated = live.history.slice(0, live.historyIndex + 1);
      return {
        ...live,
        history: [...truncated, live.order],
        historyIndex: truncated.length,
      };
    });
  }, []);

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      if (isDragging) {
        return; // the edit lock pins the sheet — nothing to re-assert on lift
      }
      commitHistoryEntry();
    },
    [commitHistoryEntry]
  );

  const handleAccessibleReorder = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      handleReorder(fromIndex, toIndex);
      commitHistoryEntry();
    },
    [commitHistoryEntry, handleReorder]
  );

  const undo = React.useCallback(() => {
    setSession((live) => {
      if (live == null || live.historyIndex === 0) {
        return live;
      }
      const nextIndex = live.historyIndex - 1;
      return { ...live, historyIndex: nextIndex, order: live.history[nextIndex] };
    });
  }, []);

  const redo = React.useCallback(() => {
    setSession((live) => {
      if (live == null || live.historyIndex >= live.history.length - 1) {
        return live;
      }
      const nextIndex = live.historyIndex + 1;
      return { ...live, historyIndex: nextIndex, order: live.history[nextIndex] };
    });
  }, []);

  return {
    isEditing,
    order: session?.order ?? null,
    enter,
    exit,
    undo,
    redo,
    canUndo: session != null && session.historyIndex > 0,
    canRedo: session != null && session.historyIndex < session.history.length - 1,
    hasEverEdited: session != null && session.history.length > 1,
    isDirty: isSessionDirty(session),
    handleReorder,
    handleAccessibleReorder,
    handleDragStateChange,
    actionProgress,
  };
};
