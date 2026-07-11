import type { OverlayKey } from '../../overlays/types';
import { getAppOverlayRouteMetadata } from './app-overlay-route-types';

// ─── THE PRESENTATION FRAME (page-switch-master-plan.md §1 + §9) ─────────────────────────────
//
// ONE committed value that answers "what is on screen" for the whole sheet, minted ONLY by
// AppRouteSceneSwitchController (the single writer) and read as a PURE FUNCTION by every
// consumer: leg opacity, body attach, header title, snap, chrome, touch routing. Before the PF,
// this answer was derived FIVE times from differently-timed subscriptions (sheet-host cascade,
// scene-stack resolve*, the host search override, the native displayedSceneKey forcing, and the
// session-state docked-lane formula) — the cross-cadence race behind the blank-sheet /
// wrong-page nav bug. Because leg-visible and body-attached read the SAME frame, they can no
// longer disagree; the desync class is deleted structurally.
//
// LIFECYCLE (§9.1 R1-AMENDED): identity fields (switchId / active / presented / outgoing) are
// switch-static. laneKind's inputs can mutate WITHOUT a switch (a docked-polls gesture dismiss;
// the search surface's results_dismissing release), so the controller subscribes to those inputs
// and RE-MINTS the frame with a bumped `revision` — still the one writer, never a consumer-side
// re-derivation.
//
// FIELD SCOPE (final red-team): the frame carries PRESENTATION identity ONLY. The once-planned
// snapIntent/originRef lanes are deliberately ABSENT — the P6 sheet-Y player lane was a reasoned
// NO-GO, so snap/detent decisions live in the transition descriptor table (and return-to-origin
// capture lives with the entry-origin capture delegate), never on the PF.
//
// DIVERGENCE RULES (§9.1 R3-AMENDED): steady-state presented≠active is legal ONLY for
// laneKind==='docked-polls' (the polls feed docked under the search-root home). TRANSIENT
// divergence is legal only via `outgoingSceneKey` during an in-flight switch, bounded by
// switchId + settle.

// S-B slice 2: the 'child' arm is DELETED (zero consumers; nav-out now derives from route
// metadata in nav-out-derivation-store). Child targets resolve 'top-level'; the structural
// "a child target must never ride the docked-polls lane" rule lives as the explicit
// isChildTarget deny inside the formula below.
export type PresentationLaneKind = 'top-level' | 'docked-polls';

export type PresentationFrame = {
  /** Monotonic per committed switch. Keys paint-acks, player starts, and readiness epochs. */
  switchId: number;
  /** Bumped when the frame is RE-MINTED without a switch (lane inputs changed). */
  revision: number;
  /** ROUTE truth. Drives the header title + the nav index. Null only before the first commit. */
  activeSceneKey: OverlayKey | null;
  /**
   * The leg that PAINTS. == the fresh resolved target, except laneKind==='docked-polls' where it
   * is 'polls' (the one legal steady-state divergence). Null only before the first commit.
   */
  presentedSceneKey: OverlayKey | null;
  /**
   * The held leg during a preserveOutgoingUntilSettle window; null otherwise (swapImmediately
   * switches never hold one — §9.1 R2-AMENDED). Any leg ∉ {presented, outgoing} is idle.
   */
  outgoingSceneKey: OverlayKey | null;
  laneKind: PresentationLaneKind;
  // ─── W1 slice 1 (C5) — instance identity, ADDITIVE ("Frame gains instance identity WITHOUT
  // retyping its key fields"). Key-typed consumers (native targets, silhouette, sheet host)
  // are untouched; only the scene-stack runtime + the body host read the ids. This is what
  // lets a SAME-KEY transition (userProfile A→B) distinguish its two legs at entry
  // granularity for the entry-keyed child mounts.
  /** entryId of the topmost stack entry of activeSceneKey; null when none / pre-first-commit. */
  activeEntryId: string | null;
  /** entryId of the topmost stack entry of presentedSceneKey; null when none. */
  presentedEntryId: string | null;
  /**
   * The held ENTRY during a preserveOutgoingUntilSettle window. May be non-null while
   * outgoingSceneKey is null: a same-key switch holds no outgoing LEG, but the leaving entry
   * is still the leg-INTERNAL outgoing unit until settle (contract c — pop unmounts the
   * popped entry after settle).
   */
  outgoingEntryId: string | null;
};

