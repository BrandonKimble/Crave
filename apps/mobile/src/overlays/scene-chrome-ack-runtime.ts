import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import { getSceneFoundationSpec } from '../navigation/runtime/scene-foundation-spec';
import { offerTransitionJoinInput } from '../navigation/runtime/transition-engine/transition-transaction';

// ─── THE CHROME-ACK (child-transition primitive §2.3, leg 6) ─────────────────────────────────
//
// The joined reveal (T5 — engine-owned): the header host records its post-commit ack here,
// which OFFERS 'chrome' to the live TransitionTxn; the txn joins it with 'paint' and its
// 'revealed' edge is the one visible-commit. This kills the nav-page one-beat header/strip
// lag (content opacity can never lead the header paint). The old host-side
// joinSceneChromeAck ceremony (34ms watchdog) was deleted with the inversion — the ENGINE
// owns the liveness degrade now (join_liveness_degrade in transition-transaction.ts).
//
// Module-scope store (the house live-state pattern): ONE writer (PersistentSheetHeaderHost).

let chromeAckSceneKey: OverlayKey | null = null;

/** THE one writer: PersistentSheetHeaderHost, post-commit (useLayoutEffect on its sceneKey). */
export const recordSceneChromeAck = (sceneKey: OverlayKey): void => {
  if (chromeAckSceneKey === sceneKey) {
    return;
  }
  chromeAckSceneKey = sceneKey;
  // §Q redo T1b: the chrome source OFFERS its input to the live transaction
  // (consumed iff the txn's plan declared 'chrome').
  offerTransitionJoinInput('chrome');
};

export const getSceneChromeAckSceneKey = (): OverlayKey | null => chromeAckSceneKey;

/** Test seam (jest): reset the module store between cases. */
export const __resetSceneChromeAckForTest = (): void => {
  chromeAckSceneKey = null;
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
