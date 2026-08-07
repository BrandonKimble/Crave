import {
  CameraIntentArbiter,
  type CameraIntent,
  type CameraIntentArbiterCommitPathLeg,
  type ProgrammaticCameraAnimationCompletionPayload,
} from './camera-intent-arbiter';

/**
 * D61 — the camera command lane's bedrock obligation (F1716): an intent, once committed by
 * the arbiter, must eventually execute or be superseded by a newer intent (or the user's
 * gesture) — never silently vanish, and the lane must never report success it cannot prove.
 *
 * These specs make the RACY rig stranding DETERMINISTIC: "commit lands while the camera
 * host is unmounted mid-scene-switch" is, at the arbiter's seam, exactly a command writer
 * that returns false. No timing, no simulator.
 *
 * MUTATION PROOFS (each named revert turns the named spec RED):
 *  - Revert the park (restore the old cancel-and-drop + fallthrough state write): spec 1
 *    goes RED twice — the controlled state IS written for an unexecuted intent, and the
 *    replay executes nothing (the intent vanished). This is F1716's live stranding.
 *  - Drop newest-wins (replay the OLDEST parked intent): spec 2 RED.
 *  - Drop gesture-clears-park: spec 2's gesture arm RED.
 *  - Remove the watchdog: spec 3 RED (completion pending forever, deferred sync stranded).
 *  - Loosen the watchdog epsilon to always-pass: spec 3's wrong-region arm RED (it would
 *    settle 'finished' at the wrong region — the always-green lie the epsilon exists to
 *    prevent).
 *  - Make the watchdog retry supersede itself again (mint a fresh completion id / let the
 *    F1374 cancel fire on `isWatchdogRetry`): spec 3's retry-identity arm and the
 *    successful-rescue spec both go RED — the retry would cancel the very completion it is
 *    rescuing and continue under an id nobody armed on (F5703).
 */

type RecordedCommand = { center: [number, number]; zoom: number; completionId: string | null };

type Harness = {
  arbiter: CameraIntentArbiter;
  executedCommands: RecordedCommand[];
  /** flip to control whether the command channel has a writer (camera host mounted) */
  setHostMounted: (mounted: boolean) => void;
  stateWrites: Array<{ kind: string; value: unknown }>;
  completions: ProgrammaticCameraAnimationCompletionPayload[];
  commitPathLegs: Array<CameraIntentArbiterCommitPathLeg>;
  surrenders: Array<{ completionId: string }>;
  setObservedCamera: (camera: { center: [number, number]; zoom: number } | null) => void;
  /** fire every armed watchdog timer (fake clock) */
  fireWatchdogs: () => void;
};

const createHarness = (): Harness => {
  let hostMounted = true;
  let observedCamera: { center: [number, number]; zoom: number } | null = null;
  const executedCommands: RecordedCommand[] = [];
  const stateWrites: Array<{ kind: string; value: unknown }> = [];
  const completions: ProgrammaticCameraAnimationCompletionPayload[] = [];
  const commitPathLegs: Array<CameraIntentArbiterCommitPathLeg> = [];
  const surrenders: Array<{ completionId: string }> = [];
  const pendingTimers: Array<() => void> = [];

  const arbiter = new CameraIntentArbiter(
    {
      commandCameraViewport: ({ center, zoom, completionId }) => {
        if (!hostMounted) {
          return false;
        }
        executedCommands.push({ center: [center[0], center[1]], zoom, completionId });
        return true;
      },
      setMapCenter: (center) => stateWrites.push({ kind: 'center', value: center }),
      setMapZoom: (zoom) => stateWrites.push({ kind: 'zoom', value: zoom }),
      setMapBearing: (bearing) => stateWrites.push({ kind: 'bearing', value: bearing }),
      setMapPitch: (pitch) => stateWrites.push({ kind: 'pitch', value: pitch }),
      setMapCameraAnimation: (animation) =>
        stateWrites.push({ kind: 'animation', value: animation }),
    },
    {
      getObservedCamera: () => observedCamera,
      scheduleWatchdogTimeout: (callback) => {
        pendingTimers.push(callback);
        return () => {
          const index = pendingTimers.indexOf(callback);
          if (index >= 0) {
            pendingTimers.splice(index, 1);
          }
        };
      },
      onWatchdogSurrender: ({ completionId }) => surrenders.push({ completionId }),
      logCommitPath: (leg) => commitPathLegs.push(leg),
    }
  );
  arbiter.subscribeProgrammaticCameraAnimationCompletion((payload) => completions.push(payload));

  return {
    arbiter,
    executedCommands,
    setHostMounted: (mounted) => {
      hostMounted = mounted;
    },
    stateWrites,
    completions,
    commitPathLegs,
    surrenders,
    setObservedCamera: (camera) => {
      observedCamera = camera;
    },
    fireWatchdogs: () => {
      const timers = pendingTimers.splice(0, pendingTimers.length);
      timers.forEach((timer) => timer());
    },
  };
};

