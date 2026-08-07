import { withSearchNavSwitchRuntimeAttribution } from '../shared/search-nav-switch-runtime-attribution';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

export type CameraIntent = {
  center: [number, number];
  zoom: number;
  bearing?: number | null;
  pitch?: number | null;
  padding?: CameraSnapshot['padding'];
  animationMode?: 'none' | 'easeTo';
  animationDurationMs?: number;
  allowDuringGesture?: boolean;
  requestToken?: number | null;
  deferControlledCameraStateUntilCompletion?: boolean;
};

type RawProgrammaticCameraAnimationCompletionPayload = {
  animationCompletionId: string | null;
  status: 'finished' | 'cancelled';
};

export type ProgrammaticCameraAnimationCompletionPayload =
  RawProgrammaticCameraAnimationCompletionPayload & {
    requestToken: number | null;
  };

export type CameraIntentArbiterWriters = {
  // D61 — the command channel is HONEST: it returns true only when a writer actually
  // executed the stop (cameraRef.setCamera reached a mounted camera). There is no
  // reject callback and no fire-and-forget native fallback anymore; "no writer" is a
  // synchronous `false`, and the arbiter PARKS the intent until a writer returns
  // (notifyCameraWriterAvailable) or a newer intent/user gesture supersedes it.
  commandCameraViewport?: (
    intent: CameraIntent & {
      completionId: string | null;
    }
  ) => boolean;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
  setMapBearing: (bearing: number | null) => void;
  setMapPitch: (pitch: number | null) => void;
  setMapCameraAnimation: (animation: {
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  }) => void;
};

/**
 * The commit lane's OUTCOME SPACE, closed. An intent executes, is replaced while in flight,
 * is surrendered by the watchdog — or is superseded WHILE PARKED, which is the one outcome
 * in which a committed intent genuinely disappears.
 *
 * F5704: `parkSuperseded` was the missing leg, and it was missing from the only leg the
 * instrument was commissioned for. A parked intent has no completion id to cancel, so both
 * discard sites were silent, while `commit()` had already returned `true` for that intent —
 * so `commitFitAllCamera`, whose contract says an unexecuted intent must be a RED bark and
 * never silence, emitted `commit=true` and said nothing. The list-world fitAll decree could
 * fail exactly as F1716 described with its instrument reporting success.
 */
export type CameraIntentArbiterCommitPathLeg =
  | 'parked'
  | 'replayed'
  | 'parkSuperseded'
  | 'watchdogRecommit'
  | 'surrendered';

export type CameraIntentArbiterOptions = {
  /**
   * D61 watchdog oracle — the OBSERVED composite camera (ViewportBoundsService.getCamera()).
   * The watchdog only arms when this reader exists: without a composite oracle a timer could
   * only fake a settle (intent-not-composite, the always-green disease), so it stays off.
   */
  getObservedCamera?: () => { center: [number, number]; zoom: number } | null;
  /** Injectable clock (specs use a fake). Returns a cancel function. Defaults to setTimeout. */
  scheduleWatchdogTimeout?: (callback: () => void, delayMs: number) => () => void;
  /**
   * The LOUD surrender channel — prod wires the crash-reporting breadcrumb + a __DEV__
   * console.error. A watchdog surrender means a committed animated intent neither completed,
   * nor landed on the composite, nor landed on a single re-commit: the lane gave up
   * deliberately and audibly instead of stranding the arbiter forever.
   */
  onWatchdogSurrender?: (detail: {
    completionId: string;
    target: { center: [number, number]; zoom: number };
    observed: { center: [number, number]; zoom: number } | null;
  }) => void;
  /** Attribution probe sink for the park/replay legs ([CAMCOMMIT-path], flag-gated). */
  logCommitPath?: (leg: CameraIntentArbiterCommitPathLeg, data?: Record<string, unknown>) => void;
};

/**
 * D61 watchdog slack over the declared animation duration. Only consulted when the native
 * completion event is ABSENT (the event is the primary settle signal; rnmapbox emits it at
 * animation end). The slack absorbs bridge/frame latency between "animation declared done"
 * and "event delivered" so a healthy completion always wins the race against the timer.
 */
export const CAMERA_WATCHDOG_SLACK_MS = 500;

/**
 * D61 watchdog composite tolerance: the observed camera counts as AT the committed target
 * only within these deltas (center in degrees, ~11m at the equator for 1e-4; zoom absolute).
 * Deliberately tight — the spec's RED arm proves a wrong region does NOT pass.
 */
