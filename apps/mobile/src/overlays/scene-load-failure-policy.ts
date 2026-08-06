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
// scene with a seat is a root page (polls/lists/profile; search never gates), so a
// future scene classifies itself by construction.
//
// F915: this predicate used to read `sceneKey === 'search' || <seat>`, contradicting
// the "search never gates" law six lines up. The law sentence is the ratified one, so
// the disjunct is gone and the posture-seat registry is the SOLE classifier — which is
// exactly what "a future scene classifies itself by construction" promises.

const isRootNavScene = (sceneKey: OverlayKey): boolean => resolveSheetPostureSeat(sceneKey) != null;

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
  // One announcement per error EPISODE — and an EPISODE is a fact about the
  // (sceneKey, error) pair, NOT about an effect invocation.
  //
  // F2401: this used to be a bare boolean `announcedRef` plus an `if (announcedRef.current)
  // return undefined` early return INSIDE the effect. Because the ref outlives effect
  // cleanup while the presentation-frame subscription below is created inside the effect,
  // ANY re-run of the effect while `isError` stayed true (deps include the ordinary render
  // values `sceneKey` and `what`) first tore the subscription down and then early-returned
  // without re-establishing it — leaving a live error state with NO live subscription, i.e.
  // exactly the "skeleton forever, no modal" dead end the F914 comment below claims to have
  // killed. The latch is now keyed by the episode: a re-run for the SAME episode re-subscribes
  // WITHOUT re-announcing, a DIFFERENT episode announces. Only the announce is latched; the
  // subscription is unconditional.
  const announcedEpisodeRef = React.useRef<OverlayKey | null>(null);

  React.useEffect(() => {
    if (!isError || sceneKey == null) {
      announcedEpisodeRef.current = null;
      return undefined;
    }
    const isNewEpisode = announcedEpisodeRef.current !== sceneKey;
    announcedEpisodeRef.current = sceneKey;
    const commandRuntime = routeSceneRuntime.routeOverlayRouteCommandRuntime;
    const message = `We couldn't load ${what ?? 'this'}. Please try again.`;
    if (isRootNavScene(sceneKey)) {
      if (isNewEpisode) {
        announceFailureIfOnline({ message });
      }
      // The retry moment is the scene's next PRESENTATION (frame-derived — the same
      // presented-key clock the chrome rides): returning to the page re-runs the load.
      //
      // EVERY RETURN IS AN EDGE (F914). This subscription used to unsubscribe on the
      // first re-presentation and fire the retry WITHOUT re-arming the announce latch,
      // so a second failure — with `isError` never dipping false, e.g. flaky network —
      // was swallowed entirely: the user got a skeleton forever and no modal. The
      // subscription now lives for as long as this error state does, and each return
      // announces the failure we ALREADY know about and THEN re-runs the load. That
      // ordering is what keeps the modal honest: it reports the outcome of the attempt
      // that has already finished, never a guess about the one being started. When the
      // retry succeeds the body leaves the `error` state, `isError` goes false, this
      // effect tears down, and the announcements stop by construction.
      const runtime = routeSceneRuntime.routeSceneSwitchRuntime;
      let lastPresented = runtime.getPresentationFrame().presentedSceneKey;
      return runtime.subscribePresentationFrame(() => {
        const presented = runtime.getPresentationFrame().presentedSceneKey;
        if (presented === sceneKey && lastPresented !== sceneKey) {
          announceFailureIfOnline({ message });
          retryRef.current?.();
        }
        lastPresented = presented;
      });
    }
    // Child: modal first; ANY dismissal pops to the trigger screen (spec: the failed
    // transition unwinds via onDismissed).
    if (isNewEpisode) {
      announceFailureIfOnline({
        message,
        onDismissed: () => {
          commandRuntime.closeActiveRoute();
        },
      });
    }
    return undefined;
  }, [isError, routeSceneRuntime, sceneKey, what]);
};