const METRO_OVERVIEW: CameraIntent = {
  center: [-97.7243, 30.2914],
  zoom: 8.76,
  animationMode: 'easeTo',
  animationDurationMs: 400,
  deferControlledCameraStateUntilCompletion: true,
};

const DOWNTOWN: CameraIntent = {
  center: [-97.7431, 30.2672],
  zoom: 13,
  animationMode: 'none',
};

describe('D61 camera intent park-and-replay (F1716)', () => {
  // ── Spec 1: the deterministic stranding — a hostless commit PARKS, tells no lies, and
  //    replays whole when the host returns. Under the reverted defect (cancel-and-drop +
  //    fallthrough state write) this is RED in both halves.
  it('parks a hostless commit without writing controlled state, then replays it on host return', () => {
    const harness = createHarness();
    harness.setHostMounted(false);

    expect(harness.arbiter.commit(METRO_OVERVIEW)).toBe(true);

    // No lie told: nothing executed, no controlled-state write, no pending completion,
    // but the intent is HELD, and the D56 origin capture sees it as the in-flight target
    // (F1513 — a flow triggered mid-park departs from where the map is GOING).
    expect(harness.executedCommands).toHaveLength(0);
    expect(harness.stateWrites).toHaveLength(0);
    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(false);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(true);
    expect(harness.commitPathLegs).toEqual(['parked']);
    expect(harness.arbiter.getInFlightCameraTarget()).toEqual({
      center: METRO_OVERVIEW.center,
      zoom: METRO_OVERVIEW.zoom,
      padding: null,
    });

    // The camera host mounts — the parked intent replays through the normal commit path.
    harness.setHostMounted(true);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(true);
    expect(harness.executedCommands).toHaveLength(1);
    expect(harness.executedCommands[0].center).toEqual(METRO_OVERVIEW.center);
    expect(harness.executedCommands[0].zoom).toBe(METRO_OVERVIEW.zoom);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(false);
    expect(harness.commitPathLegs).toEqual(['parked', 'replayed']);
    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(true);

    // Completion arrives → the deferred controlled-state sync finally (and only now) flushes.
    expect(harness.stateWrites).toHaveLength(0);
    expect(
      harness.arbiter.handleProgrammaticCameraAnimationCompletion({
        animationCompletionId: harness.executedCommands[0].completionId,
        status: 'finished',
      })
    ).toBe(true);
    expect(harness.stateWrites.some((write) => write.kind === 'center')).toBe(true);
    expect(harness.stateWrites.find((write) => write.kind === 'zoom')?.value).toBe(
      METRO_OVERVIEW.zoom
    );
  });

  it('replays a mode:none (origin-restore-shaped) parked intent immediately with controlled state', () => {
    const harness = createHarness();
    harness.setHostMounted(false);
    harness.arbiter.commit(DOWNTOWN);
    expect(harness.executedCommands).toHaveLength(0);
    expect(harness.stateWrites).toHaveLength(0);

    harness.setHostMounted(true);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(true);
    expect(harness.executedCommands).toHaveLength(1);
    expect(harness.executedCommands[0].completionId).toBeNull();
    // mode:none does not defer — controlled state syncs at execution.
    expect(harness.stateWrites.find((write) => write.kind === 'zoom')?.value).toBe(DOWNTOWN.zoom);
    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(false);
  });

  it('a hostless replay parks again (still no writer) instead of dropping', () => {
    const harness = createHarness();
    harness.setHostMounted(false);
    harness.arbiter.commit(DOWNTOWN);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(true);
    expect(harness.executedCommands).toHaveLength(0);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(true);
  });

  // ── Spec 2: supersession — newest intent wins; the user's gesture wins over everything.
  it('a newer commit replaces the parked intent; only the newest executes on host return', () => {
    const harness = createHarness();
    harness.setHostMounted(false);
    harness.arbiter.commit(METRO_OVERVIEW);
    harness.arbiter.commit(DOWNTOWN);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(true);

    harness.setHostMounted(true);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(true);
    expect(harness.executedCommands).toHaveLength(1);
    expect(harness.executedCommands[0].center).toEqual(DOWNTOWN.center);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(false);
  });

  it('a user gesture supersedes the parked intent — nothing executes on host return', () => {
    const harness = createHarness();
    harness.setHostMounted(false);
    harness.arbiter.commit(METRO_OVERVIEW);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(true);

    harness.arbiter.setGestureActive(true);
    expect(harness.arbiter.hasParkedCameraIntent()).toBe(false);
    harness.arbiter.setGestureActive(false);

    harness.setHostMounted(true);
    expect(harness.arbiter.notifyCameraWriterAvailable()).toBe(false);
    expect(harness.executedCommands).toHaveLength(0);
  });

  // ── Spec 3: the completion watchdog — a lane whose only settle signal can silently not
  //    exist (the F1716 binary-autopsy finding: the native completion emitter absent from
  //    the built app) must not strand forever. Composite-checked, one bounded re-commit,
  //    loud surrender.
  it('watchdog settles finished when the composite IS at the target (lost completion event)', () => {
    const harness = createHarness();
    harness.arbiter.commit(METRO_OVERVIEW);
    expect(harness.executedCommands).toHaveLength(1);
    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(true);

    // The animation ran, the event was lost — the OBSERVED viewport is the oracle.
    harness.setObservedCamera({ center: METRO_OVERVIEW.center, zoom: METRO_OVERVIEW.zoom });
    harness.fireWatchdogs();

    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(false);
    expect(harness.completions).toHaveLength(1);
    expect(harness.completions[0].status).toBe('finished');
    // The deferred controlled-state sync flushed — the JS state is no longer stranded.
    expect(harness.stateWrites.find((write) => write.kind === 'zoom')?.value).toBe(
      METRO_OVERVIEW.zoom
    );
    expect(harness.surrenders).toHaveLength(0);
  });

  it('watchdog re-commits ONCE off-target, then surrenders LOUDLY — never silent, never stuck', () => {
    const harness = createHarness();
    harness.arbiter.commit(METRO_OVERVIEW);
    expect(harness.executedCommands).toHaveLength(1);

    // RED arm of the epsilon: a wrong region must NOT pass as finished. The map sat at the
    // profile fly-to region while four byte-correct commits claimed success — F1716 run 1.
    harness.setObservedCamera({ center: [-97.79, 30.44], zoom: 10.6 });
    harness.fireWatchdogs();

    // One bounded re-commit of the SAME intent.
    expect(harness.executedCommands).toHaveLength(2);
    expect(harness.executedCommands[1].center).toEqual(METRO_OVERVIEW.center);
    expect(harness.commitPathLegs).toContain('watchdogRecommit');
    expect(
      harness.completions.filter((completion) => completion.status === 'finished')
    ).toHaveLength(0);

    // F5703 — the retry is the SAME EPISODE. It re-issues the stop under the id already
    // armed, and resolves NOTHING yet: a rescue in progress is not a cancellation. Under
    // the reverted defect the retry emitted 'cancelled' for the original id and continued
    // under a fresh one nobody held — a successful rescue reported as a failure.
    expect(harness.executedCommands[1].completionId).toBe(harness.executedCommands[0].completionId);
    expect(
      harness.completions.filter(
        (completion) =>
          completion.animationCompletionId === harness.executedCommands[0].completionId
      )
    ).toHaveLength(0);

    // Still off-target after the retry → surrender: loud, deferred sync DISCARDED (syncing
    // JS state to a target the map is not at would lie), arbiter freed for the next intent.
    harness.fireWatchdogs();
    expect(harness.executedCommands).toHaveLength(2);
    expect(harness.surrenders).toHaveLength(1);
    expect(harness.commitPathLegs).toContain('surrendered');
    expect(harness.completions[harness.completions.length - 1].status).toBe('cancelled');
    expect(harness.stateWrites.find((write) => write.kind === 'zoom')).toBeUndefined();
    expect(harness.arbiter.hasPendingProgrammaticCameraCompletion()).toBe(false);
    expect(harness.arbiter.commit(DOWNTOWN)).toBe(true);
    expect(harness.executedCommands).toHaveLength(3);
  });

  it('a successful watchdog rescue resolves the ORIGINAL armed id exactly once, as finished', () => {
    const harness = createHarness();
    harness.arbiter.commit(METRO_OVERVIEW);
    const armedCompletionId = harness.executedCommands[0].completionId;

    harness.setObservedCamera({ center: [-97.79, 30.44], zoom: 10.6 });
    harness.fireWatchdogs();
    expect(harness.executedCommands).toHaveLength(2);

    // The re-issued stop DOES complete natively — on the id the consumer armed on.
    expect(
      harness.arbiter.handleProgrammaticCameraAnimationCompletion({
        animationCompletionId: armedCompletionId,
        status: 'finished',
      })
    ).toBe(true);
    const forArmed = harness.completions.filter(
      (completion) => completion.animationCompletionId === armedCompletionId
    );
    expect(forArmed).toHaveLength(1);
    expect(forArmed[0].status).toBe('finished');
    expect(harness.surrenders).toHaveLength(0);
    // The deferred controlled-state sync flushed instead of being discarded.
    expect(harness.stateWrites.find((write) => write.kind === 'zoom')?.value).toBe(
      METRO_OVERVIEW.zoom
    );
  });

  it('a real completion disarms the watchdog — no retry, no surrender', () => {
    const harness = createHarness();
    harness.arbiter.commit(METRO_OVERVIEW);
    harness.arbiter.handleProgrammaticCameraAnimationCompletion({
      animationCompletionId: harness.executedCommands[0].completionId,
      status: 'finished',
    });
    harness.setObservedCamera({ center: [-97.79, 30.44], zoom: 10.6 });
    harness.fireWatchdogs();
    expect(harness.executedCommands).toHaveLength(1);
    expect(harness.surrenders).toHaveLength(0);
  });
});

