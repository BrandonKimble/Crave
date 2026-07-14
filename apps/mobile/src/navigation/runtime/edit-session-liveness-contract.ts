import type { OverlayKey } from '../../overlays/types';

// ─── Edit-session LIVENESS contract (leg 9 — home-edit nav-out conformance) ──────────────────
//
// The owner's law (wave-2 §2 / wave-3 §1b): "edit mode is a CHILD PAGE wherever it lives —
// nav bar transitions out, no tab-switching mid-edit, the header X acts as Cancel." On a scene
// whose ROUTE role is already 'child' (listDetail) the PresentationFrame's chrome clock derives
// that for free; on a topLevel scene (bookmarks — the home My-ranking edit) the role derivation
// alone leaves the tab bar up and the LIVE red plus in the header mid-edit.
//
// So edit-session liveness is a DERIVATION INPUT to the frame's chrome clock, published here:
//   • the edit-mode SESSION primitive (useEditModeSession) publishes while a session is live —
//     the same effect lifecycle as its sheet edit lock, so liveness can never outlive a session
//     or a surface unmount;
//   • the ONE frame writer (AppRouteSceneSwitchController) subscribes and RE-MINTS the frame on
//     change, deriving nav-out=true + headerNavAction='close' while a session is live on the
//     scene in question (resolveIsChildSceneRevealed / resolveHeaderNavAction read the boolean
//     as a pure input — the one-chrome-clock law holds; no consumer-side re-derivation).
//
// Same module-scope registry pattern as header-nav-action-registry (overlays publish into
// navigation-owned contracts). COUNTED per scene: two live entries of one scene (stacked
// listDetail pushes) each hold their own publication, exactly like the edit-lock tokens.

const liveSessionCountBySceneKey = new Map<OverlayKey, number>();

const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

/**
 * Publish a live edit session on `sceneKey`. Returns the release; call it on session end
 * (the primitive runs this as an effect cleanup, so unmount releases too).
 */
export const publishEditSessionLive = (sceneKey: OverlayKey): (() => void) => {
  const previousCount = liveSessionCountBySceneKey.get(sceneKey) ?? 0;
  liveSessionCountBySceneKey.set(sceneKey, previousCount + 1);
  if (previousCount === 0) {
    notify();
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const count = liveSessionCountBySceneKey.get(sceneKey) ?? 0;
    if (count <= 1) {
      liveSessionCountBySceneKey.delete(sceneKey);
      notify();
      return;
    }
    liveSessionCountBySceneKey.set(sceneKey, count - 1);
  };
};

/** True while ANY edit session is live on `sceneKey` (null — the pre-commit frame — is never live). */
export const isEditSessionLiveOnScene = (sceneKey: OverlayKey | null): boolean =>
  sceneKey != null && (liveSessionCountBySceneKey.get(sceneKey) ?? 0) > 0;

/** Change subscription for the frame writer — fires when any scene's liveness flips. */
export const subscribeEditSessionLiveness = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};
