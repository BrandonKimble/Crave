import type {
  OriginSnapshot,
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';
import { getOriginCaptureProvider, registerOriginCaptureProvider } from './origin-capture-registry';
import { getOriginSceneLiveState } from './origin-scene-live-state-registry';
import { stageOverlayScrollRestore } from '../../overlays/overlayScrollOffsetRuntime';
import {
  registerRouteEntryOriginCapturer,
  registerRouteEntryOriginRestorer,
} from './route-entry-origin-capture-delegate';
import { stageOriginSceneSegmentRestore } from '../../overlays/originSceneSegmentRuntime';
import type { AppSearchRouteCommandActions } from './app-search-route-command-runtime';
import {
  type OverlayKey,
  type OverlayRouteParamsMap,
  getAppOverlayRouteMetadata,
} from './app-overlay-route-types';
import {
  type AppRouteOverlaySessionActions,
  type AppRouteOverlaySessionAuthority,
  type AppRouteOverlaySessionControllerSharedSnapState,
  type AppRouteOverlaySessionSnapshot,
  type AppRouteSearchCloseRestoreOptions,
  type AppRouteSearchSessionEntryOptions,
} from './app-route-overlay-session-contract';
import type { LaunchIntentChildAnchor } from './app-route-types';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from './app-route-sheet-snap-session-runtime';
import type { RouteScenePolicySnapshot } from './app-route-scene-policy-contract';
import { resolveSearchLaunchOriginSnap } from './app-route-session-utils';
import type { RouteOverlayIdentitySnapshot } from './route-overlay-navigation-snapshot-contract';
import type { RouteOverlayRootSnapshot } from './route-overlay-display-snapshot-contract';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { RouteSceneSwitchRequestInput } from './app-overlay-route-transition-contract';

type OutputAuthority<T> = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => T;
};

type SnapshotSource<T> = {
  getSnapshot: () => T;
};