export const CAMERA_WATCHDOG_CENTER_EPSILON_DEG = 1e-4;
export const CAMERA_WATCHDOG_ZOOM_EPSILON = 0.05;

const isObservedCameraAtTarget = (
  observed: { center: [number, number]; zoom: number },
  target: { center: [number, number]; zoom: number }
): boolean =>
  Math.abs(observed.center[0] - target.center[0]) <= CAMERA_WATCHDOG_CENTER_EPSILON_DEG &&
  Math.abs(observed.center[1] - target.center[1]) <= CAMERA_WATCHDOG_CENTER_EPSILON_DEG &&
  Math.abs(observed.zoom - target.zoom) <= CAMERA_WATCHDOG_ZOOM_EPSILON;

export class CameraIntentArbiter {
  private gestureActive = false;
  private pendingProgrammaticCameraCompletionId: string | null = null;
  private pendingProgrammaticCameraRequestToken: number | null = null;
  private pendingControlledCameraStateSync: {
    completionId: string;
    center: [number, number];
    zoom: number;
    bearing?: number | null;
    pitch?: number | null;
    shouldSyncPadding: boolean;
    padding: CameraSnapshot['padding'];
  } | null = null;
  // D56: the target of the CURRENTLY-IN-FLIGHT programmatic commit. The user perceives the
  // place the map is flying TO, not the frame it happens to be passing through, so an origin
  // captured while an intent is in flight must capture the TARGET (F1513 ruling). Set on every
  // commit; only ever READ while a completion is pending OR an intent is parked, so a settled
  // map always answers from the observed viewport instead.
  private lastCommittedCameraTarget: {
    center: [number, number];
    zoom: number;
    padding: CameraSnapshot['padding'];
  } | null = null;
  // D61 — a committed intent the command channel could not execute (camera host unmounted
  // mid-scene-switch). It is NOT dropped: it waits here until notifyCameraWriterAvailable()
  // replays it, a newer commit replaces it, or a user gesture supersedes it. This is the
  // bedrock obligation of the lane — a committed intent executes or is superseded, never
  // silently vanishes (F1716).
  private parkedIntent: CameraIntent | null = null;
  // D61 — the armed completion watchdog for the in-flight animated commit, if any.
  private pendingWatchdog: {
    completionId: string;
    intent: CameraIntent;
    retried: boolean;
    cancel: () => void;
  } | null = null;
  private nextProgrammaticCameraCompletionSeq = 0;
  private readonly programmaticCameraAnimationCompletionListeners = new Set<
    (payload: ProgrammaticCameraAnimationCompletionPayload) => void
  >();
  private onProgrammaticCameraAnimationComplete:
    | ((payload: ProgrammaticCameraAnimationCompletionPayload) => void)
    | null = null;
  private controlledCameraPaddingSyncHandler:
    | ((padding: CameraSnapshot['padding']) => void)
    | null = null;

  constructor(
    private readonly writers: CameraIntentArbiterWriters,
    private readonly options: CameraIntentArbiterOptions = {}
  ) {}

  public setProgrammaticCameraAnimationCompletionHandler(
    handler: ((payload: ProgrammaticCameraAnimationCompletionPayload) => void) | null
  ): void {
    this.onProgrammaticCameraAnimationComplete = handler;
  }

  public setControlledCameraPaddingSyncHandler(
    handler: ((padding: CameraSnapshot['padding']) => void) | null
  ): void {
    this.controlledCameraPaddingSyncHandler = handler;
  }

  public subscribeProgrammaticCameraAnimationCompletion(
    handler: (payload: ProgrammaticCameraAnimationCompletionPayload) => void
  ): () => void {
    this.programmaticCameraAnimationCompletionListeners.add(handler);
    return () => {
      this.programmaticCameraAnimationCompletionListeners.delete(handler);
    };
  }

