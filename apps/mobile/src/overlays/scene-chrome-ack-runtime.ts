import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import { getSceneFoundationSpec } from '../navigation/runtime/scene-foundation-spec';
import { offerTransitionJoinInput } from '../navigation/runtime/transition-engine/transition-transaction';

// ─── THE CHROME-ACK (child-transition primitive §2.3, leg 6) ─────────────────────────────────
//
// The joined reveal: a page switch's body reveal joins TWO marks — the incoming body's
// paint-ack AND the persistent header's post-commit chromeAck for the presented scene. The
// header host (a real component whose effects fire) records the ack in a useLayoutEffect after
// its commit; the scene-stack host's swap-SV flip waits for BOTH. This is what kills the
// nav-page one-beat header/strip lag (content opacity can never lead the header/strip paint)
// and, together with the skeleton law, the child bare-frost gap.
//
// Module-scope store (the house live-state pattern): ONE writer (PersistentSheetHeaderHost),
// pull-read + subscribe consumers (BottomSheetSceneStackHost's join).

type Listener = () => void;

let chromeAckSceneKey: OverlayKey | null = null;
const listeners = new Set<Listener>();

/** THE one writer: PersistentSheetHeaderHost, post-commit (useLayoutEffect on its sceneKey). */
export const recordSceneChromeAck = (sceneKey: OverlayKey): void => {
  if (chromeAckSceneKey === sceneKey) {
    return;
  }
  chromeAckSceneKey = sceneKey;
  // §Q redo T1b: the chrome source OFFERS its input to the live transaction
  // (consumed iff the txn's plan declared 'chrome').
  offerTransitionJoinInput('chrome');
  listeners.forEach((listener) => {
    listener();
  });
};

export const getSceneChromeAckSceneKey = (): OverlayKey | null => chromeAckSceneKey;

const subscribeSceneChromeAck = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// ~2 frames at 60Hz. A missing chromeAck degrades to today's (paint-ack-only) behavior after
// this window — with a LOUD dev bark, because a fire means the header never committed the
// presented scene (a broken descriptor / a header host that unmounted): a bug to attribute,
// never a mechanism to rely on. Provably RED: suppress the header's recordSceneChromeAck and
// every switch barks.
export const CHROME_ACK_WATCHDOG_MS = 34;

export type ChromeAckJoinCancel = () => void;

/**
 * Run `onJoin` once the chromeAck matches `sceneKey` — synchronously when it already does,
 * otherwise on the ack's arrival, degraded by the watchdog after CHROME_ACK_WATCHDOG_MS with
 * a __DEV__ bark. Returns a cancel (a superseding switch must cancel its predecessor's join).
 */
export const joinSceneChromeAck = (
  sceneKey: OverlayKey,
  onJoin: () => void
): ChromeAckJoinCancel => {
  if (chromeAckSceneKey === sceneKey) {
    onJoin();
    return () => {};
  }
  let settled = false;
  let unsubscribe: (() => void) | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const settle = (viaWatchdog: boolean) => {
    if (settled) {
      return;
    }
    settled = true;
    unsubscribe?.();
    unsubscribe = null;
    if (watchdog != null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
    if (viaWatchdog && __DEV__) {
      // eslint-disable-next-line no-console
      console.error(
        `[JOINEDREVEAL] chromeAck missing for presented scene '${sceneKey}' after ` +
          `${CHROME_ACK_WATCHDOG_MS}ms (header ack = '${chromeAckSceneKey ?? 'none'}') — ` +
          `revealing anyway (degraded). The persistent header never committed this scene: ` +
          `attribute and fix (descriptor missing? header host unmounted?).`
      );
    }
    onJoin();
  };
  unsubscribe = subscribeSceneChromeAck(() => {
    if (chromeAckSceneKey === sceneKey) {
      settle(false);
    }
  });
  watchdog = setTimeout(() => {
    settle(true);
  }, CHROME_ACK_WATCHDOG_MS);
  return () => {
    if (settled) {
      return;
    }
    settled = true;
    unsubscribe?.();
    unsubscribe = null;
    if (watchdog != null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };
};

/** Test seam (jest): reset the module store between cases. */
export const __resetSceneChromeAckForTest = (): void => {
  chromeAckSceneKey = null;
  listeners.clear();
  chromeHeightBySceneKey.clear();
};

// ─── THE MEASURED-CHROME HEIGHT CACHE (wave-3 §2.7, leg 8) ───────────────────────────────────
//
// The strip-gap root cause: the persistent header's strip slot unmounts on the PF commit (the
// chrome box shrinks in that committed frame), but every leg's body-lane top-inset
// (reservedHeaderHeight) came ONLY from the header wrapper's onLayout → setState — one-plus
// frames LATER. Between those commits the sheet shows a see-through frost band between the new
// (shorter) chrome bottom and the still-inset body top. The law: the chrome box and the body
// lane move in the SAME committed frame.
//
// Mechanism: the header host records its measured wrapper height PER SCENE (one writer, same
// as the ack). At render time each leg derives ITS OWN scene's chrome height synchronously —
// exact measurement first, else the measurement of any scene with the SAME chrome composition
// signature (strip declaration × grab-handle declaration, the two foundation-table facts that
// change chrome height), else null → the retained shared measurement (today's behavior, first
// cold visit only). onLayout stays the truth-updater: it corrects the cache and the retained
// fallback, so a wrong same-signature guess self-heals in one frame and is exact forever after.

const chromeHeightBySceneKey = new Map<OverlayKey, number>();

// Signature only for scenes WITH a foundation row: a spec-less scene (search — its chrome is
// its own live-state plumbing) can neither donate nor receive a same-signature guess.
const chromeCompositionSignature = (sceneKey: OverlayKey): string | null => {
  const spec = getSceneFoundationSpec(sceneKey);
  if (spec == null) {
    return null;
  }
  return `${spec.strip === 'header' ? 'strip' : 'nostrip'}|${
    spec.grabHandle === 'hidden' ? 'nohandle' : 'handle'
  }`;
};

/** THE one writer: PersistentSheetHeaderHost's chrome-wrapper onLayout. */
export const recordSceneChromeMeasuredHeight = (sceneKey: OverlayKey, height: number): void => {
  if (height > 0) {
    chromeHeightBySceneKey.set(sceneKey, height);
  }
};

/**
 * Synchronous per-scene chrome height: exact measurement → same-composition-signature
 * measurement → null (caller falls back to the retained shared measurement).
 */
export const resolveSceneChromeHeight = (sceneKey: OverlayKey): number | null => {
  const exact = chromeHeightBySceneKey.get(sceneKey);
  if (exact != null) {
    return exact;
  }
  const signature = chromeCompositionSignature(sceneKey);
  if (signature == null) {
    return null;
  }
  for (const [measuredKey, height] of chromeHeightBySceneKey) {
    if (chromeCompositionSignature(measuredKey) === signature) {
      return height;
    }
  }
  return null;
};