/** The pre-first-commit frame — nothing presented yet (the native splash still covers). */
export const EMPTY_PRESENTATION_FRAME: PresentationFrame = {
  switchId: 0,
  revision: 0,
  activeSceneKey: null,
  presentedSceneKey: null,
  outgoingSceneKey: null,
  laneKind: 'top-level',
  activeEntryId: null,
  presentedEntryId: null,
  outgoingEntryId: null,
};

// ─── Lane inputs (the docked-polls formula's mutable feeds) ──────────────────────────────────
//
// Primitive booleans so this contract stays decoupled from the search-surface / policy /
// snap-session types. The wiring layer (which owns those authorities) registers a provider +
// change subscription with the controller; the controller re-mints on change (R1-AMENDED).
export type PresentationLaneInputs = {
  /** routeScenePolicySnapshot.isPersistentPollLaneEligible */
  isPersistentPollLaneEligible: boolean;
  /** surfaceVisualPolicy.phase === 'results_dismissing' */
  isResultsDismissing: boolean;
  /** surfaceVisualPolicy.canReleasePersistentPolls */
  canReleasePersistentPolls: boolean;
  /** sheetSessionSnapshot.isDockedPollsDismissed */
  isDockedPollsDismissed: boolean;
};

export type ResolvePresentationLaneKindInput = {
  /**
   * The FRESH resolved target: transitionContract.targetSceneKey ?? pendingSceneKey ??
   * routeActiveSceneKey — the exact coalesce the old deny-list trusted
   * (app-route-native-overlay-target-authorities.ts:365-368). Null before the first commit.
   */
  resolvedTargetSceneKey: OverlayKey | null;
  rootOverlayKey: OverlayKey | null;
  hasActiveDockedPollsRestoreIntent: boolean;
  laneInputs: PresentationLaneInputs;
};

/**
 * THE single laneKind formula — the one place the docked-polls decision is made. Transcribed for
 * EXACT behavioral parity from resolveIsPersistentPollLane (native-overlay-target-authorities
 * :345-390), whose body this replaces; the old scattered child/bookmarks/profile deny checks are
 * structural here (a child target is DENIED the docked-polls lane structurally; a non-search
 * top-level target IS 'top-level'), not band-aids applied per consumer.
 */
export const resolvePresentationLaneKind = ({
  resolvedTargetSceneKey,
  rootOverlayKey,
  hasActiveDockedPollsRestoreIntent,
  laneInputs,
}: ResolvePresentationLaneKindInput): PresentationLaneKind => {
  const isChildTarget =
    resolvedTargetSceneKey != null &&
    getAppOverlayRouteMetadata(resolvedTargetSceneKey).role === 'child';
  // Parity note: the original formula deny-listed exactly bookmarks|profile as non-search
  // top-level targets the lane must never force 'polls' over (the favorite↔poll nav swap fix).
  const isNonSearchTopLevelTarget =
    resolvedTargetSceneKey === 'bookmarks' || resolvedTargetSceneKey === 'profile';
  const isSurfacePersistentPollCommitted =
    laneInputs.isResultsDismissing && laneInputs.canReleasePersistentPolls;
  const isPersistentPollLaneEligible =
    (laneInputs.isPersistentPollLaneEligible && !laneInputs.isResultsDismissing) ||
    isSurfacePersistentPollCommitted ||
    // S-C.5 lane-input attribution (2026-07-10, plans/s-c5-restaurant-stack-fact.md): a home
    // dismissal CARRYING the docked-polls restore intent admits the lane immediately — the
    // switch itself declares polls shall present at the landing. Under the old two-switch
    // dance polls presented as switch 1's TARGET scene, which fed the dismiss transaction's
    // poll-readiness weld; the one-switch dismissal made the lane the ONLY mount path, and
    // without this arm a swipe-dismissed docked-polls entry state DEADLOCKS (lane needs
    // release, release needs poll readiness, readiness needs the lane to mount polls). The
    // release gates still gate the FINALIZE — this only restores the old mount timing.
    (laneInputs.isResultsDismissing && hasActiveDockedPollsRestoreIntent);
  const isDockedPollsLane =
    !isChildTarget &&
    !isNonSearchTopLevelTarget &&
    rootOverlayKey === 'search' &&
    isPersistentPollLaneEligible &&
    (!laneInputs.isDockedPollsDismissed ||
      hasActiveDockedPollsRestoreIntent ||
      isSurfacePersistentPollCommitted);
  return isDockedPollsLane ? 'docked-polls' : 'top-level';
};