  private notifyProgrammaticCameraAnimationCompletion(
    payload: ProgrammaticCameraAnimationCompletionPayload
  ): void {
    withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'notifyCompletion', () => {
      this.onProgrammaticCameraAnimationComplete?.(payload);
      this.programmaticCameraAnimationCompletionListeners.forEach((listener) => {
        listener(payload);
      });
    });
  }

  /**
   * F5704 — the terminal report for a parked intent that will never execute. A parked
   * intent has no completion id, so the commit-path leg IS its completion: exactly one
   * `parkSuperseded` per parked intent that is discarded, naming who took the camera and
   * what target was dropped. Callers that treated `commit() === true` as an oracle now
   * have a signal to subscribe to.
   */
  private dischargeParkedIntent(cause: 'gesture' | 'newerCommit'): void {
    const parked = this.parkedIntent;
    if (parked == null) {
      return;
    }
    this.parkedIntent = null;
    this.options.logCommitPath?.('parkSuperseded', {
      cause,
      center: parked.center,
      zoom: parked.zoom,
    });
  }

  private clearWatchdog(): void {
    if (this.pendingWatchdog != null) {
      this.pendingWatchdog.cancel();
      this.pendingWatchdog = null;
    }
  }

  public setGestureActive(isActive: boolean): void {
    withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'setGestureActive', () => {
      this.gestureActive = isActive;
      if (!isActive) {
        return;
      }
      // D61 — the user's gesture supersedes a parked intent: they took the camera; the
      // parked promise is theirs to overrule. Same law the pending-completion cancel below
      // has always encoded for in-flight animations — and, since F5704, reported the same
      // way: the discard is announced, not silent.
      this.dischargeParkedIntent('gesture');
      if (this.pendingProgrammaticCameraCompletionId == null) {
        return;
      }
      this.clearWatchdog();
      const cancelledCompletionId = this.pendingProgrammaticCameraCompletionId;
      const cancelledRequestToken = this.pendingProgrammaticCameraRequestToken;
      this.pendingProgrammaticCameraCompletionId = null;
      this.pendingProgrammaticCameraRequestToken = null;
      this.pendingControlledCameraStateSync = null;
      this.notifyProgrammaticCameraAnimationCompletion({
        animationCompletionId: cancelledCompletionId,
        status: 'cancelled',
        requestToken: cancelledRequestToken,
      });
    });
  }

  public commit(intent: CameraIntent): boolean {
    return this.commitInternal(intent, { isWatchdogRetry: false });
  }

  private commitInternal(
    intent: CameraIntent,
    { isWatchdogRetry }: { isWatchdogRetry: boolean }
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'commit', () => {
      if (this.gestureActive && intent.allowDuringGesture !== true) {
        return false;
      }
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          `[CAMCOMMIT] center=${JSON.stringify(intent.center)} zoom=${intent.zoom?.toFixed?.(2)} ` +
            `pad=${JSON.stringify(intent.padding ?? null)} mode=${intent.animationMode ?? 'none'} ` +
            `token=${intent.requestToken ?? 'null'}`
        );
      }
      const animationMode = intent.animationMode ?? 'none';
      // F5703 — a watchdog retry is the SAME episode, not a new one: same intent, same
      // armed id. Minting a fresh id here would strand every consumer that armed on the
      // original (they key on the id/token pair and evict only on a matching completion),
      // so the retry re-issues the CameraStop under the id already in flight.
      const retriedCompletionId = isWatchdogRetry
        ? this.pendingProgrammaticCameraCompletionId
        : null;
      const animation = {
        mode: animationMode,
        durationMs:
          typeof intent.animationDurationMs === 'number' &&
          Number.isFinite(intent.animationDurationMs)
            ? Math.max(0, intent.animationDurationMs)
            : 0,
        completionId:
          animationMode === 'none'
            ? null
            : (retriedCompletionId ??
              `camera-animation:${(this.nextProgrammaticCameraCompletionSeq += 1)}`),
      };
      const completionId = animation.completionId;
      const shouldSyncPadding = Object.prototype.hasOwnProperty.call(intent, 'padding');
      // A new commit supersedes whatever the lane was doing: the parked intent (newest
      // wins) and any armed watchdog for the prior animation. The parked drop is REPORTED
      // (F5704) — it is the one outcome in which a committed intent vanishes.
      this.dischargeParkedIntent('newerCommit');
      this.clearWatchdog();
      // F1374 — AND THE PRIOR PENDING COMPLETION. Superseding used to overwrite
      // `pendingProgrammaticCameraCompletionId` in silence, so whoever armed on the OLD
      // id was never told it would not arrive. Consumers that key state on the completion
      // (use-app-route-scene-camera-motion-target-runtime keeps two Maps by settleToken,
      // evicted only on a matching completion) then waited forever and hung the
      // scene-switch settle. `setGestureActive` has always notified 'cancelled' here; a
      // commit-side supersede owes exactly the same notification. One law, both paths:
      // an armed completion resolves EXACTLY ONCE — finished, or cancelled.
      //
      // F5703 EXCEPTION — a watchdog retry is NOT a supersede. It re-commits the same
      // intent under the same completion id, so the episode CONTINUES and the id is still
      // owed exactly one terminal resolution (the retry's own settle, or the bounded
      // surrender below). Cancelling here would resolve the wrong once: a successful
      // rescue reported downstream as a failure, tearing down the scene-switch settle the
      // watchdog just saved.
      if (!isWatchdogRetry && this.pendingProgrammaticCameraCompletionId != null) {
        const supersededCompletionId = this.pendingProgrammaticCameraCompletionId;
        const supersededRequestToken = this.pendingProgrammaticCameraRequestToken;
        this.pendingProgrammaticCameraCompletionId = null;
        this.pendingProgrammaticCameraRequestToken = null;
        this.pendingControlledCameraStateSync = null;
        this.notifyProgrammaticCameraAnimationCompletion({
          animationCompletionId: supersededCompletionId,
          status: 'cancelled',
          requestToken: supersededRequestToken,
        });
      }
      this.lastCommittedCameraTarget = {
        center: [intent.center[0], intent.center[1]],
        zoom: intent.zoom,
        padding: intent.padding ?? null,
      };
      if (this.writers.commandCameraViewport != null) {
        const executed =
          this.writers.commandCameraViewport({
            ...intent,
            completionId,
          }) === true;
        if (!executed) {
          // D61 PARK — the command channel has no writer right now (camera host unmounted
          // mid-scene-switch). The old lane dropped the intent here (F1716's stranding) and
          // then wrote the controlled JS state anyway, claiming a success it never had. Now
          // the intent waits, whole, and NOTHING downstream is told a lie: no controlled
          // state write, no pending completion, no deferred sync.
          //
          // F5703 — one path reaches here still HOLDING an armed completion: a watchdog
          // retry, whose supersede cancel is suppressed above because the episode was
          // continuing. Parking ends that episode (the host is gone), so the id resolves
          // here — exactly once, as cancelled. On every other path the supersede block
          // already resolved it and this is null.
          const strandedCompletionId = this.pendingProgrammaticCameraCompletionId;
          const strandedRequestToken = this.pendingProgrammaticCameraRequestToken;
          this.parkedIntent = intent;
          this.pendingProgrammaticCameraCompletionId = null;
          this.pendingProgrammaticCameraRequestToken = null;
          this.pendingControlledCameraStateSync = null;
          this.options.logCommitPath?.('parked', {
            center: intent.center,
            zoom: intent.zoom,
            mode: animationMode,
          });
          if (strandedCompletionId != null) {
            this.notifyProgrammaticCameraAnimationCompletion({
              animationCompletionId: strandedCompletionId,
              status: 'cancelled',
              requestToken: strandedRequestToken,
            });
          }
          return true;
        }
        this.pendingProgrammaticCameraCompletionId = completionId;
        this.pendingProgrammaticCameraRequestToken = intent.requestToken ?? null;
        this.pendingControlledCameraStateSync = null;
        if (intent.deferControlledCameraStateUntilCompletion && completionId) {
          this.pendingControlledCameraStateSync = {
            completionId,
            center: intent.center,
            zoom: intent.zoom,
            bearing: intent.bearing ?? null,
            pitch: intent.pitch ?? null,
            shouldSyncPadding,
            padding: intent.padding ?? null,
          };
          this.armWatchdog(completionId, intent, animation.durationMs, isWatchdogRetry);
          return true;
        }
        this.writers.setMapCameraAnimation(animation);
        if (shouldSyncPadding) {
          this.controlledCameraPaddingSyncHandler?.(intent.padding ?? null);
        }
        this.writers.setMapCenter(intent.center);
        this.writers.setMapZoom(intent.zoom);
        if (Object.prototype.hasOwnProperty.call(intent, 'bearing')) {
          this.writers.setMapBearing(intent.bearing ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(intent, 'pitch')) {
          this.writers.setMapPitch(intent.pitch ?? null);
        }
        if (completionId != null) {
          this.armWatchdog(completionId, intent, animation.durationMs, isWatchdogRetry);
        }
        return true;
      }
      // No command channel AT ALL (controlled-camera mode — the declarative writers are the
      // executor). Distinct from "channel present but hostless": here the state writers DO
      // move the camera, so writing them is execution, not a lie.
      this.pendingProgrammaticCameraCompletionId = completionId;
      this.pendingProgrammaticCameraRequestToken = intent.requestToken ?? null;
      this.pendingControlledCameraStateSync = null;
      this.writers.setMapCameraAnimation(animation);
      if (shouldSyncPadding) {
        this.controlledCameraPaddingSyncHandler?.(intent.padding ?? null);
      }
      this.writers.setMapCenter(intent.center);
      this.writers.setMapZoom(intent.zoom);
      if (Object.prototype.hasOwnProperty.call(intent, 'bearing')) {
        this.writers.setMapBearing(intent.bearing ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(intent, 'pitch')) {
        this.writers.setMapPitch(intent.pitch ?? null);
      }
      return true;
    });
  }

  /**
   * D61 — the camera host (re)mounted: replay the parked intent, if any, through the normal
   * commit path. Called from the map component's camera ref attach (a REAL component — the
   * scene body-spec hooks never commit effects, so the notification must not live there).
   * Returns true when a parked intent was replayed.
   */
  public notifyCameraWriterAvailable(): boolean {
    return withSearchNavSwitchRuntimeAttribution(
      'cameraIntentArbiter',
      'notifyCameraWriterAvailable',
      () => {
        const parked = this.parkedIntent;
        if (parked == null) {
          return false;
        }
        this.parkedIntent = null;
        this.options.logCommitPath?.('replayed', {
          center: parked.center,
          zoom: parked.zoom,
        });
        return this.commitInternal(parked, { isWatchdogRetry: false });
      }
    );
  }

  private armWatchdog(
    completionId: string,
    intent: CameraIntent,
    durationMs: number,
    isWatchdogRetry: boolean
  ): void {
    const getObservedCamera = this.options.getObservedCamera;
    if (getObservedCamera == null) {
      // No composite oracle → no watchdog: a bare timer could only fake a settle
      // (intent-not-composite). Prod always wires the oracle.
      return;
    }
    const schedule =
      this.options.scheduleWatchdogTimeout ??
      ((callback: () => void, delayMs: number): (() => void) => {
        const handle = setTimeout(callback, delayMs);
        return () => clearTimeout(handle);
      });
    const cancel = schedule(() => {
      this.handleWatchdogFire(completionId);
    }, durationMs + CAMERA_WATCHDOG_SLACK_MS);
    this.pendingWatchdog = {
      completionId,
      intent,
      retried: isWatchdogRetry,
      cancel,
    };
  }

  private handleWatchdogFire(completionId: string): void {
    const watchdog = this.pendingWatchdog;
    if (watchdog == null || watchdog.completionId !== completionId) {
      return;
    }
    this.pendingWatchdog = null;
    if (this.pendingProgrammaticCameraCompletionId !== completionId) {
      // Superseded/settled between arming and firing — nothing owed.
      return;
    }
    const target = this.lastCommittedCameraTarget;
    const observed = this.options.getObservedCamera?.() ?? null;
    if (target != null && observed != null && isObservedCameraAtTarget(observed, target)) {
      // The composite IS at the target — only the completion event was lost. Settling
      // 'finished' here is honest: the oracle is the rendered viewport, not the timer.
      this.handleProgrammaticCameraAnimationCompletion({
        animationCompletionId: completionId,
        status: 'finished',
      });
      return;
    }
    if (!watchdog.retried) {
      this.options.logCommitPath?.('watchdogRecommit', {
        center: watchdog.intent.center,
        zoom: watchdog.intent.zoom,
        observed,
      });
      this.commitInternal(watchdog.intent, { isWatchdogRetry: true });
      return;
    }
    // Bounded surrender — LOUD, never silent, never stuck: the deferred sync is discarded
    // (the map demonstrably is not at the target, so syncing JS state to it would lie) and
    // the arbiter frees up for the next intent.
    if (target != null) {
      this.options.logCommitPath?.('surrendered', {
        target: { center: target.center, zoom: target.zoom },
        observed,
      });
      this.options.onWatchdogSurrender?.({
        completionId,
        target: { center: [target.center[0], target.center[1]], zoom: target.zoom },
        observed,
      });
    }
    this.handleProgrammaticCameraAnimationCompletion({
      animationCompletionId: completionId,
      status: 'cancelled',
    });
  }

  public consumeProgrammaticCameraCompletion(completionId: string | null): boolean {
    if (
      !completionId ||
      this.gestureActive ||
      this.pendingProgrammaticCameraCompletionId !== completionId
    ) {
      return false;
    }
    this.pendingProgrammaticCameraCompletionId = null;
    this.pendingProgrammaticCameraRequestToken = null;
    if (this.pendingWatchdog?.completionId === completionId) {
      this.clearWatchdog();
    }
    return true;
  }

  private flushControlledCameraStateSync(
    completionId: string | null,
    status: 'finished' | 'cancelled'
  ): void {
    const pendingSync = this.pendingControlledCameraStateSync;
    if (!pendingSync || pendingSync.completionId !== completionId) {
      return;
    }
    this.pendingControlledCameraStateSync = null;
    if (status !== 'finished') {
      return;
    }
    this.writers.setMapCameraAnimation({
      mode: 'none',
      durationMs: 0,
      completionId: null,
    });
    if (pendingSync.shouldSyncPadding) {
      this.controlledCameraPaddingSyncHandler?.(pendingSync.padding);
    }
    this.writers.setMapCenter(pendingSync.center);
    this.writers.setMapZoom(pendingSync.zoom);
    if (Object.prototype.hasOwnProperty.call(pendingSync, 'bearing')) {
      this.writers.setMapBearing(pendingSync.bearing ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(pendingSync, 'pitch')) {
      this.writers.setMapPitch(pendingSync.pitch ?? null);
    }
  }

  public handleProgrammaticCameraAnimationCompletion(
    payload: RawProgrammaticCameraAnimationCompletionPayload
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution('cameraIntentArbiter', 'handleCompletion', () => {
      const requestToken = this.pendingProgrammaticCameraRequestToken;
      if (!this.consumeProgrammaticCameraCompletion(payload.animationCompletionId)) {
        return false;
      }
      this.flushControlledCameraStateSync(payload.animationCompletionId, payload.status);
      this.notifyProgrammaticCameraAnimationCompletion({
        ...payload,
        requestToken,
      });
      return true;
    });
  }

  public resolvePendingProgrammaticCameraAnimation(
    status: 'finished' | 'cancelled' = 'finished'
  ): boolean {
    return withSearchNavSwitchRuntimeAttribution(
      'cameraIntentArbiter',
      'resolvePendingCompletion',
      () => {
        const completionId = this.pendingProgrammaticCameraCompletionId;
        if (!completionId) {
          return false;
        }
        return this.handleProgrammaticCameraAnimationCompletion({
          animationCompletionId: completionId,
          status,
        });
      }
    );
  }

  public syncObservedCameraViewport({
    center,
    zoom,
  }: {
    center: [number, number];
    zoom: number;
  }): boolean {
    return withSearchNavSwitchRuntimeAttribution(
      'cameraIntentArbiter',
      'syncObservedCameraViewport',
      () => {
        if (this.pendingProgrammaticCameraCompletionId != null) {
          return false;
        }
        this.writers.setMapCameraAnimation({
          mode: 'none',
          durationMs: 0,
          completionId: null,
        });
        this.writers.setMapCenter(center);
        this.writers.setMapZoom(zoom);
        return true;
      }
    );
  }

  public hasPendingProgrammaticCameraCompletion(): boolean {
    return this.pendingProgrammaticCameraCompletionId != null;
  }

  /** D61 — spec/instrument seam: is an intent parked awaiting a camera writer? */
  public hasParkedCameraIntent(): boolean {
    return this.parkedIntent != null;
  }

  /**
   * D56 — the committed target of an IN-FLIGHT programmatic camera move (animating OR
   * parked awaiting a writer — D61), or null when the map is not under one. The origin
   * capture prefers this over the observed viewport for exactly that window: a flow
   * triggered mid-flight (or mid-park) departs from where the map is GOING (F1513).
   * A cancelled/finished animation clears the pending id, so this returns null again and
   * the observed viewport (the truth once settled) takes over.
   */
  public getInFlightCameraTarget(): {
    center: [number, number];
    zoom: number;
    padding: CameraSnapshot['padding'];
  } | null {
    if (this.parkedIntent != null) {
      const parked = this.parkedIntent;
      return {
        center: [parked.center[0], parked.center[1]],
        zoom: parked.zoom,
        padding: parked.padding ? { ...parked.padding } : null,
      };
    }
    if (this.pendingProgrammaticCameraCompletionId == null) {
      return null;
    }
    const target = this.lastCommittedCameraTarget;
    return target == null
      ? null
      : {
          center: [target.center[0], target.center[1]],
          zoom: target.zoom,
          padding: target.padding ? { ...target.padding } : null,
        };
  }
}

export const createCameraIntentArbiter = (
  writers: CameraIntentArbiterWriters,
  options?: CameraIntentArbiterOptions
): CameraIntentArbiter => new CameraIntentArbiter(writers, options);
