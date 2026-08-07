import type {
  OriginSnapshot,
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';
import { getOriginSceneLiveState } from './origin-scene-live-state-registry';
import { stageOverlayScrollRestore } from '../../overlays/sceneScrollStateRegistry';
import { hasSearchSessionAboveRoot } from './app-overlay-route-stack-algebra';
import {
  registerRouteEntryOriginCapturer,
  registerRouteEntryOriginRestorer,
} from './route-entry-origin-capture-delegate';
import {
  commitRouteEntryOriginCamera,
  readRouteEntryOriginCamera,
} from './route-entry-origin-camera-delegate';
import { logCameraOriginDebug } from './pageswitch-debug-flag';
import { disarmOriginRestoreTripwire } from './route-entry-origin-half-pop-tripwire';
import { stageOriginSceneSegmentRestore } from '../../overlays/originSceneSegmentRuntime';
import {
  primeDockedSceneForHomeLanding,
  type AppSearchRouteCommandActions,
} from './app-search-route-command-runtime';
import { type OverlayKey, getAppOverlayRouteMetadata } from './app-overlay-route-types';
import { DOCKED_SCENE_KEY } from './docked-scene-target';
import {
  type AppRouteOverlaySessionActions,
  type AppRouteOverlaySessionAuthority,
  type AppRouteOverlaySessionSnapshot,
  type AppRouteSearchCloseRestoreOptions,
} from './app-route-overlay-session-contract';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from './app-route-sheet-snap-session-runtime';
import { resolveSearchLaunchOriginSnap } from './app-route-session-utils';
import type { RouteOverlayIdentitySnapshot } from './route-overlay-navigation-snapshot-contract';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { RouteSceneSwitchRequestInput } from './app-overlay-route-transition-contract';

type SnapshotSource<T> = {
  getSnapshot: () => T;
};

type AppRouteOverlaySessionStateControllerArgs = {
  routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
};

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Capture).
// The degenerate snapshot is the minimal origin: a scene identity + its LIVE detent, with
// empty scroll/segment. The home roots capture EXACTLY this (see
// buildDockedRootOriginSnapshot); rich capture merges published live state onto it.
// D56: `camera` is null HERE by construction. The camera is attached ONLY by the push-commit
// capturer (below), never by the degenerate base and never by the dismiss-time origin build —
// an origin is captured at DEPARTURE, never at RETURN.
const degenerateSnapshot = (sceneKey: OverlayKey, detent: TabOverlaySnap): OriginSnapshot => ({
  sceneKey,
  sceneParams: null,
  detent,
  segment: null,
  scroll: [],
  camera: null,
});

// Return-to-origin foundation — TOP-LEVEL-RICH dismiss seam (the LAST gap).
//
// A favorites-as-search dismiss back to a TOP-LEVEL-RICH origin (lists / profile)
// used to paint BLANK: the close path emitted `terminalDismiss search→polls`
// (preserveOutgoingUntilSettle, presenting the dismissing search handoff for its sheet
// slide), and the boundary restore then re-rooted `polls→lists` swapImmediately —
// SUPERSEDING the in-flight terminalDismiss before it settled, which left a NATIVE
// presentation latch on the (now torn-down) outgoing handoff → blank until a fresh switch.
// Four JS-side refresh fixes failed; it must be fixed STRUCTURALLY by ELIMINATING the
// supersede: a top-level-rich dismiss re-roots DIRECTLY to the captured origin in ONE
// swapImmediately switch, with NO `terminalDismiss→polls` intermediate (so nothing to
// supersede).
//
// `isTopLevelRichSeededOrigin` is the SAME richness gate restorePendingOrigin reads,
// further scoped to SEEDED re-root targets (lists / profile) — scenes that paint their own
// skeleton shell on frame 1, so a swapImmediately re-root reveals cleanly with no held outgoing.
// It is NOT a degenerate home origin (those short-circuit to the byte-identical home switch
// BEFORE this branch) and NOT a re-pushable CHILD origin (a poll-discussion comment, which keeps
// the existing motionless-re-root + rising openChild path that already works).
//
// CORRECTNESS is self-contained: restorePendingOrigin sets `contentHandoff:'swapImmediately'`
// EXPLICITLY for any target in this set (it no longer relies on the target also being listed in
// `SEEDED_FORWARD_OPEN_SCENES` in app-route-scene-transition-policy-runtime.ts). The policy set
// still governs the FORWARD-open handoff for these scenes; this set is the dismiss-restore axis.
const SEEDED_TOP_LEVEL_RESTORE_TARGETS = new Set<OverlayKey>(['lists', 'profile']);