/** The leg that paints for a given lane + fresh target (the one legal steady divergence). */
export const resolvePresentedSceneKey = (
  laneKind: PresentationLaneKind,
  resolvedTargetSceneKey: OverlayKey | null
): OverlayKey | null => (laneKind === 'docked-polls' ? 'polls' : resolvedTargetSceneKey);

// ─── Supersede rule (§9.1 R2-AMENDED) ────────────────────────────────────────────────────────
//
// On a NEW switch committed while a previous one is in flight (rapid tab taps — the repro):
// the new frame's outgoing must be the leg that is ACTUALLY PAINTED right now, and only when the
// new switch's plan holds an outgoing at all.
//   • ack-conditional: pre-paint-ack the painted leg is still the PREVIOUS frame's outgoing
//     (resolveContentLaneOpacities holds outgoing=1/incoming=0 until the ack) — so
//     outgoing := prev.presented ONLY IF prev's switchId-keyed ack committed, ELSE prev.outgoing.
//   • descriptor-conditional: a swapImmediately switch (closeChild / modalClose / the
//     top-level-rich dismiss) holds NO outgoing → null. Preserves dismiss byte-identity.
// Role-by-exclusion makes any second-previous leg idle with no explicit clear.
export const resolveSupersededOutgoingSceneKey = ({
  previousFrame,
  previousAckCommitted,
  preservesOutgoing,
}: {
  previousFrame: PresentationFrame;
  previousAckCommitted: boolean;
  preservesOutgoing: boolean;
}): OverlayKey | null => {
  if (!preservesOutgoing) {
    return null;
  }
  return previousAckCommitted
    ? previousFrame.presentedSceneKey
    : (previousFrame.outgoingSceneKey ?? previousFrame.presentedSceneKey);
};

// Entry-level mirror of the supersede rule (W1 slice 1 C5): same ack-conditional shape, over
// the previous frame's ENTRY ids. Kept separate (not derived from the scene-key result) because
// a same-key switch nulls outgoingSceneKey while the leaving ENTRY must still be held.
export const resolveSupersededOutgoingEntryId = ({
  previousFrame,
  previousAckCommitted,
  preservesOutgoing,
}: {
  previousFrame: PresentationFrame;
  previousAckCommitted: boolean;
  preservesOutgoing: boolean;
}): string | null => {
  if (!preservesOutgoing) {
    return null;
  }
  return previousAckCommitted
    ? previousFrame.presentedEntryId
    : (previousFrame.outgoingEntryId ?? previousFrame.presentedEntryId);
};

export const arePresentationFramesEqual = (
  left: PresentationFrame,
  right: PresentationFrame
): boolean =>
  left === right ||
  (left.switchId === right.switchId &&
    left.revision === right.revision &&
    left.activeSceneKey === right.activeSceneKey &&
    left.presentedSceneKey === right.presentedSceneKey &&
    left.outgoingSceneKey === right.outgoingSceneKey &&
    left.laneKind === right.laneKind &&
    // W1 C5 — the entry-id identity fields are render-read (the entry-keyed body units key
    // off them); the snapshot-equality landmine says a field the render reads MUST be here.
    left.activeEntryId === right.activeEntryId &&
    left.presentedEntryId === right.presentedEntryId &&
    left.outgoingEntryId === right.outgoingEntryId);
