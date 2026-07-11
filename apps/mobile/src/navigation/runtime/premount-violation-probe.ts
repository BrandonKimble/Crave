import { NativeModules } from 'react-native';

// ─── W1 slice 3 — the [PREMOUNT] violation log (plans/w1-listdetail-structural-spec.md §A.1
// C4; red-team-2026-07-10.md "a commit instant may only FLIP VISIBILITY; it may never build").
//
// THE LAW: a child body unit must build its Fabric subtree at push-INTENT (route dispatch),
// invisibly, BEFORE the transition's visibility flip (the paint-ack). A unit whose FIRST
// Fabric commit lands measurably AFTER its own switch's ack was built at/after the commit
// instant — the exact class behind the warm 61ms JS commit the red-team names.
//
// Shape (same spirit as the >30ms apply loud contract, 821bcc22): a permanent, cheap,
// Release-safe check — two comparisons + one Date.now() per unit mount, logging through the
// UIFrameSampler os_log sink ([JSPERF]-style) when console is stripped. RED-provable: defer
// the boundary's children past the flip and this fires (the slice-3 backstop probe).
//
// The controller is the ONE writer (it already owns the frame + ack truth); this module holds
// a mirror so the body host needs no controller import (no cycle: controller → probe,
// overlays → probe).

export const PREMOUNT_COMMIT_GRACE_MS = 48;

type PremountProbeState = {
  switchId: number;
  presentedEntryId: string | null;
  /** JS-side timestamp of the switch's paint-ack commit (the visibility flip); null pre-flip. */
  ackAtMs: number | null;
};

let probeState: PremountProbeState = {
  switchId: -1,
  presentedEntryId: null,
  ackAtMs: null,
};

/** Controller-only: mirror every committed PresentationFrame (mint + re-mint). */
export const notePremountPresentationFrame = (
  switchId: number,
  presentedEntryId: string | null
): void => {
  if (switchId !== probeState.switchId) {
    probeState = { switchId, presentedEntryId, ackAtMs: null };
    return;
  }
  probeState.presentedEntryId = presentedEntryId;
};

/** Controller-only: mirror a paint-ack commit (real or synthetic warm-leg/idle). First wins. */
export const notePremountPresentationAck = (switchId: number): void => {
  if (switchId === probeState.switchId && probeState.ackAtMs == null) {
    probeState.ackAtMs = Date.now();
  }
};

const logPremountViolation = (line: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(line);
    return;
  }
  // Release lane: console is stripped — route through the UIFrameSampler os_log sink (the
  // [JSPERF] pattern) so the violation is measurable on the honest lane.
  const nativeSampler = (NativeModules as Record<string, unknown>).UIFrameSampler as
    | { logEvent?: (message: string) => void }
    | undefined;
  try {
    nativeSampler?.logEvent?.(line);
  } catch {
    // loud contract, never a crash vector
  }
};

/**
 * Body-host: called ONCE per mounted child unit, from the unit's first Fabric commit
 * (layout-effect inside the SceneEntryMountBoundary subtree). Violation = this unit is the
 * frame's PRESENTED entry and its own switch's visibility flip (ack) committed more than the
 * grace window ago — the subtree was built after the flip instead of pre-mounted at intent.
 */
export const notePremountChildBodyFirstCommit = ({
  sceneKey,
  entryId,
  unitKey,
}: {
  sceneKey: string;
  entryId: string;
  unitKey: string;
}): void => {
  if (entryId !== probeState.presentedEntryId || probeState.ackAtMs == null) {
    // Pre-flip build (the law satisfied) or a hidden sibling pre-mount — always legal.
    return;
  }
  const sinceAckMs = Date.now() - probeState.ackAtMs;
  if (sinceAckMs <= PREMOUNT_COMMIT_GRACE_MS) {
    return;
  }
  logPremountViolation(
    `[PREMOUNT] violation: child body first Fabric commit AFTER the visibility flip — ` +
      `unit=${unitKey} scene=${sceneKey} switchId=${probeState.switchId} sinceAckMs=${sinceAckMs}`
  );
};