type RootSnapshotTargetAuthority = SnapshotSource<RouteOverlayRootSnapshot> & {
  registerTarget: (target: {
    syncRootSnapshot: (snapshot: RouteOverlayRootSnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

type AppRouteOverlaySessionStateControllerArgs = {
  routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;
  routeOverlayRootAuthority: RootSnapshotTargetAuthority;
  routeScenePolicyAuthority: OutputAuthority<RouteScenePolicySnapshot>;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
};

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Capture).
// The degenerate snapshot is the byte-equivalent of what createCurrentOriginContext
// produced before this scaffolding: a scene identity + its LIVE detent, with empty
// scroll/segment/anchor. Home ('search'|'polls') captures EXACTLY this; richer scenes
// fall back to it in P0 (their RICH providers — real scroll/segment/anchor — arrive in
// later phases). The launch childAnchor overlay is gone (S-C.3-B step 3b: the slot is deleted;
// same place the old code set `childAnchor: childAnchor ?? null`.
const degenerateSnapshot = (sceneKey: OverlayKey, detent: TabOverlaySnap): OriginSnapshot => ({
  sceneKey,
  sceneParams: null,
  detent,
  segment: null,
  scroll: [],
  anchor: null,
});

// Return-to-origin foundation — TOP-LEVEL-RICH dismiss seam (the LAST gap).
//
// A favorites-as-search dismiss back to a TOP-LEVEL-RICH origin (bookmarks / profile)
// used to paint BLANK: the close path emitted `terminalDismiss search→polls`
// (preserveOutgoingUntilSettle, presenting the dismissing search handoff for its sheet
// slide), and the boundary restore then re-rooted `polls→bookmarks` swapImmediately —
// SUPERSEDING the in-flight terminalDismiss before it settled, which left a NATIVE
// presentation latch on the (now torn-down) outgoing handoff → blank until a fresh switch.
// Four JS-side refresh fixes failed; it must be fixed STRUCTURALLY by ELIMINATING the
// supersede: a top-level-rich dismiss re-roots DIRECTLY to the captured origin in ONE
// swapImmediately switch, with NO `terminalDismiss→polls` intermediate (so nothing to
// supersede).
//
// `isTopLevelRichSeededOrigin` is the SAME richness gate restorePendingOrigin reads,
// further scoped to SEEDED re-root targets (bookmarks / profile) — scenes that paint their own
// skeleton shell on frame 1, so a swapImmediately re-root reveals cleanly with no held outgoing.
// It is NOT a degenerate home origin (those short-circuit to the byte-identical home switch
// BEFORE this branch) and NOT a re-pushable CHILD origin (a poll-discussion comment, which keeps
// the existing motionless-re-root + rising openChild path that already works).
//
// CORRECTNESS is self-contained: restorePendingOrigin sets `contentHandoff:'swapImmediately'`
// EXPLICITLY for any target in this set (it no longer relies on the target also being listed in
// `SEEDED_FORWARD_OPEN_SCENES` in app-route-scene-transition-policy-runtime.ts). The policy set
// still governs the FORWARD-open handoff for these scenes; this set is the dismiss-restore axis.
const SEEDED_TOP_LEVEL_RESTORE_TARGETS = new Set<OverlayKey>(['bookmarks', 'profile']);

const resolveRestoreRootOverlay = (snapshot: OriginSnapshot): OverlayKey =>
  snapshot.sceneKey === 'polls' ? 'search' : snapshot.sceneKey;

const isDegenerateHomeOrigin = (snapshot: OriginSnapshot): boolean =>
  (snapshot.scroll == null || snapshot.scroll.length === 0) &&
  (snapshot.anchor ?? null) == null &&
  snapshot.sceneParams == null &&
  (snapshot.sceneKey === 'search' || snapshot.sceneKey === 'polls') &&
  snapshot.detent === 'collapsed';

// Return-to-origin foundation — GOLDEN ASSERTION (design §Home byte-identity proof).
// The DEGENERATE home restore is the {polls,search}@collapsed deadlock seam: it MUST emit a
// single `topLevelSwitch` to a root scene with `snapTo:collapsed` and the docked-polls
// restore, and NOTHING that would attach a sheet/content motion plane that didn't exist
// before (no contentHandoff override, no routeAction, no routeParams, no chromeVisibilityTarget,
// no cameraIntent). If a future edit attaches one of those to the home emission it would
// regress the synchronous zero-plane idle-commit the deadlock seam relies on — this fires in
// __DEV__ at the emission site so the regression is caught at the source, not as a hang in QA.
const assertDegenerateHomeEmission = (
  args: RouteSceneSwitchRequestInput,
  expectedRoot: OverlayKey,
  expectedDetent: TabOverlaySnap
): void => {
  if (!__DEV__) {
    return;
  }
  const expectedDockedPollsRestoreSnap = expectedRoot === 'search' ? expectedDetent : null;
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
  if (args.dockedPollsRestoreSnap !== expectedDockedPollsRestoreSnap) {
    violations.push(
      `dockedPollsRestoreSnap=${String(args.dockedPollsRestoreSnap)} ` +
        `(expected ${String(expectedDockedPollsRestoreSnap)})`
    );
  }
  // Any of these would silently add a motion plane / content swap to home → deadlock-seam risk.
  if (args.contentHandoff != null) {
    violations.push(`contentHandoff=${args.contentHandoff} (expected absent)`);
  }
  if (args.routeAction != null) {
    violations.push(`routeAction=${args.routeAction} (expected absent)`);
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
  isSearchOriginRestorePending: false,
  shouldShowDockedPollsTarget: false,
  shouldShowDockedPolls: false,
  shouldShowPollsSheet: false,
};

const areAppRouteOverlaySessionSnapshotsEqual = (
  left: AppRouteOverlaySessionSnapshot,
  right: AppRouteOverlaySessionSnapshot
): boolean =>
  left.isSearchOriginRestorePending === right.isSearchOriginRestorePending &&
  left.shouldShowDockedPollsTarget === right.shouldShowDockedPollsTarget &&
  left.shouldShowDockedPolls === right.shouldShowDockedPolls &&
  left.shouldShowPollsSheet === right.shouldShowPollsSheet;

export class AppRouteOverlaySessionStateController {
  private readonly routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;

  private readonly routeSceneSwitchActions: RouteSceneSwitchTransitionActions;

  private readonly routeSearchCommandActions: AppSearchRouteCommandActions;

  private readonly routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;

  private readonly routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;

  private readonly listeners = new Set<() => void>();

  private readonly unsubscribers: Array<() => void> = [];

  private snapshot = EMPTY_APP_ROUTE_OVERLAY_SESSION_SNAPSHOT;

  // Re-entrancy guard for the top-level-rich dismiss seam (design §71). The first dismiss owns the
  public readonly authority: AppRouteOverlaySessionAuthority;

  public readonly actions: AppRouteOverlaySessionActions;

  constructor({
    routeOverlayIdentityAuthority,
    routeOverlayRootAuthority,
    routeScenePolicyAuthority,
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
      armSearchCloseRestore: this.armSearchCloseRestore.bind(this),
      commitSearchCloseRestore: this.commitSearchCloseRestore.bind(this),
      cancelSearchCloseRestore: this.cancelSearchCloseRestore.bind(this),
      prepareSearchSessionEntry: this.prepareSearchSessionEntry.bind(this),
      flushPendingSearchOriginRestore: this.flushPendingSearchOriginRestore.bind(this),
      requestDefaultPostSearchRestore: this.requestDefaultPostSearchRestore.bind(this),
    };
    this.unsubscribers.push(
      routeOverlayRootAuthority.registerTarget({
        attributionLabel: 'AppRouteOverlaySessionRoot',
        syncRootSnapshot: () => {
          this.recompute(true);
        },
      }),
      routeScenePolicyAuthority.subscribe(() => {
        this.handleNavRestorePending();
        this.recompute(true);
      }),
      routeSheetSnapSessionAuthority.subscribe(() => {
        this.handleNavRestorePending();
        this.recompute(true);
      }),
      // computeSnapshot PULL-reads getPresentationFrame().laneKind (the docked-polls formula),
      // so this controller must also recompute on frame PUBLICATIONS — a results_dismissing
      // re-mint changes laneKind without touching the other subscribed authorities, which
      // otherwise left shouldShowDockedPolls* stale until an unrelated poke. Disposal rides
      // the shared unsubscribers sweep.
      routeSceneSwitchActions.subscribePresentationFrame(() => {
        this.recompute(true);
      })
    );
    // Return-to-origin foundation — register the DEGENERATE home providers. 'search' and
    // 'polls' (the home roots) capture exactly the degenerate snapshot at their LIVE
    // detent, byte-equivalent to the old createCurrentOriginContext output. Other scenes
    // have no provider yet and ride the degenerate fallback in buildCurrentOriginSnapshot;
    // their RICH providers arrive in later phases.
    const captureDegenerateHomeOrigin = (): OriginSnapshot => {
      const { sceneKey, detent } = this.resolveLiveOriginIdentity();
      return degenerateSnapshot(sceneKey, detent);
    };
    // Return-to-origin foundation (P3) — register the RICH bookmarks provider. It reads the
    // bookmarks scene's OWN live scroll lane from the scene live-state registry (published
    // imperatively by the panel, never a render-body hook) and merges it onto the degenerate
    // base (which already carries sceneKey='bookmarks' + the LIVE detent). When the scene
    // hasn't published yet (cold) the merge is a no-op and the snapshot degrades to a plain
    // top-level bookmarks origin — still richer than home (a non-root sceneKey), so it routes
    // to the rich restore branch, never the degenerate-home short-circuit.
    //
    // P5 — register the RICH PROFILE provider (scroll + SEGMENT + sceneParams). Profile is a
    // SEGMENTED mounted-scroll scene: its SINGLE PUBLISHER (the profile body-model runtime, the
    // sole owner of the active segment) publishes scroll lane + active segment + the
    // profileUserId via the scene live-state registry. captureRichSceneOrigin merges all three
    // onto the degenerate base. Own-profile leaves profileUserId null (self-default); the
    // foreign-profile source publishes a non-null one — same provider, same merge.
    this.unsubscribers.push(
      registerOriginCaptureProvider('search', captureDegenerateHomeOrigin),
      registerOriginCaptureProvider('polls', captureDegenerateHomeOrigin),
      registerOriginCaptureProvider('bookmarks', () => this.captureRichSceneOrigin('bookmarks')),
      registerOriginCaptureProvider('profile', () => this.captureRichSceneOrigin('profile')),
      // S-B origin-on-entry: the scene-switch controller snapshots the DEPARTING scene onto
      // every pushed entry through this seam. The departing key is passed EXPLICITLY (the
      // controller's own identity resolution is root-collapsed — wrong for child departures).
      registerRouteEntryOriginCapturer((departingSceneKey) => {
        const captured = this.captureRichSceneOrigin(departingSceneKey);
        // Ledger item 7 (red team code#2): captureRichSceneOrigin's detent comes from
        // resolveLiveOriginIdentity, which is ROOT-collapsed (it only knows the top-level
        // lanes). For a CHILD departure the ONE physical sheet's remembered snap for that
        // scene is its live detent — same bug class as the scroll-lane mis-keying, one field
        // over. Root scenes keep the root resolution (it encodes the docked-polls nuances).
        if (getAppOverlayRouteMetadata(departingSceneKey).role !== 'child') {
          return captured;
        }
        const childSnap =
          this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap(departingSceneKey);
        return childSnap != null && childSnap !== 'hidden'
          ? { ...captured, detent: childSnap }
          : captured;
      }),
      registerRouteEntryOriginRestorer((origin) => {
        // Detent first (the pop switch's motion plan reads the remembered-snap ledger), then
        // the one-shot scroll lanes the revealed leg consumes on its next active frame.
        this.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
          sceneKey: origin.sceneKey,
          snap: origin.detent,
        });
        origin.scroll?.forEach((lane) => {
          stageOverlayScrollRestore(lane.laneKey, lane.offset);
        });
      })
    );
    this.handleNavRestorePending();
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

  private recompute(notify: boolean): void {
    const nextSnapshot = this.computeSnapshot();
    if (areAppRouteOverlaySessionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    if (notify) {
      this.listeners.forEach((listener) => {
        listener();
      });
    }
  }

  private getSharedSnapState(): AppRouteOverlaySessionControllerSharedSnapState {
    const overlaySheetPositionState = this.routeSheetSnapSessionAuthority.getSnapshot();
    return {
      hasUserSharedSnap: overlaySheetPositionState.hasUserSharedSnap,
      sharedSnap: overlaySheetPositionState.sharedSnap,
    };
  }

  // Return-to-origin foundation — the (sceneKey, live detent) of the active origin at
  // trigger time. sceneKey stays the ROOT overlay key (the collapsed scene identity:
  // search|polls|bookmarks|profile), byte-equivalent to the old createCurrentOriginContext
  // `rootOverlay`; the TRUE child-scene generalization (pollDetail/restaurant) is a later
  // phase. The detent is the LIVE snap (resolveSearchLaunchOriginSnap), not hard-coded.
  private resolveLiveOriginIdentity(): { sceneKey: OverlayKey; detent: TabOverlaySnap } {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const overlaySnap = this.getSharedSnapState();
    const sceneKey = routeOverlayIdentitySnapshot.rootOverlayKey;
    return {
      sceneKey,
      detent: resolveSearchLaunchOriginSnap({
        overlay: sceneKey,
        pollsSheetSnap: this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
        bookmarksSheetSnap:
          this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('bookmarks'),
        profileSheetSnap: this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('profile'),
        isDockedPollsDismissed: sessionSnapshot.isDockedPollsDismissed,
        hasUserSharedSnap: overlaySnap.hasUserSharedSnap,
        sharedSnap: overlaySnap.sharedSnap,
      }),
    };
  }

  // Return-to-origin foundation (P3) — RICH capture for a scrollable scene (bookmarks; profile
  // joins in P5). The degenerate base carries the correct sceneKey + LIVE detent
  // (resolveLiveOriginIdentity, the same source home uses); onto it we merge the scene's OWN
  // live scroll lane(s), pulled from the scene live-state registry (the panel published a
  // getter that reads its live scroll SharedValue at call time). Reading from the registry —
  // not a render hook — satisfies the CLAUDE.md rule that capture providers read live
  // controller/runtime values. A scene that hasn't published yet (e.g. opened but never
  // scrolled) yields an empty scroll lane → still a valid rich top-level origin (non-root
  // sceneKey), never the degenerate-home short-circuit. The optional segment + sceneParams
  // getters carry the SEGMENTED-scene axes: the profile publisher (P5) populates both (active
  // sub-tab + profileUserId); bookmarks publishes neither (they stay null).
  private captureRichSceneOrigin(sceneKey: OverlayKey): OriginSnapshot {
    const { detent } = this.resolveLiveOriginIdentity();
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

  // Source-agnostic capture: the active scene snapshots ITSELF via its registered
  // provider; absent one (every scene in P0 except the degenerate home providers), fall
  // back to the degenerate snapshot carrying the scene's identity + live detent. The
  // launch childAnchor is overlaid here (the same place the old createCurrentOriginContext
  // set `childAnchor: childAnchor ?? null`) so a restaurant/entity-from-comment origin
  // still round-trips its anchor — byte-identical to before.
  private buildCurrentOriginSnapshot(childAnchor?: LaunchIntentChildAnchor | null): OriginSnapshot {
    const { sceneKey } = this.resolveLiveOriginIdentity();
    // Fallback generalized (S-B origin-on-entry): a scene with NO registered provider still
    // captures rich (captureRichSceneOrigin merges any published live scroll/segment onto the
    // degenerate base, and itself degrades to the base when the scene never published) — so a
    // child scene opts into scroll capture with ONE publication hook call, zero registration.
    const captured =
      getOriginCaptureProvider(sceneKey)?.() ?? this.captureRichSceneOrigin(sceneKey);
    return {
      ...captured,
      anchor: childAnchor ?? captured.anchor ?? null,
    };
  }

  private armSearchCloseRestore({
    allowFallback = false,
    searchRootRestoreSnap,
  }: AppRouteSearchCloseRestoreOptions = {}): boolean {
    // S-C.3-B step 3b: the captured-origin SLOT is deleted — the terminal dismissal always
    // resolves the LIVE origin (the degenerate home build; pushed-session dismissals pop via
    // entry origins and never reach here).
    const resolvedOriginContext = allowFallback ? this.buildCurrentOriginSnapshot() : null;
    const nextOriginContext =
      resolvedOriginContext?.sceneKey === 'search' && searchRootRestoreSnap
        ? {
            ...resolvedOriginContext,
            detent: searchRootRestoreSnap,
          }
        : resolvedOriginContext;
    const shouldRestoreOrigin = nextOriginContext != null;
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(nextOriginContext);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
    return shouldRestoreOrigin;
  }

  private commitSearchCloseRestore(): boolean {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const hasPendingOrigin = sessionSnapshot.pendingOriginRestoreContext != null;
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(hasPendingOrigin);
    return hasPendingOrigin;
  }

  private cancelSearchCloseRestore(): void {
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(null);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
  }

  private prepareSearchSessionEntry(_options?: AppRouteSearchSessionEntryOptions): void {
    // S-C.3-B step 2 (plans/s-c-de-special-search.md): session-entry preparation is a NO-OP
    // for EVERY root — the session is a PUSH over whatever is on the stack (root or child; the
    // poll-dish flow pushes over the still-alive pollDetail entry), the pushed entry carries
    // its origin, and dismissal is a pop. The slot capture (childAnchor re-push) and the
    // re-root (ensureAppSearchRouteSearchEntry) compensated for stack destruction that no
    // longer happens; both delete with the rest of the slot machinery in step 3.
  }

  // Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore) —
  // the DEGENERATE home restore emission. This is the byte-identical base every dismiss
  // already emitted: the {polls,search}@collapsed deadlock seam's home-restore. It is the
  // ONE place the home switch is constructed; BOTH the captured-home-origin restore (via
  // restorePendingOrigin's degenerate short-circuit) and the no-pending-origin fallback (via
  // requestDefaultPostSearchRestore) funnel through here, so the home emission can never
  // silently diverge between those two lanes. GOLDEN-GUARDED (assertDegenerateHomeEmission)
  // so a future edit that attaches a sheet/content plane to home — and would regress the
  // deadlock seam — fails loudly in dev rather than at runtime.
  private emitDegenerateHomeRestore(
    resolvedRootOverlay: OverlayKey,
    detent: Exclude<SearchOverlaySheetSnap, 'hidden'>
  ): void {
    const shouldRestoreDockedPolls = resolvedRootOverlay === 'search';
    // S-C.3-B NOTE: the home emission needs NO pop arm — the stack pop happens at the
    // dismissal dance's FIRST switch (dismissAppSearchRouteResultsToPolls, which used to
    // setRoot-collapse the stack; proven by the [SC3B] probe: this emission always ran on an
    // already-collapsed stack). Post-fix the surviving [search#home] makes this setRoot a
    // value-equal IDEMPOTENT no-op at the route layer — byte-identical emission, stack truth
    // preserved, golden contract untouched.
    const homeSwitchArgs = {
      targetSceneKey: resolvedRootOverlay,
      sheetTransitionKind: 'topLevelSwitch' as const,
      sheetOpenerSource: 'routeCommand' as const,
      sheetMotion: { kind: 'snapTo' as const, snap: detent },
      dockedPollsRestoreSnap: shouldRestoreDockedPolls ? detent : null,
    };
    assertDegenerateHomeEmission(homeSwitchArgs, resolvedRootOverlay, detent);
    this.routeSceneSwitchActions.requestOverlaySwitch(homeSwitchArgs);
  }

  // Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore §2/§3) —
  // ONE richness-gated restore path (the SOLE dismiss restore; the call-site fork is gone). The
  // outer discriminant is snapshot RICHNESS, not source:
  //   DEGENERATE = scroll empty/absent && anchor==null && sceneParams==null &&
  //                sceneKey ∈ {search,polls} && detent==='collapsed'.
  // A DEGENERATE snapshot short-circuits to the EXACT existing home switch (the
  // {polls,search}@collapsed deadlock seam's home-restore — byte-identical, golden-guarded)
  // and RETURNS; no rich/scroll/anchor stage runs. Everything else is RICH:
  //   - WITH a CHILD origin (resolveChildOriginRePush returns a descriptor; this phase the only
  //     rich source is a poll-discussion COMMENT, anchor.sceneKey==='pollDetail'): re-root the
  //     origin root route BENEATH the child WITHOUT a visible sheet motion (`sheetMotion:none` +
  //     `swapImmediately` → NO 'sheet' plane, NO bare-map collapse-snap), then the GENERIC child
  //     PUSH is the SINGLE visible transition, rising straight to the child's risingSnap (the
  //     reveal played backward). The child scene + params come from the anchor via the resolver,
  //     NOT a `pollDetail`-literal branch here — adding a new rich child source is one new
  //     resolver branch, nothing in this machinery.
  //   - WITHOUT a child (a non-collapsed top-level origin, e.g. polls@middle): emit the plain
  //     root restore with ONE `snapTo:detent` (the CAPTURED detent is authoritative; never
  //     `promoteAtLeast`) — BYTE-IDENTICAL to the pre-P1 home branch for any non-collapsed
  //     top-level snapshot (it differs from the degenerate short-circuit only in the captured
  //     detent, never collapsed here, so it isn't the deadlock-seam home case).
  private restorePendingOrigin(snapshot: OriginSnapshot): void {
    const resolvedRootOverlay = resolveRestoreRootOverlay(snapshot);
    // RICHNESS gate (design §Restore step 2). A home snapshot carries NO scroll, NO anchor,
    // NO sceneParams, a root sceneKey, and a collapsed detent — exactly what the degenerate
    // providers capture. Anything richer (a child anchor, a non-root scene, a non-collapsed
    // detent, a scrolled lane) routes to the rich branch.
    if (isDegenerateHomeOrigin(snapshot)) {
      // DEGENERATE short-circuit — UNCHANGED byte-identical home restore, then RETURN.
      this.emitDegenerateHomeRestore(resolvedRootOverlay, snapshot.detent);
      return;
    }
    // RICH restore. The structural discriminant for the ROOT sheet motion is whether the captured
    // origin carries a re-pushable CHILD (resolved generically from the anchor), NOT a literal
    // scene-key test.
    // S-C.3-B step 3b: the child re-push machinery is DELETED — a search launched from a
    // child PUSHES over it now, so the child ENTRY survives and dismissal pops back to it.
    const shouldRestoreDockedPolls = resolvedRootOverlay === 'search';
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
    // A top-level-rich SEEDED restore target (bookmarks/profile) sets its content handoff
    // EXPLICITLY — swapImmediately/skeleton-first — so the single-switch dismiss can NEVER orphan a
    // content plane regardless of the transition policy's SEEDED_FORWARD_OPEN_SCENES membership
    // (which used to be the sole, prose-coupled authority for that — the supersede→blank this seam
    // exists to kill). The childRePush branch is explicit for the same reason. The plain
    // non-collapsed home root (search/polls) keeps its policy-resolved handoff — byte-identical.
    const useSwapImmediately = SEEDED_TOP_LEVEL_RESTORE_TARGETS.has(resolvedRootOverlay);
    this.routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: resolvedRootOverlay,
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap: snapshot.detent },
      ...(useSwapImmediately ? { contentHandoff: 'swapImmediately' as const } : {}),
      ...(restoreRouteParams != null ? { routeParams: restoreRouteParams } : {}),
      dockedPollsRestoreSnap: shouldRestoreDockedPolls ? snapshot.detent : null,
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
  // bookmarks (publishes no segment).
  private seedSceneRestoreState(snapshot: OriginSnapshot): void {
    const scrollLanes = snapshot.scroll ?? [];
    for (const lane of scrollLanes) {
      stageOverlayScrollRestore(lane.laneKey, lane.offset);
    }
    stageOriginSceneSegmentRestore(snapshot.sceneKey, snapshot.segment ?? null);
  }

  private flushPendingSearchOriginRestore(): boolean {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const pendingOrigin = sessionSnapshot.pendingOriginRestoreContext;
    if (!pendingOrigin) {
      return false;
    }
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(null);
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
    // ONE richness-gated path — pass the WHOLE captured snapshot so the restore can read
    // richness (scroll/anchor/sceneParams/detent) itself; a degenerate home origin short-
    // circuits to the byte-identical home emission, a pollDetail-anchored origin re-pushes
    // the EXACT poll.
    this.restorePendingOrigin(pendingOrigin);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
    return true;
  }

  // Return-to-origin foundation (design §Restore step 7) — the no-pending-origin fallback is
  // NO LONGER a separate restore lane: a dismiss with no captured origin IS the degenerate
  // home case, so it funnels through the SAME emitDegenerateHomeRestore the captured-home
  // origin uses. This guarantees the home emission is byte-identical whether or not an origin
  // was captured. The docked-polls re-arm (recordRouteSceneSheetSettle('polls','collapsed') +
  // setIsDockedPollsDismissed(false)) is preserved BEFORE the switch — it is the no-origin
  // fallback's own state priming (the captured-origin path drives the docked polls via the
  // snapshot's dockedPollsRestoreSnap instead). No `options`/mode param: the old `chrome-only`
  // invisible-re-root sub-lane was dead and is removed — the rich restore owns the motionless
  // re-root via its own sheetMotion:none.
  private requestDefaultPostSearchRestore(): void {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
    if (sessionSnapshot.pendingOriginRestoreContext) {
      this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
      return;
    }
    this.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap: 'collapsed',
    });
    this.routeSheetSnapSessionActions.setIsDockedPollsDismissed(false);
    this.emitDegenerateHomeRestore('search', 'collapsed');
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
  }

  private computeSnapshot(): AppRouteOverlaySessionSnapshot {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    // The docked-polls decision reads the committed PresentationFrame (page-switch-master-plan.md
    // §9.2 site 5) — the old independent rootOverlayKey/chromeSurfaceTarget formula was the 5th
    // parallel derivation of "which scene is presented". laneKind already encodes the search
    // root + lane eligibility + dismissed/restore-intent gates; this controller's own session
    // flags stay layered on top exactly as before.
    const shouldShowDockedPollsTarget =
      this.routeSceneSwitchActions.getPresentationFrame().laneKind === 'docked-polls' &&
      !sessionSnapshot.isSearchOriginRestorePending &&
      !sessionSnapshot.isDockedPollsDismissed;

    return {
      isSearchOriginRestorePending: sessionSnapshot.isSearchOriginRestorePending,
      shouldShowDockedPollsTarget,
      shouldShowDockedPolls: shouldShowDockedPollsTarget,
      shouldShowPollsSheet: shouldShowDockedPollsTarget,
    };
  }

  private handleNavRestorePending(): void {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    if (!sessionSnapshot.isNavRestorePending) {
      return;
    }
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    if (routeOverlayIdentitySnapshot.rootOverlayKey !== 'search') {
      this.routeSheetSnapSessionActions.setNavRestorePending(false);
      return;
    }
    if (!this.computeSnapshot().shouldShowDockedPollsTarget) {
      return;
    }
    if (this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls') === 'hidden') {
      return;
    }
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
  }
}

export const createAppRouteOverlaySessionStateController = (
  args: AppRouteOverlaySessionStateControllerArgs
): AppRouteOverlaySessionStateController => new AppRouteOverlaySessionStateController(args);
