import { NativeModules } from 'react-native';

import { captureHandledError } from '../../observability/crash-reporting';

// ─── W1 slice 3 — the [PREMOUNT] violation log (plans/w1-listdetail-structural-spec.md §A.1
// C4; red-team-2026-07-10.md "a commit instant may only FLIP VISIBILITY; it may never build").
//
// THE LAW: a child body unit must build its Fabric subtree at push-INTENT (route dispatch),
// invisibly, BEFORE the transition's visibility flip (the paint-ack). A unit whose FIRST
// Fabric commit lands measurably AFTER its own switch's ack was built at/after the commit
// instant — the exact class behind the warm 61ms JS commit the red-team names.
//
// Shape (same spirit as the >30ms apply loud contract, 821bcc22): a permanent, cheap,
// Release-safe check — two comparisons + one monotonic clock read per unit mount, logging through the
// UIFrameSampler os_log sink ([JSPERF]-style) when console is stripped. RED-provable: defer
// the boundary's children past the flip and this fires (the slice-3 backstop probe).
//
// The controller is the ONE writer (it already owns the frame + ack truth); this module holds
// a mirror so the body host needs no controller import (no cycle: controller → probe,
// overlays → probe).

// F920 — 48 IS UNATTRIBUTED, and it is the whole boundary between "the law is
// satisfied" and a logged violation, so the instrument's honesty rests on it. It is
// suspiciously ~3 frames at 60Hz, but nothing in this file's history says that, and if
// the app targets 120Hz the same 48ms is 6 frames — i.e. the number silently means
// different things on different devices. Do NOT restate it as `3 * FRAME_MS` without
// evidence; that would invent a derivation. The number that WOULD attribute it is the
// p99 `sinceAckMs` of a COMPLIANT post-flip first commit.
//
// F2408 — THE SAMPLE CAN NOW REACH THE LANE IT MUST MEASURE. That compliant-population
// log was wrapped in `if (__DEV__)` while the VIOLATION path was deliberately
// Release-capable (the UIFrameSampler os_log sink, precisely so "the violation is
// measurable on the honest lane"). The two halves therefore sampled DIFFERENT WORLDS: a
// threshold deciding Release violations could only ever be calibrated from DEV timings,
// where JS is slower and the first-commit distribution is exactly the thing that differs.
// A grace fitted to dev p99 is either too loose in Release (violations invisible) or too
// tight (noise), and nothing would say which. Both populations now go through the SAME
// sink (`logPremountLine`), and both timestamps are monotonic (`performance.now()`)
// instead of a wall clock subject to NTP correction across a sub-100ms interval.
//
// THE CONSTANT IS STILL UNMEASURED, and stays 48 until it is measured — per the
// no-fake-estimates law, adjusting it on reasoning would be inventing the derivation this
// docblock refuses to invent. TO CLOSE: collect `[PREMOUNT] compliant … sinceAckMs=` from
// a RELEASE build on device, take the p99, and replace 48 with that value AND ITS DATE.
export const PREMOUNT_COMMIT_GRACE_MS = 48;

type PremountProbeState = {
  switchId: number;
  presentedEntryId: string | null;
  /** JS-side timestamp of the switch's paint-ack commit (the visibility flip); null pre-flip. */
  ackAtMs: number | null;
};

/** F2408: monotonic, not wall-clock. `Date.now()` is NTP-correctable, which is meaningless
 *  noise on a sub-100ms interval — the measurement class CLAUDE.md's methodology memory
 *  says needs a mach-clock event log. `performance.now()` is Hermes's monotonic clock and is
 *  the same source the switch controller's own trace stamps use. */
const nowMs = (): number => performance.now();

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
    probeState.ackAtMs = nowMs();
  }
};

/** THE ONE PREMOUNT SINK (F2408). Both populations — compliant and violating — ride it, so
 *  the grace window is calibrated from the same world it polices. */
const logPremountLine = (line: string): void => {
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
  } catch (error) {
    // F960: this catch used to be empty under a comment still calling this a "loud
    // contract". If the native UIFrameSampler is missing or its bridge throws, the
    // ENTIRE Release-lane premount instrument went silent with zero signal — the
    // always-green failure mode one level up: not a check that cannot go red, but a RED
    // SIGNAL THAT CANNOT BE DELIVERED. Swallowing the throw is still right (an
    // instrument must never be a crash vector), but the delivery failure is itself
    // reportable, through the sink that survives Release.
    captureHandledError(error, { scope: 'premountViolationProbe.nativeSink', line });
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
  const sinceAckMs = nowMs() - probeState.ackAtMs;
  if (sinceAckMs <= PREMOUNT_COMMIT_GRACE_MS) {
    // F920/F2408: the compliant population — the ONLY sample that can attribute the grace —
    // through the same Release-capable sink as the violation, because the number it
    // calibrates decides Release violations.
    logPremountLine(
      `[PREMOUNT] compliant unit=${unitKey} scene=${sceneKey} switchId=${probeState.switchId} sinceAckMs=${sinceAckMs} graceMs=${PREMOUNT_COMMIT_GRACE_MS}`
    );
    return;
  }
  logPremountLine(
    `[PREMOUNT] violation: child body first Fabric commit AFTER the visibility flip — ` +
      `unit=${unitKey} scene=${sceneKey} switchId=${probeState.switchId} sinceAckMs=${sinceAckMs} graceMs=${PREMOUNT_COMMIT_GRACE_MS}`
  );
};