const resolveRestoreRootOverlay = (snapshot: OriginSnapshot): OverlayKey =>
  snapshot.sceneKey === DOCKED_SCENE_KEY ? 'search' : snapshot.sceneKey;

// D56 — the camera is DELIBERATELY NOT a richness axis. A home departure captures a camera like
// any other push, and it must still take the byte-identical degenerate home emission (the
// {polls,search}@collapsed deadlock seam). The camera restores on its OWN lane, in the origin
// restorer, alongside the detent and scroll lanes — it never becomes a `cameraIntent` on the home
// switch args (assertDegenerateHomeEmission forbids exactly that, and a spec proves a
// camera-bearing origin cannot flip this predicate or that emission).
const isDegenerateHomeOrigin = (snapshot: OriginSnapshot): boolean =>
  snapshot.scroll.length === 0 &&
  snapshot.sceneParams == null &&
  (snapshot.sceneKey === 'search' || snapshot.sceneKey === DOCKED_SCENE_KEY) &&
  snapshot.detent === 'collapsed';

// Return-to-origin foundation — GOLDEN ASSERTION (design §Home byte-identity proof).
// The DEGENERATE home restore is the {polls,search}@collapsed deadlock seam: it MUST emit a
// single `topLevelSwitch` to a root scene with `snapTo:collapsed` and the docked
// restore, and NOTHING that would attach a sheet/content motion plane that didn't exist
// before (no contentHandoff override, no routeAction, no routeParams, no chromeVisibilityTarget,
// no cameraIntent). If a future edit attaches one of those to the home emission it would
// regress the synchronous zero-plane idle-commit the deadlock seam relies on — this fires in
// __DEV__ at the emission site so the regression is caught at the source, not as a hang in QA.
const assertDegenerateHomeEmission = (
  args: RouteSceneSwitchRequestInput,
  expectedRoot: OverlayKey,
  expectedDetent: TabOverlaySnap,
  // Post-S-C.3 red team #2 (deliberate golden amendment): the ARMED clear-search lanes can
  // reach this emission with a session still on the stack (the terminal dance pops before it,
  // but the flush lanes do not) — the legacy setRoot would mint a fresh root and destroy the
  // surviving entries. When a session exists, the emission carries routeAction 'popToRoot';
  // the assertion REQUIRES exactly that conditional arm and still forbids everything else.
  expectPopToRoot: boolean
): void => {
  if (!__DEV__) {
    return;
  }
  const expectedDockedSceneRestoreSnap = expectedRoot === 'search' ? expectedDetent : null;
  const violations: string[] = [];
  if (args.targetSceneKey !== expectedRoot) {
    violations.push(`targetSceneKey=${args.targetSceneKey} (expected ${expectedRoot})`);
  }
  if (args.sheetTransitionKind !== 'topLevelSwitch') {
    violations.push(`sheetTransitionKind=${args.sheetTransitionKind} (expected topLevelSwitch)`);
  }
  if (args.sheetMotion?.kind !== 'snapTo' || args.sheetMotion.snap !== expectedDetent) {
    violations.push(
      `sheetMotion=${JSON.stringify(args.sheetMotion)} (expected snapTo:${expectedDetent})`
    );
  }
  if (args.dockedSceneRestoreSnap !== expectedDockedSceneRestoreSnap) {
    violations.push(
      `dockedSceneRestoreSnap=${String(args.dockedSceneRestoreSnap)} ` +
        `(expected ${String(expectedDockedSceneRestoreSnap)})`
    );
  }
  // Any of these would silently add a motion plane / content swap to home → deadlock-seam risk.
  if (args.contentHandoff != null) {
    violations.push(`contentHandoff=${args.contentHandoff} (expected absent)`);
  }
  if (expectPopToRoot ? args.routeAction !== 'popToRoot' : args.routeAction != null) {
    violations.push(
      `routeAction=${String(args.routeAction)} (expected ${expectPopToRoot ? "'popToRoot'" : 'absent'})`
    );
  }
  if (args.routeParams != null) {
    violations.push('routeParams present (expected absent)');
  }
  if (args.chromeVisibilityTarget != null) {
    violations.push('chromeVisibilityTarget present (expected absent)');
  }
  if (args.cameraIntent != null) {
    violations.push('cameraIntent present (expected absent)');
  }
  if (violations.length > 0) {
    const message =
      '[return-to-origin] GOLDEN ASSERTION FAILED — degenerate home restore emission diverged ' +
      'from the {polls,search}@collapsed deadlock-seam contract: ' +
      violations.join('; ');
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
};

const EMPTY_APP_ROUTE_OVERLAY_SESSION_SNAPSHOT: AppRouteOverlaySessionSnapshot = {
  shouldShowDockedSceneTarget: false,
};

const areAppRouteOverlaySessionSnapshotsEqual = (
  left: AppRouteOverlaySessionSnapshot,
  right: AppRouteOverlaySessionSnapshot
): boolean => left.shouldShowDockedSceneTarget === right.shouldShowDockedSceneTarget;

export class AppRouteOverlaySessionStateController {
  private readonly routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;

  private readonly routeSceneSwitchActions: RouteSceneSwitchTransitionActions;

  private readonly routeSearchCommandActions: AppSearchRouteCommandActions;

  private readonly routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;

  private readonly routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;

  private readonly listeners = new Set<() => void>();

  private readonly unsubscribers: Array<() => void> = [];

  private snapshot = EMPTY_APP_ROUTE_OVERLAY_SESSION_SNAPSHOT;

  public readonly authority: AppRouteOverlaySessionAuthority;

  public readonly actions: AppRouteOverlaySessionActions;

  constructor({
    routeOverlayIdentityAuthority,
    routeSceneSwitchActions,
    routeSearchCommandActions,
    routeSheetSnapSessionAuthority,
    routeSheetSnapSessionActions,
  }: AppRouteOverlaySessionStateControllerArgs) {
    this.routeOverlayIdentityAuthority = routeOverlayIdentityAuthority;
    this.routeSceneSwitchActions = routeSceneSwitchActions;
    this.routeSearchCommandActions = routeSearchCommandActions;
    this.routeSheetSnapSessionAuthority = routeSheetSnapSessionAuthority;
    this.routeSheetSnapSessionActions = routeSheetSnapSessionActions;
    this.authority = {
      subscribe: this.subscribe.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };
    this.actions = {
      captureSearchCloseOrigin: this.captureSearchCloseOrigin.bind(this),
      restoreSearchCloseOrigin: this.restoreSearchCloseOrigin.bind(this),
    };
    // F1367: computeSnapshot reads exactly two facts —
    // routeSceneSwitchActions.getPresentationFrame().laneKind and
    // sessionSnapshot.isDockedSceneDismissed (off routeSheetSnapSessionAuthority below).
    // routeOverlayRootAuthority and routeScenePolicyAuthority used to also trigger a
    // recompute here despite computeSnapshot never reading either — removed along with
    // the constructor args (root/policy churn can no longer change this controller's
    // one-boolean output, so it no longer subscribes to either).
    this.unsubscribers.push(
      routeSheetSnapSessionAuthority.subscribe(() => {
        this.recompute();
      }),
      // computeSnapshot PULL-reads getPresentationFrame().laneKind (the docked formula),
      // so this controller must also recompute on frame PUBLICATIONS — a results_dismissing
      // re-mint changes laneKind without touching the other subscribed authorities, which
      // otherwise left shouldShowDockedScene* stale until an unrelated poke. Disposal rides
      // the shared unsubscribers sweep.
      routeSceneSwitchActions.subscribePresentationFrame(() => {
        this.recompute();
      })
    );
    this.unsubscribers.push(
      // S-B origin-on-entry: the scene-switch controller snapshots the DEPARTING scene onto
      // every pushed entry through this seam. The departing key is passed EXPLICITLY (the
      // controller's own identity resolution is root-collapsed — wrong for child departures).
      registerRouteEntryOriginCapturer((departingSceneKey) => {
        // D56: the CAMERA joins the snapshot HERE and only here — the push-commit chokepoint,
        // before any motion, in the same instant as the detent/scroll/segment fields. Two halves
        // of one snapshot, one instant. (The old camera lane read the map a commit AND a scene
        // transition later, from a slot keyed to search commits — F1503/F1502.)
        // F1509: the detent is resolved child-aware INSIDE captureRichSceneOrigin (via
        // resolveLiveSceneDetent) — the registration-site detent patch that used to overwrite
        // the root-collapsed answer here is deleted with the collapse it compensated for.
        const originCamera = readRouteEntryOriginCamera();
        return {
          ...this.captureRichSceneOrigin(departingSceneKey),
          camera: originCamera,
        };
      }),
      registerRouteEntryOriginRestorer((origin) => {
        // Detent first (the pop switch's motion plan reads the remembered-snap ledger), then
        // the one-shot scroll lanes the revealed leg consumes on its next active frame.
        // Writer 'named': the origin-restore seam is a sanctioned seat writer (it restores the
        // gesture-placed capture — two-posture write contract, plans/root-snap-law.md §Leg 2).
        this.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
          sceneKey: origin.sceneKey,
          snap: origin.detent,
          writer: 'named',
        });
        origin.scroll.forEach((lane) => {
          stageOverlayScrollRestore(lane.laneKey, lane.offset);
        });
        // D56 — the CAMERA lane, a peer of the detent and scroll lanes. It rides EVERY pop that
        // stages an origin (closeActive / popToEntry / popToRoot), which is what kills the
        // half-pop (F1505): a pop that restored the sheet but left the map wherever the dismissed
        // world's fitAll put it. Committed through the CameraIntentArbiter by the registered port
        // — never a direct camera write from the router.
        logCameraOriginDebug('restore', {
          sceneKey: origin.sceneKey,
          detent: origin.detent,
          center: origin.camera?.center ?? null,
          zoom: origin.camera?.zoom ?? null,
        });
        commitRouteEntryOriginCamera(origin.camera);
        // F5417 — the half-pop tripwire's DISARM. The pop verb armed a pending slot when it
        // staged this origin; reaching the camera commit is the proof that the two halves of
        // the pop met. A slot that survives past the pop verb's return barks (F1505).
        disarmOriginRestoreTripwire();
      })
    );
    this.snapshot = this.computeSnapshot();
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }

  private subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getSnapshot(): AppRouteOverlaySessionSnapshot {
    return this.snapshot;
  }

  private recompute(): void {
    const nextSnapshot = this.computeSnapshot();
    if (areAppRouteOverlaySessionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  // F1509 — THE uncollapsed live-identity resolver. "Which scene is live" has one answer, and
  // this returns it (`liveSceneKey`, the active route entry's key) ALONGSIDE the collapsed root
  // answer (`dockedRootKey`) — because the docked-home dismiss lane genuinely wants the collapsed
  // fact (red-team ruling on the F1509 row). Callers name the fact they mean; nothing re-derives
  // either one. Note the push-commit capture lane still receives the departing scene key as an
  // EXPLICIT delegate parameter — that is NOT a workaround for this resolver: the reducer delivers
  // the pre-push active key atomically with the state mutation, before any authority publication,
  // and D56's camera capture is contractually keyed to that same parameter.
  private resolveLiveOriginIdentity(): { liveSceneKey: OverlayKey; dockedRootKey: OverlayKey } {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    return {
      liveSceneKey: routeOverlayIdentitySnapshot.activeOverlayRouteKey,
      dockedRootKey: routeOverlayIdentitySnapshot.rootOverlayKey,
    };
  }

  // F1509 — the live detent OF a given scene (the old registration-site detent patch, landed
  // where it belongs). A CHILD scene's live detent is the ONE physical sheet's remembered snap
  // for that scene; a root scene resolves through the two-posture seat ledger (home for
  // search/polls, the ONE shared content seat otherwise — the seat routing encodes the docked
  // nuances, keyed by the docked root). A child with no usable remembered snap degrades to the
  // root-seat resolution, byte-identical to the pre-rederivation fallback.
  private resolveLiveSceneDetent(sceneKey: OverlayKey, dockedRootKey: OverlayKey): TabOverlaySnap {
    if (getAppOverlayRouteMetadata(sceneKey).role === 'child') {
      const childSnap = this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap(sceneKey);
      if (childSnap != null && childSnap !== 'hidden') {
        return childSnap;
      }
    }
    return resolveSearchLaunchOriginSnap({
      overlay: dockedRootKey,
      homeSeatSnap:
        this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap(DOCKED_SCENE_KEY),
      contentSeatSnap: this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('lists'),
    });
  }

  // Return-to-origin foundation (P3) — RICH capture for a scrollable scene (lists; profile
  // joins in P5). The degenerate base carries the correct sceneKey + its LIVE detent
  // (resolveLiveSceneDetent — child-aware, F1509); onto it we merge the scene's OWN
  // live scroll lane(s), pulled from the scene live-state registry (the panel published a
  // getter that reads its live scroll SharedValue at call time). Reading from the registry —
  // not a render hook — satisfies the CLAUDE.md rule that capture providers read live
  // controller/runtime values. A scene that hasn't published yet (e.g. opened but never
  // scrolled) yields an empty scroll lane → still a valid rich top-level origin (non-root
  // sceneKey), never the degenerate-home short-circuit. The optional segment + sceneParams
  // getters carry the SEGMENTED-scene axes: the profile publisher (P5) populates both (active
  // sub-tab + profileUserId); lists publishes neither (they stay null).
  private captureRichSceneOrigin(sceneKey: OverlayKey): OriginSnapshot {
    const { dockedRootKey } = this.resolveLiveOriginIdentity();
    const detent = this.resolveLiveSceneDetent(sceneKey, dockedRootKey);
    const base = degenerateSnapshot(sceneKey, detent);
    const liveState = getOriginSceneLiveState(sceneKey);
    if (liveState == null) {
      return base;
    }
    // Red team RT-5: zero IS a meaningful restore target under shared warm legs (pop past a
    // deep-scrolled same-key sibling must return THIS entry's top-of-list) — the old >0 filter
    // made scroll-to-top unrestorable. The mounted-restore hook's no-pending guard still keeps
    // organic re-opens jump-free.
    const scroll = liveState.getScrollLanes();
    const segment = liveState.getSegment?.() ?? null;
    const sceneParams = liveState.getSceneParams?.() ?? null;
    return {
      ...base,
      scroll,
      segment,
      sceneParams,
    };
  }

  // F1508/F1509 — the dismiss lane's FALLBACK builder, keyed to the DOCKED ROOT by
  // construction (never the live scene: at dismiss time the live scene is the search session
  // being left, and "snapshot what you are leaving" is exactly the F1508 disease). The
  // collapsed answer is the one this lane genuinely wants (red-team ruling on F1509): the
  // clear-flush restore is a re-ROOT emission, so the only honest capture subject is the root
  // lane beneath the session. The HOME roots ('search'/DOCKED_SCENE_KEY) capture the
  // degenerate snapshot at their LIVE detent — home is the degenerate origin by design, its
  // scroll/segment restore rides the remembered-snap machinery, never the origin snapshot.
  // EVERY other root captures rich: captureRichSceneOrigin merges any published live
  // scroll/segment onto the degenerate base (and itself degrades to the base when the scene
  // never published).
  private buildDockedRootOriginSnapshot(): OriginSnapshot {
    const { liveSceneKey, dockedRootKey } = this.resolveLiveOriginIdentity();
    if (__DEV__ && liveSceneKey !== dockedRootKey && liveSceneKey !== 'search') {
      // F1508 tripwire: this fallback root-projects. Reaching it while a NON-search scene is
      // live above the root means a departure happened whose origin was never captured at push
      // commit — capture-at-departure is the law; snapshotting here is capture-at-return.
      // eslint-disable-next-line no-console
      console.warn(
        `[return-to-origin] dismiss fallback root-projects live '${liveSceneKey}' onto root ` +
          `'${dockedRootKey}' — the departure origin should have been captured at push commit (F1508)`
      );
    }
    const captured =
      dockedRootKey === 'search' || dockedRootKey === DOCKED_SCENE_KEY
        ? degenerateSnapshot(
            dockedRootKey,
            this.resolveLiveSceneDetent(dockedRootKey, dockedRootKey)
          )
        : this.captureRichSceneOrigin(dockedRootKey);
    return {
      ...captured,
      // D56 — THE FOURTH CAMERA LANE IS CLOSED HERE. This builder runs at DISMISS time
      // (captureSearchCloseOrigin, F1508): a camera on it would fly the map to the world the
      // user is dismissing. The return address for the camera is the one captured at PUSH
      // commit and carried on the popped entry; that origin reaches the arbiter through the
      // pop's own origin restore, not through this lane.
      camera: null,
    };
  }

  // F1508 — the dismiss lane's PRIMARY source: the per-entry origin captured at PUSH COMMIT on
  // the search-session entry above the root. Bedrock: an origin is captured at DEPARTURE, never
  // at RETURN — this IS the departure-time snapshot, carried on the entry the whole session.
  // Root-projected: this lane emits a re-ROOT (topLevelSwitch), so a CHILD-scene origin cannot
  // ride it (a search pushed over a child returns to that child via the pop machinery, not the
  // clear-flush restore) — a child origin falls back to the docked-root builder. Camera pinned
  // null (D56): the camera return address rides the pop's own origin restore, never this lane.
  private resolveSearchSessionEntryOrigin(): OriginSnapshot | null {
    const routeState = this.routeSceneSwitchActions.getRouteState();
    const sessionEntry = routeState.overlayRouteStack
      .slice(1)
      .find((entry) => entry.key === 'search');
    const origin = sessionEntry?.origin ?? null;
    if (origin == null || getAppOverlayRouteMetadata(origin.sceneKey).role === 'child') {
      return null;
    }
    return { ...origin, camera: null };
  }

  // S-C.4 item 3 step 2 — the close-restore origin is a VALUE the caller holds (entries-as-
  // values, one level up): capture at intent time, pass back to restoreSearchCloseOrigin at
  // restore time. The store ledger (pendingOriginRestoreContext + isSearchOriginRestorePending
  // + arm/commit/cancel/flush) is deleted — its only async consumer was the two-switch home
  // dance, whose restore now rides the dismiss verb's ONE terminalDismiss switch; the clear
  // lanes capture and restore synchronously within one call chain.
  private captureSearchCloseOrigin({
    searchRootRestoreSnap,
  }: AppRouteSearchCloseRestoreOptions = {}): OriginSnapshot | null {
    // F1508: the per-entry origin (captured at DEPARTURE, at push commit) is the return
    // address; the docked-root live build is only the fallback for the lanes that never
    // pushed a session entry (search live on the docked root) — where the live scene IS the
    // docked root, so the collapsed answer is correct by construction, not by accident.
    const resolvedOriginContext =
      this.resolveSearchSessionEntryOrigin() ?? this.buildDockedRootOriginSnapshot();
    return resolvedOriginContext?.sceneKey === 'search' && searchRootRestoreSnap
      ? {
          ...resolvedOriginContext,
          detent: searchRootRestoreSnap,
        }
      : resolvedOriginContext;
  }

  // Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore) —
  // the DEGENERATE home restore emission. This is the byte-identical base every dismiss
  // already emitted: the {polls,search}@collapsed deadlock seam's home-restore. It is the
  // ONE place the home switch is constructed; BOTH the captured-home-origin restore (via
  // restorePendingOrigin's degenerate short-circuit) and the no-origin fallback (via
  // restoreSearchCloseOrigin(null)) funnel through here, so the home emission can never
  // silently diverge between those two lanes. GOLDEN-GUARDED (assertDegenerateHomeEmission)
  // so a future edit that attaches a sheet/content plane to home — and would regress the
  // deadlock seam — fails loudly in dev rather than at runtime.
  private emitDegenerateHomeRestore(
    resolvedRootOverlay: OverlayKey,
    detent: Exclude<SearchOverlaySheetSnap, 'hidden'>
  ): void {
    const shouldRestoreDockedScene = resolvedRootOverlay === 'search';
    // S-C.3-B NOTE: the home emission needs NO pop arm — the stack pop happens at the
    // dismissal dance's FIRST switch (dismissAppSearchRouteResultsToHome, which used to
    // setRoot-collapse the stack; proven by the [SC3B] probe: this emission always ran on an
    // already-collapsed stack). Post-fix the surviving [search#home] makes this setRoot a
    // value-equal IDEMPOTENT no-op at the route layer — byte-identical emission, stack truth
    // preserved, golden contract untouched.
    const routeState = this.routeSceneSwitchActions.getRouteState();
    const shouldPopSession = hasSearchSessionAboveRoot(routeState);
    const homeSwitchArgs = {
      targetSceneKey: resolvedRootOverlay,
      sheetTransitionKind: 'topLevelSwitch' as const,
      sheetOpenerSource: 'routeCommand' as const,
      sheetMotion: { kind: 'snapTo' as const, snap: detent },
      dockedSceneRestoreSnap: shouldRestoreDockedScene ? detent : null,
      ...(shouldPopSession ? { routeAction: 'popToRoot' as const } : null),
    };
    assertDegenerateHomeEmission(homeSwitchArgs, resolvedRootOverlay, detent, shouldPopSession);
    this.routeSceneSwitchActions.requestOverlaySwitch(homeSwitchArgs);
  }

  // Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore §2/§3) —
  // ONE richness-gated restore path (the SOLE dismiss restore; the call-site fork is gone). The
  // outer discriminant is snapshot RICHNESS, not source:
  //   DEGENERATE = scroll empty/absent && sceneParams==null &&
  //                sceneKey ∈ {search,polls} && detent==='collapsed'.
  // A DEGENERATE snapshot short-circuits to the EXACT existing home switch (the
  // {polls,search}@collapsed deadlock seam's home-restore — byte-identical, golden-guarded)
  // and RETURNS; no rich/scroll stage runs. Everything else is RICH:
  //   - RICH (a non-collapsed top-level origin, e.g. polls@middle): emit the plain
  //     root restore with ONE `snapTo:detent` (the CAPTURED detent is authoritative; never
  //     `promoteAtLeast`) — BYTE-IDENTICAL to the pre-P1 home branch for any non-collapsed
  //     top-level snapshot (it differs from the degenerate short-circuit only in the captured
  //     detent, never collapsed here, so it isn't the deadlock-seam home case).
  private restorePendingOrigin(snapshot: OriginSnapshot): void {
    const resolvedRootOverlay = resolveRestoreRootOverlay(snapshot);
    // RICHNESS gate (design §Restore step 2). A home snapshot carries NO scroll, NO
    // sceneParams, a root sceneKey, and a collapsed detent — exactly what the degenerate
    // providers capture. Anything richer (a non-root scene, a non-collapsed detent, a scrolled
    // lane, captured sceneParams) routes to the rich branch. Those FOUR axes are the whole gate;
    // there is no fifth (F5407 deleted an unwritten `anchor` conjunct that could never fire).
    if (isDegenerateHomeOrigin(snapshot)) {
      // DEGENERATE short-circuit — UNCHANGED byte-identical home restore, then RETURN.
      this.emitDegenerateHomeRestore(resolvedRootOverlay, snapshot.detent);
      return;
    }
    // RICH restore. The structural discriminant for the ROOT sheet motion is the resolved root
    // overlay: the docked scene restores its own detent, every other root does not.
    // S-C.3-B step 3b: the child re-push machinery is DELETED — a search launched from a
    // child PUSHES over it now, so the child ENTRY survives and dismissal pops back to it. The
    // one axis a RICH restore additionally consults is SEEDED_TOP_LEVEL_RESTORE_TARGETS (below),
    // which decides the content handoff — that set is the discriminant, not any anchor.
    const shouldRestoreDockedScene = resolvedRootOverlay === 'search';
    // P3 SCROLL + P5 SEGMENT restore (design §Restore step 5/6). SEED the captured scroll
    // lane(s) AND the active SEGMENT for the origin scene BEFORE the re-root commits, so the
    // scene re-mounts/re-activates with both axes already staged. The scene's own restore (gated
    // on its first non-skeleton commit) then SEGMENT-SELECTS FIRST and scroll-restores SECOND, as
    // the SOLE writer that frame — never on the bare re-mount frame (the #1 jump-to-top cause).
    // Both seeds are pure store writes — they change NOTHING about the emitted switch args, so
    // the degenerate-home byte-identity is untouched (this branch is unreachable for home anyway).
    this.seedSceneRestoreState(snapshot);
    // P5 sceneParams axis: a captured profileUserId (foreign profile) re-roots THAT person's
    // profile via routeParams; own profile has null sceneParams and omits routeParams entirely
    // (byte-identical to today's param-less profile re-root). The home emission never reaches
    // here, so the golden assertion's "no routeParams on home" contract is untouched.
    const restoreRouteParams = snapshot.sceneParams != null ? snapshot.sceneParams : null;
    // A top-level-rich SEEDED restore target (lists/profile) sets its content handoff
    // EXPLICITLY — swapImmediately/skeleton-first — so the single-switch dismiss can NEVER orphan a
    // content plane regardless of the transition policy's SEEDED_FORWARD_OPEN_SCENES membership
    // (which used to be the sole, prose-coupled authority for that — the supersede→blank this seam
    // exists to kill). The plain
    // non-collapsed home root (search/polls) keeps its policy-resolved handoff — byte-identical.
    const useSwapImmediately = SEEDED_TOP_LEVEL_RESTORE_TARGETS.has(resolvedRootOverlay);
    this.routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: resolvedRootOverlay,
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap: snapshot.detent },
      ...(useSwapImmediately ? { contentHandoff: 'swapImmediately' as const } : {}),
      ...(restoreRouteParams != null ? { routeParams: restoreRouteParams } : {}),
      dockedSceneRestoreSnap: shouldRestoreDockedScene ? snapshot.detent : null,
    });
  }

  // P3 — stage the captured scroll lane(s) for the origin scene so the scene restores them on
  // its return. stageOverlayScrollRestore writes the per-scene scroll store + a ONE-SHOT pending
  // flag (keyed by laneKey=sceneIdentityKey); the scene's mounted-scroll runtime consumes the
  // flag once when it next becomes active with painted content, and scrolls there as the SOLE
  // writer that frame. Pure store writes (no React/route side effects), so the home byte-identity
  // is unaffected. A degenerate-home snapshot never reaches here (it returned in the short-
  // circuit), and an empty scroll seed is a harmless no-op.
  //
  // P5 — stage the captured SEGMENT for a segmented scene (profile) keyed by sceneKey. The
  // profile body-model runtime (the single segment owner) consumes it once on activation and
  // segment-selects BEFORE applying the scroll restore (the offset is only meaningful against
  // the captured segment's row extent). A null segment clears any stale pending — a no-op for
  // lists (publishes no segment).
  private seedSceneRestoreState(snapshot: OriginSnapshot): void {
    for (const lane of snapshot.scroll) {
      stageOverlayScrollRestore(lane.laneKey, lane.offset);
    }
    stageOriginSceneSegmentRestore(snapshot.sceneKey, snapshot.segment ?? null);
  }

  // ONE richness-gated restore verb (design §Restore step 7 + S-C.4 item 3 step 2): a captured
  // origin routes through restorePendingOrigin (degenerate home short-circuits to the golden
  // emission; rich re-roots directly); a NULL origin IS the degenerate home case — the docked-
  // polls re-arm is its own state priming (the captured-origin path drives the docked scene via the
  // snapshot's dockedSceneRestoreSnap instead). Same funnel guarantee as before: the home
  // emission is byte-identical whether or not an origin was captured.
  private restoreSearchCloseOrigin(origin: OriginSnapshot | null): void {
    if (origin != null) {
      this.restorePendingOrigin(origin);
      return;
    }
    primeDockedSceneForHomeLanding(this.routeSheetSnapSessionActions);
    this.emitDegenerateHomeRestore('search', 'collapsed');
  }

  private computeSnapshot(): AppRouteOverlaySessionSnapshot {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    // The docked decision reads the committed PresentationFrame (page-switch-master-plan.md
    // §9.2 site 5) — the old independent rootOverlayKey/chromeSurfaceTarget formula was the 5th
    // parallel derivation of "which scene is presented". laneKind already encodes the search
    // root + lane eligibility + dismissed/restore-intent gates; this controller's own session
    // flags stay layered on top exactly as before.
    const shouldShowDockedSceneTarget =
      this.routeSceneSwitchActions.getPresentationFrame().laneKind === 'docked' &&
      !sessionSnapshot.isDockedSceneDismissed;

    // F956(h): this used to return the same boolean under three names. One target, one name.
    return { shouldShowDockedSceneTarget };
  }
}

export const createAppRouteOverlaySessionStateController = (
  args: AppRouteOverlaySessionStateControllerArgs
): AppRouteOverlaySessionStateController => new AppRouteOverlaySessionStateController(args);
