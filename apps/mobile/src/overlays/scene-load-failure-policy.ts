import React from 'react';

import { announceFailureIfOnline } from '../components/app-modal-store';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { resolveSheetPostureSeat } from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';

// ─── THE SCENE LOAD-FAILURE LAW (wave-4 §1; owner spec 2026-07-08, finally wired) ────────────
//
// One failure behavior for EVERY screen, current and future, inherited through
// SceneBodyReadyGate (no per-page failure design may exist):
//
//   • CHILD scene's load fails → THE one shared modal (announceFailureIfOnline — identical
//     copy everywhere, ONE "OK" button, never auto-retries) → dismissing it (any close path)
//     POPS back to the screen that triggered the push. The user retries by re-triggering —
//     from ground that works. Page-local retry buttons are BANNED (they strand the user on
//     broken chrome and fracture the app-wide guarantee).
//   • ROOT scene's load fails → same modal, no pop (there is nothing beneath home). The
//     body keeps its DECLARED skeleton (never blank, never stale-empty), and the query
//     re-runs on the scene's NEXT presentation — the user's return IS the retry move.
//   • OFFLINE → announce nothing (the announcer's own law): the system banner explains,
//     skeletons persist.
//
// Root-vs-child derives from the posture-seat declaration (the compile-forced per-scene
// registry field — the same source of truth the snap law and nav rows derive from): a
// scene with a seat is a root page (polls/bookmarks/profile; search never gates), so a
// future scene classifies itself by construction.

const isRootNavScene = (sceneKey: OverlayKey): boolean =>
  sceneKey === 'search' || resolveSheetPostureSeat(sceneKey) != null;

export type SceneLoadFailure = {
  /** The load-failure edge (e.g. react-query isError on the scene's primary query). */
  isError: boolean;
  /** Human noun for the modal copy: "this list", "messages" … */
  what?: string;
  /** Root scenes: re-run the load on next presentation. Child scenes: unused (pop is the law). */
  retry?: () => void;
};

export const useSceneLoadFailurePolicy = (
  sceneKey: OverlayKey | null,
  failure: SceneLoadFailure | undefined
): void => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const isError = failure?.isError === true;
  const what = failure?.what;
  const retryRef = React.useRef(failure?.retry);
  retryRef.current = failure?.retry;
  // One announcement per error EDGE (not per render, not per re-mount of the same error).
  const announcedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isError || sceneKey == null) {
      announcedRef.current = false;
      return undefined;
    }
    if (announcedRef.current) {
      return undefined;
    }
    announcedRef.current = true;
    const commandRuntime = routeSceneRuntime.routeOverlayRouteCommandRuntime;
    const message = `We couldn't load ${what ?? 'this'}. Please try again.`;
    if (isRootNavScene(sceneKey)) {
      announceFailureIfOnline({ message });
      // The retry moment is the scene's next PRESENTATION (frame-derived — the same
      // presented-key clock the chrome rides): returning to the page re-runs the load.
      const runtime = routeSceneRuntime.routeSceneSwitchRuntime;
      let lastPresented = runtime.getPresentationFrame().presentedSceneKey;
      const unsubscribe = runtime.subscribePresentationFrame(() => {
        const presented = runtime.getPresentationFrame().presentedSceneKey;
        if (presented === sceneKey && lastPresented !== sceneKey) {
          unsubscribe();
          retryRef.current?.();
        }
        lastPresented = presented;
      });
      return unsubscribe;
    }
    // Child: modal first; ANY dismissal pops to the trigger screen (spec: the failed
    // transition unwinds via onDismissed).
    announceFailureIfOnline({
      message,
      onDismissed: () => {
        commandRuntime.closeActiveRoute();
      },
    });
    return undefined;
  }, [isError, routeSceneRuntime, sceneKey, what]);
};