describe('F1374 — a superseded completion is CANCELLED, never abandoned', () => {
  /**
   * MUTATION PROOF: delete the commit-side supersede notification in
   * camera-intent-arbiter.commitInternal (the `if (this.pendingProgrammaticCameraCompletionId
   * != null)` block) and this spec goes RED — no 'cancelled' payload is emitted for the
   * first animation's completion id.
   *
   * Why it matters beyond bookkeeping: consumers arm on a completion id and evict only on a
   * matching completion (use-app-route-scene-camera-motion-target-runtime keeps two Maps
   * keyed by settleToken). A completion that is silently replaced never arrives, so the
   * entry lives until unmount and the scene-switch settle waits on a plane that can never
   * land.
   */
  it('emits cancelled for the first animation when a newer commit supersedes it', () => {
    const harness = createHarness();

    harness.arbiter.commit(METRO_OVERVIEW);
    const firstCompletionId = harness.executedCommands[0]?.completionId ?? null;
    expect(firstCompletionId).not.toBeNull();
    expect(harness.completions).toHaveLength(0);

    // A newer animated intent supersedes the first while it is still in flight.
    harness.arbiter.commit({ ...METRO_OVERVIEW, center: [-97.75, 30.3], zoom: 11 });

    const cancelled = harness.completions.filter((payload) => payload.status === 'cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.animationCompletionId).toBe(firstCompletionId);
  });

  it('resolves an armed completion exactly once — the supersede does not also finish it', () => {
    const harness = createHarness();

    harness.arbiter.commit(METRO_OVERVIEW);
    const firstCompletionId = harness.executedCommands[0]?.completionId ?? null;
    harness.arbiter.commit({ ...METRO_OVERVIEW, center: [-97.75, 30.3], zoom: 11 });

    const forFirst = harness.completions.filter(
      (payload) => payload.animationCompletionId === firstCompletionId
    );
    expect(forFirst).toHaveLength(1);
    expect(forFirst[0]?.status).toBe('cancelled');
  });
});
