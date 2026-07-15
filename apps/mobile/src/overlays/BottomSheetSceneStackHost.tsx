import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import {
  type TransitionLanePlayer,
  resolveContentLaneOpacities,
  resolveHeaderSwap,
  useTransitionLanePlayer,
} from '../navigation/runtime/transition-engine/transition-lane-player';
import type { ContentMode } from '../navigation/runtime/transition-engine/transition-descriptor-contract';
import { deriveHostTokenDescriptor } from '../navigation/runtime/transition-engine/host-token-transition-adapter';
import { registerDismissBoundarySwapGate } from '../navigation/runtime/transition-engine/dismiss-boundary-swap-gate';

import { SceneStackBodyContentLayer, SceneStackBodyFrame } from './BottomSheetSceneStackBodyLayer';
import { SceneStackDecorLayer } from './BottomSheetSceneStackDecorLayers';
import {
  BottomSheetSceneStackPageFrame,
  HeaderScrollDivider,
} from './BottomSheetSceneStackPageFrame';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { OVERLAY_TAB_HEADER_HEIGHT } from './overlaySheetStyles';
import type {
  BottomSheetSceneStackBodyRuntimeSnapshot,
  BottomSheetSceneStackChromeEntry,
  BottomSheetSceneStackHostProps,
} from './bottomSheetSceneStackHostContract';
import type { SceneStackBodyContentActivity } from './bottomSheetSceneStackBodyLayerContract';
import { bottomSheetSceneStackHostStyles as styles } from './bottomSheetSceneStackHostStyles';
import {
  areSearchRouteSceneStackBodyContentEntriesEqual,
  areSearchRouteSceneStackBodyTransportEntriesEqual,
} from './searchRouteSceneStackSheetContract';
import type { OverlayKey } from './types';
import type {
  AppRouteSceneStackBodySurfaceSnapshot,
  AppRouteSceneStackScenePresentationSnapshot,
} from '../navigation/runtime/app-route-scene-stack-surface-contract';
import {
  APP_ROUTE_SCENE_INPUT_KEYS,
  isSceneBodyDataActivityKey,
} from '../navigation/runtime/app-route-scene-input-registry';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { areSceneEntryMountUnitArraysEqual } from '../navigation/runtime/app-route-scene-entry-mounts';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { SearchResultsPageBundleHost } from './SearchMountedScenePageBundleAuthority';
import { SceneLoadingSurface } from '../components/skeletons';
import { SceneBodySceneKeyContext } from './SceneBodyReadyGate';
import {
  joinSceneChromeAck,
  resolveSceneChromeHeight,
  type ChromeAckJoinCancel,
} from './scene-chrome-ack-runtime';
import { getSceneFoundationSpec } from '../navigation/runtime/scene-foundation-spec';
import { PersistentSheetHeaderHost } from './PersistentSheetHeaderHost';
import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useSceneHeaderScrollOffset } from './sceneScrollStateRegistry';

const PERSISTENT_ROUTE_SCENE_STACK_KEYS: readonly OverlayKey[] = APP_ROUTE_SCENE_INPUT_KEYS;

// ── Four-lane player split (Phase 2 live cutover) ──────────────────────────────
// REPLACES the legacy whole-leg crossfade ramp (the single `animatedLegOpacityStyle` that faded
// header + plate + body together over the 250ms `transitionProgress` clock). The host now owns a
// four-lane player (useTransitionLanePlayer): ONE press-up-started `progress` + ONE `paintAck` gate.
// The leg opacity is SPLIT across the per-leg sub-layers (sheet-frost-architecture, owner hard req):
//   • HEADER region (toggle strip + close button + THEIR CUTOUTS) → resolveHeaderSwap(paintAck):
//     INSTANT swap, NEVER fades → the cutouts always reveal the constant frosted-map.
//   • WHITE PLATE (background, with cutouts) → resolveHeaderSwap too: HARD swap, stays opaque (no
//     map leak in the solid areas).
//   • BODY region → resolveContentLaneOpacities(progress, paintAck, mode): the ONLY thing that
//     cross-dissolves, over the constant frost, per ContentMode (hard = paint-ack-gated immediate
//     swap; held-dissolve = hold outgoing opaque then dissolve).
// Every scene is still a co-mounted absolute-fill sibling toggled by role; the player's outputs are a
// {outgoing, incoming} opacity PAIR, and each leg picks its component by its role (below).
// SHEET-Y is NOT in the player this phase — translateY stays with the kept spring runtime (no
// double-driver); the player's `progress` is a pure clock for the body dissolve + header swap timing.
type SceneStackLegRole = 'incoming' | 'outgoing' | 'idle';

// ── THE UI-THREAD SWAP LANE (owner finger-test round 1: content-swap lag) ─────────────────────
// The presented/outgoing pair as a SharedValue, written SYNCHRONOUSLY inside the controller's PF
// flush — the same JS instant the sheet-motion command is written — so the leg opacity worklets
// flip on the NEXT UI FRAME instead of waiting for the React commit. Attribution (timestamped
// [pageswitch] probes, 2026-07-02): the motion command dispatches 1-2ms after the PF mint, but
// the commit that used to carry the role flip lands 33-146ms later — the owner saw the OLD page
// riding the sheet slide for that whole window. With this lane the swap latency is INDEPENDENT
// of commit weight. Rules:
//   • WRITER: the host alone (one-writer) — a synchronous subscribePresentationFrame callback
//     writes EARLY (warm-gated), and a commit-time layout effect reconciles UNCONDITIONALLY, so
//     the SV always converges to the committed frame (cold legs flip at commit, exactly the old
//     timing — never earlier than their first paintable frame).
//   • WARM GATE: the early write requires painted evidence for the incoming leg
//     (hasPaintedSceneKeys — same evidence the synthetic paint-ack trusts). A never-painted leg
//     must not flip early: it would reveal an empty layer over the frost. Its old content stays
//     until the commit paints the skeleton/body (status quo).
//   • HELD transitions (outgoing != null) also write early — the roles relabel is invisible
//     (outgoing keeps opacity 1 under paintAck 0) — and pin the paintAck/settleRamp HOLD in the
//     same write, closing the flush→commit window where a stale paintAck=1 would flash the
//     incoming leg before the player-start effect re-arms.
//   • Render-side legRole stays the truth for NON-PIXEL lanes (pointerEvents, zIndex, body
//     attach) — those reconcile at the commit; only opacity rides the SV.
type SceneStackLiveSwapRoles = {
  presented: OverlayKey;
  outgoing: OverlayKey | null;
};

// Pure worklet: this leg's role per the LIVE swap SV, falling back to the render-committed role
// before the first write. Same-scene re-entry resolves 'incoming' first (mirrors
// resolveSceneStackLegRole — no out-and-back self-flicker).
const resolveLiveLegRole = (
  sceneKey: OverlayKey,
  liveSwap: SceneStackLiveSwapRoles | null,
  renderLegRole: SceneStackLegRole
): SceneStackLegRole => {
  'worklet';
  if (liveSwap == null) {
    return renderLegRole;
  }
  if (sceneKey === liveSwap.presented) {
    return 'incoming';
  }
  if (sceneKey === liveSwap.outgoing) {
    return 'outgoing';
  }
  return 'idle';
};

type SceneStackTransitionDisplayValue = {
  player: TransitionLanePlayer;
  // The UI-thread swap lane (above). Read by every leg's opacity worklets; written only by the
  // host (sync PF subscription + commit reconcile).
  liveSwapRoles: SharedValue<SceneStackLiveSwapRoles | null>;
  // The content mode of the in-flight transition (derived from the incoming scene). Drives the
  // BODY-region dissolve; the header/plate always instant-swap regardless of mode.
  contentMode: ContentMode;
  // NOTE (2026-07-02 zero-JS-switch): the volatile role fields (effectiveIncoming/effectiveOutgoing/
  // isTransitioning) NO LONGER live on this context — they re-minted the whole value every switch,
  // re-rendering all 7 legs. Each leg now receives its role via a `legRole` PROP computed in the
  // surface host's render body (synchronous-in-render, Commit-A). This context is the STABLE PORTS
  // set (player/SV/contentMode/callbacks) whose identity survives a switch, so idle legs never
  // re-render from it. See computeLegRole + the .map below.
  // Paint-ack producer sink: the incoming body's first onLayout reports here. The host honors it
  // ONLY for the incoming scene of the live transition (markPaintAck), so an idle/outgoing leg's
  // re-layout can never flip the gate (#1 correctness: gate flips on the RIGHT scene's paint).
  reportScenePaint: (sceneKey: OverlayKey) => void;
  // Painted-EVIDENCE recorders for the synthetic warm-leg ack (§9.1, pulled forward from P4): a
  // warm retained leg never re-fires onLayout when it becomes incoming again, so without evidence
  // the hard swap holds it invisible forever (the stuck-blank). Any real layout records evidence;
  // a body detach invalidates it (a re-attach fires a real onLayout anyway).
  recordScenePainted: (sceneKey: OverlayKey) => void;
  recordSceneBodyAttached: (sceneKey: OverlayKey, attached: boolean) => void;
};

const SceneStackTransitionDisplayContext =
  React.createContext<SceneStackTransitionDisplayValue | null>(null);

// Pure worklet: pick the per-leg opacity from the player's {outgoing, incoming} pair by this leg's
// role. idle ⇒ 0. Used for BOTH the header-swap pair and the content-dissolve pair.
const pickLegOpacity = (
  pair: { outgoing: number; incoming: number },
  legRole: SceneStackLegRole
): number => {
  'worklet';
  if (legRole === 'incoming') {
    return pair.incoming;
  }
  if (legRole === 'outgoing') {
    return pair.outgoing;
  }
  return 0;
};

// Pure per-leg role: computed in the surface host's RENDER BODY (from effectiveIncoming/
// effectiveOutgoing) and passed to each leg as a `legRole` prop — synchronous-in-render, so a
// cold incoming leg's first onLayout / skeleton / pointerEvents all read the correct role in the
// SAME commit as the switch (no useSyncExternalStore post-render lag). A same-scene re-entry
// (outgoing === incoming) resolves to 'incoming' at full opacity — no out-and-back self-flicker.
const computeLegRole = (
  sceneKey: OverlayKey,
  effectiveIncoming: OverlayKey | null,
  effectiveOutgoing: OverlayKey | null
): SceneStackLegRole => {
  if (sceneKey === effectiveIncoming) {
    return 'incoming';
  }
  if (sceneKey === effectiveOutgoing) {
    return 'outgoing';
  }
  return 'idle';
};

// [pageswitch] P1 attribution probe (page-switch-master-plan.md §3). Emits per-commit JSONL to Metro
// so the 3-way "which scene is presented" race is readable: the HOST line (which legs paint, via
// effectiveIncoming/Outgoing) vs the per-LEG body line (which leg actually has a body). The bug
// signatures: a painting leg (role!=='idle') with bodyNull=true → blank frost (S2); the painting
// leg's key !== the pressed tab → wrong page (S1). __DEV__-only; kept post-P2 as the regression
// tripwire — retirement is governed by the post-soak cleanup ledger (master plan §9.5).
const logPageSwitch = (tag: string, data: Record<string, unknown>): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[pageswitch] ${tag} ${JSON.stringify(data)}`);
  }
};

const areChromeSurfaceEntriesEqual = (
  left: BottomSheetSceneStackChromeEntry | null,
  right: BottomSheetSceneStackChromeEntry | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sceneKey === right.sceneKey &&
    left.surfaceKind === right.surfaceKind &&
    left.mountedChromeKey === right.mountedChromeKey &&
    left.excludedSurfaces === right.excludedSurfaces &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

const areSceneContentActivitySelectionsEqual = (
  left: SceneStackBodyContentActivity,
  right: SceneStackBodyContentActivity,
  shouldCompareDataLane: boolean
): boolean =>
  left.isActive === right.isActive &&
  left.shouldRenderListBody === right.shouldRenderListBody &&
  left.shouldAttachMountedContent === right.shouldAttachMountedContent &&
  (!shouldCompareDataLane || left.shouldRunDataLane === right.shouldRunDataLane) &&
  left.shouldSubscribeDataLane === right.shouldSubscribeDataLane &&
  left.shouldRenderExpandedContent === right.shouldRenderExpandedContent &&
  left.hasActivatedExpandedContent === right.hasActivatedExpandedContent;

const shouldCompareSceneBodyDataActivity = (
  snapshot: AppRouteSceneStackBodySurfaceSnapshot
): boolean => isSceneBodyDataActivityKey(snapshot.contentEntry?.sceneKey);

const markSceneBodySurfaceSelectionDiff = (
  sceneKey: string | null | undefined,
  field: string,
  left: unknown,
  right: unknown
): void => {
  if (Object.is(left, right)) {
    return;
  }
  markSearchNavSwitchRuntimeAttribution(
    'SceneStackBodySurfaceSelectionDiff',
    `field:${sceneKey ?? 'unknown'}:${field}`
  );
  logPerfScenarioStackAttribution({
    owner: 'scene_stack_body_surface_selection_diff',
    path: `field:${sceneKey ?? 'unknown'}:${field}`,
  });
};

const getMountedBodyKey = (snapshot: AppRouteSceneStackBodySurfaceSnapshot): string | null => {
  const spec = snapshot.contentEntry?.bodyContentSpec;
  return spec?.surfaceKind === 'mounted' ? spec.mountedBodyKey : null;
};

const areSceneBodySurfaceSelectionsEqual = (
  left: AppRouteSceneStackBodySurfaceSnapshot,
  right: AppRouteSceneStackBodySurfaceSnapshot
): boolean => {
  const sceneKey = right.contentEntry?.sceneKey ?? left.contentEntry?.sceneKey ?? null;

  if (!areSearchRouteSceneStackBodyContentEntriesEqual(left.contentEntry, right.contentEntry)) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntryRef',
      left.contentEntry,
      right.contentEntry
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.sceneKey',
      left.contentEntry?.sceneKey ?? null,
      right.contentEntry?.sceneKey ?? null
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.surfaceKind',
      left.contentEntry?.bodyContentSpec.surfaceKind ?? null,
      right.contentEntry?.bodyContentSpec.surfaceKind ?? null
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentEntry.mountedBodyKey',
      getMountedBodyKey(left),
      getMountedBodyKey(right)
    );
    return false;
  }

  if (
    !areSearchRouteSceneStackBodyTransportEntriesEqual(left.transportEntry, right.transportEntry)
  ) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'transportEntryRef',
      left.transportEntry,
      right.transportEntry
    );
    return false;
  }

  // W1 slice 1 — entry-keyed child mounts are render-read by the body host (snapshot-equality
  // landmine: render-read fields MUST be compared here or a unit change never republishes).
  if (
    !areSceneEntryMountUnitArraysEqual(left.mountedEntryUnits, right.mountedEntryUnits) ||
    left.activeEntryId !== right.activeEntryId
  ) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'mountedEntryUnits',
      left.mountedEntryUnits,
      right.mountedEntryUnits
    );
    return false;
  }

  if (sceneKey === 'search') {
    return true;
  }

  const shouldCompareDataLane =
    shouldCompareSceneBodyDataActivity(left) || shouldCompareSceneBodyDataActivity(right);
  const isEqual = areSceneContentActivitySelectionsEqual(
    left.contentActivity,
    right.contentActivity,
    shouldCompareDataLane
  );
  if (!isEqual) {
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldRenderListBody',
      left.contentActivity.shouldRenderListBody,
      right.contentActivity.shouldRenderListBody
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldAttachMountedContent',
      left.contentActivity.shouldAttachMountedContent,
      right.contentActivity.shouldAttachMountedContent
    );
    if (shouldCompareDataLane) {
      markSceneBodySurfaceSelectionDiff(
        sceneKey,
        'contentActivity.shouldRunDataLane',
        left.contentActivity.shouldRunDataLane,
        right.contentActivity.shouldRunDataLane
      );
    }
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldSubscribeDataLane',
      left.contentActivity.shouldSubscribeDataLane,
      right.contentActivity.shouldSubscribeDataLane
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.shouldRenderExpandedContent',
      left.contentActivity.shouldRenderExpandedContent,
      right.contentActivity.shouldRenderExpandedContent
    );
    markSceneBodySurfaceSelectionDiff(
      sceneKey,
      'contentActivity.hasActivatedExpandedContent',
      left.contentActivity.hasActivatedExpandedContent,
      right.contentActivity.hasActivatedExpandedContent
    );
  }
  return isEqual;
};

const areSceneBodyRuntimeSelectionsEqual = (
  left: BottomSheetSceneStackBodyRuntimeSnapshot,
  right: BottomSheetSceneStackBodyRuntimeSnapshot
): boolean => {
  if (
    left.bodyDefaults === right.bodyDefaults &&
    left.bodyScrollRuntime === right.bodyScrollRuntime
  ) {
    return true;
  }
  if (left.bodyDefaults !== right.bodyDefaults) {
    logPerfScenarioStackAttribution({
      owner: 'scene_stack_body_runtime_selection_diff',
      path: 'field:bodyDefaults',
    });
    return false;
  }
  // Frame-drop fix (red-team-validated 2026-07-02): the SHARED bodyScrollRuntime object re-mints
  // whenever its JS `shouldEnableScroll` boolean toggles — which happens on EVERY page switch (the
  // transient interactionEnabled flip during the transition). That identity churn was busting this
  // selection and re-rendering the heavy list body (~45ms/switch, the biggest single cost). Now that
  // scrollEnabled is driven off the STABLE `shouldEnableScrollShared` SharedValue (useAnimatedProps
  // on the FlashList — verified to scroll), a shouldEnableScroll-ONLY re-mint changes nothing that
  // renders. Compare the render-affecting fields (all stable refs) and treat a shouldEnableScroll-
  // only delta as EQUAL so the list body no longer re-renders on a switch. (The JS `shouldEnableScroll`
  // is intentionally NOT compared; sinks that still read it get a stale-but-correct value — it is
  // `true` whenever the scene is active, and inactive legs are pointerEvents-blocked by the swap lane.)
  const l = left.bodyScrollRuntime;
  const r = right.bodyScrollRuntime;
  if (
    l.ScrollComponent === r.ScrollComponent &&
    l.shouldEnableScrollShared === r.shouldEnableScrollShared &&
    l.primaryScrollViewOnScroll === r.primaryScrollViewOnScroll &&
    l.primaryListOnScroll === r.primaryListOnScroll &&
    l.secondaryListOnScroll === r.secondaryListOnScroll &&
    l.scrollOffset === r.scrollOffset
  ) {
    return true;
  }
  logPerfScenarioStackAttribution({
    owner: 'scene_stack_body_runtime_selection_diff',
    path: 'field:bodyScrollRuntime',
  });
  return false;
};

type SceneStackChromePresentationSelection = {
  sceneChromeEntry: BottomSheetSceneStackChromeEntry | null;
};

const areSceneChromePresentationSelectionsEqual = (
  left: SceneStackChromePresentationSelection,
  right: SceneStackChromePresentationSelection
): boolean => areChromeSurfaceEntriesEqual(left.sceneChromeEntry, right.sceneChromeEntry);

export const BottomSheetSceneStackHost = ({
  sceneStackSurfaceAuthority,
  routeSceneDisplayTargetRegistry,
  shadowShellStyle,
  surfaceStyle,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  displayedSceneKey,
  outgoingSceneKey,
  incomingSceneKey,
  contentTransitionToken,
  onContentSettleComplete,
  bodyRuntimeAuthority,
}: BottomSheetSceneStackHostProps) => {
  useSearchNavSwitchCommitAttribution('BottomSheetSceneStackHost');
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const sceneStackHost = (
    <ActiveSceneStackHostLayers
      sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
      routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
      shadowShellStyle={shadowShellStyle}
      surfaceStyle={surfaceStyle}
      scrollHeaderComponent={scrollHeaderComponent}
      onHeaderLayout={onHeaderLayout}
      onScrollHeaderLayout={onScrollHeaderLayout}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
      displayedSceneKey={displayedSceneKey}
      outgoingSceneKey={outgoingSceneKey}
      incomingSceneKey={incomingSceneKey}
      contentTransitionToken={contentTransitionToken}
      onContentSettleComplete={onContentSettleComplete}
      bodyRuntimeAuthority={bodyRuntimeAuthority}
    />
  );

  if (!onProfilerRender) {
    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'BottomSheetSceneStackHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });
    return sceneStackHost;
  }

  const profiledSceneStackHost = (
    <React.Profiler id="BottomSheetSceneStackHost" onRender={onProfilerRender}>
      {sceneStackHost}
    </React.Profiler>
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'BottomSheetSceneStackHost',
    operation: 'render',
    startedAtMs: renderStartedAtMs,
  });

  return profiledSceneStackHost;
};

type SceneStackBodyLayerHostProps = Pick<
  BottomSheetSceneStackHostProps,
  'sceneStackSurfaceAuthority' | 'routeSceneDisplayTargetRegistry' | 'bodyRuntimeAuthority'
> & {
  sceneKey: OverlayKey;
  // This leg's role for THIS render, computed synchronous-in-render by the surface host. Changes
  // only for the 2 legs a switch involves → the memo comparator below re-renders only those two.
  legRole: SceneStackLegRole;
  // P3 body top-inset: the measured height of the ONE hoisted persistent header
  // (PersistentSheetHeaderHost → ActiveSceneStackSurfaceHost state). With the per-leg header lane
  // deleted, the page frame reserves the header lane off THIS height so every leg's body still
  // starts below the header. undefined until first measure → the page frame falls back to
  // OVERLAY_TAB_HEADER_HEIGHT (the same fallback the per-leg measurement path had).
  reservedHeaderHeight?: number;
};

type SceneStackBodyContentLayerHostProps = Pick<
  SceneStackBodyLayerHostProps,
  'sceneStackSurfaceAuthority' | 'bodyRuntimeAuthority' | 'sceneKey' | 'legRole'
>;

const areSceneStackBodyLayerHostPropsEqual = (
  previousProps: SceneStackBodyLayerHostProps,
  nextProps: SceneStackBodyLayerHostProps
): boolean => {
  if (
    previousProps.sceneKey !== nextProps.sceneKey ||
    previousProps.sceneStackSurfaceAuthority !== nextProps.sceneStackSurfaceAuthority ||
    previousProps.routeSceneDisplayTargetRegistry !== nextProps.routeSceneDisplayTargetRegistry
  ) {
    return false;
  }

  return (
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.reservedHeaderHeight === nextProps.reservedHeaderHeight &&
    previousProps.legRole === nextProps.legRole
  );
};

const areSceneStackBodyContentLayerHostPropsEqual = (
  previousProps: SceneStackBodyContentLayerHostProps,
  nextProps: SceneStackBodyContentLayerHostProps
): boolean =>
  previousProps.sceneKey === nextProps.sceneKey &&
  previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
  previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
  previousProps.legRole === nextProps.legRole;

const SceneStackBodyFrameHost = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    sceneKey,
    reservedHeaderHeight,
    legRole,
    children,
  }: Pick<
    SceneStackBodyLayerHostProps,
    | 'routeSceneDisplayTargetRegistry'
    | 'sceneStackSurfaceAuthority'
    | 'sceneKey'
    | 'reservedHeaderHeight'
    | 'legRole'
  > & {
    children: React.ReactNode;
  }) => {
    useSearchNavSwitchCommitAttribution(`SceneStackBodyFrameHost:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    // legRole is now a PROP (synchronous-in-render, from the surface host) — no context role read.
    const transitionDisplay = React.useContext(SceneStackTransitionDisplayContext);
    const player = transitionDisplay?.player ?? null;
    const contentMode = transitionDisplay?.contentMode ?? null;
    const liveSwapRoles = transitionDisplay?.liveSwapRoles ?? null;
    const isSearchLeg = sceneKey === 'search';
    // ── The four-lane split (Phase 2). The player owns ONE progress + ONE paintAck. Per leg, we
    // pick our component of the {outgoing, incoming} opacity pair by this leg's role (pickLegOpacity).
    //   • BODY dissolve = resolveContentLaneOpacities(progress, paintAck, mode) — the body cross-
    //     dissolves (held) or hard-swaps (hard, paint-ack-gated) over the constant frost.
    //   • CHROME swap   = resolveHeaderSwap(paintAck) — header + plate + underlay + overlay INSTANT-
    //     swap on the paint-ack (never fade) → cutouts always show the frosted-map; plate stays opaque.
    // No transition in flight (or no player): the lone non-idle leg shows fully; idle hides.
    // The role each opacity worklet acts on is the LIVE one (the swap SV, written in the PF
    // flush — see SceneStackLiveSwapRoles above), NOT the render-captured legRole: that is the
    // whole content-swap-lag fix. Every PIXEL lane now rides the SV on the UI thread — opacity +
    // zIndex/elevation (legVisibilityStyle) and pointerEvents (animatedProps). legRole remains only
    // the pre-first-write worklet fallback and the truth for the paint-ack/attach lanes below.
    const bodyDissolveStyle = useAnimatedStyle(() => {
      'worklet';
      const liveRole = resolveLiveLegRole(sceneKey, liveSwapRoles?.value ?? null, legRole);
      if (player == null || contentMode == null || liveRole === 'idle') {
        return { opacity: liveRole === 'idle' ? 0 : 1 };
      }
      const pair = resolveContentLaneOpacities(
        player.settleRamp.value,
        player.paintAck.value,
        contentMode
      );
      return { opacity: pickLegOpacity(pair, liveRole) };
    }, [player, contentMode, legRole, liveSwapRoles, sceneKey]);
    const chromeSwapStyle = useAnimatedStyle(() => {
      'worklet';
      const liveRole = resolveLiveLegRole(sceneKey, liveSwapRoles?.value ?? null, legRole);
      if (player == null || liveRole === 'idle') {
        return { opacity: liveRole === 'idle' ? 0 : 1 };
      }
      const pair = resolveHeaderSwap(player.paintAck.value);
      return { opacity: pickLegOpacity(pair, liveRole) };
    }, [player, legRole, liveSwapRoles, sceneKey]);
    // The leg WRAPPER's visibility AND stacking both ride the live-role SV (the UI-thread swap
    // lane): opacity + zIndex + elevation are all set here in one worklet. Frame-drop fix
    // (2026-07-02): zIndex/elevation used to be render-derived (a static style keyed on the JS
    // legRole), so every switch mutated the zIndex of ~7 co-mounted legs in the Fabric commit — a
    // native-commit cost with no visual benefit (only ONE leg is ever visible via opacity). Driving
    // zIndex off the SV keeps the visible leg on top on the UI thread with ZERO commit mutation on a
    // switch. Stacking still matters (the visible leg must paint over the idle absolute-fill
    // siblings), so visible→2 / idle→0 is preserved — just on the UI thread now.
    const legVisibilityStyle = useAnimatedStyle(() => {
      'worklet';
      const liveRole = resolveLiveLegRole(sceneKey, liveSwapRoles?.value ?? null, legRole);
      const visible = liveRole !== 'idle';
      return { opacity: visible ? 1 : 0, zIndex: visible ? 2 : 0, elevation: visible ? 2 : 0 };
    }, [legRole, liveSwapRoles, sceneKey]);
    // For a SPLIT (non-search) leg the wrapper is a flat role-visibility (the per-region chrome/body
    // opacities live on the page-frame's z-layers). For the SEARCH leg (no page frame — it renders
    // `children` directly) the wrapper itself carries the BODY dissolve. No static legRole style
    // here anymore — the worklet above owns opacity + zIndex + elevation.
    const sceneVisibilityStyle = React.useMemo(
      () => [legVisibilityStyle, isSearchLeg ? bodyDissolveStyle : null],
      [legVisibilityStyle, isSearchLeg, bodyDissolveStyle]
    );
    // The body's onLayout = the PAINT-ACK PRODUCER. Call reportScenePaint UNCONDITIONALLY (no
    // leg-side legRole gate): the host's reportScenePaint (surface host) is the SOLE arbiter — it
    // gates on effectiveIncomingRef.current && isTransitioningRef.current (render-set refs), so an
    // idle/outgoing/stale leg's call is a harmless no-op. This decoupling makes the paint-ack
    // robust regardless of role-source timing (zero-JS-switch red-team guard #1: the leg no longer
    // needs legRole to gate the producer, so the callback is a STABLE per-scene identity that never
    // re-binds on a role flip). A stable per-scene callback (deps: identity).
    const reportScenePaint = transitionDisplay?.reportScenePaint;
    const recordScenePainted = transitionDisplay?.recordScenePainted;
    const handleBodyFirstPaint = React.useCallback(
      (_event: LayoutChangeEvent) => {
        // ANY real layout marks this leg painted — the evidence the synthetic warm-leg ack reads.
        recordScenePainted?.(sceneKey);
        reportScenePaint?.(sceneKey);
      },
      [recordScenePainted, reportScenePaint, sceneKey]
    );
    // Touch arbitration: ONLY the 'incoming' leg (the destination / settled displayed scene)
    // receives touches. Both crossfade legs render at the same zIndex:2 absolute-fill, so a
    // fully-transparent 'outgoing' leg whose DOM index is HIGHER than the incoming (e.g. a
    // high-index pollDetail/profile fading out over a low-index restaurant/search) would paint
    // ON TOP and swallow taps for the whole ramp.
    //
    // pointerEvents rides the SAME live-role SharedValue as the leg's opacity (the UI-thread swap
    // lane), via useAnimatedProps — so touch flips in LOCKSTEP with visibility. The old JS
    // render-derived gate lagged the SV by the full flush→commit window: after a WARM early-flip
    // the incoming leg was already visible (opacity 1) but still pointerEvents 'none', while the
    // invisible outgoing leg kept 'auto' and swallowed the tap (adversarial-review CONFIRMED
    // medium). Reading the live role here closes that window. (RN 0.81 + Reanimated 4 DO drive the
    // pointerEvents prop from the UI thread — the older "cannot be animated in a worklet" note was
    // stale.) resolveLiveLegRole falls back to the render legRole before the SV's first write and
    // for cold legs (which never early-flip), so behavior is unchanged except during a warm flip.
    const legPointerEventsAnimatedProps = useAnimatedProps(() => {
      'worklet';
      const liveRole = resolveLiveLegRole(sceneKey, liveSwapRoles?.value ?? null, legRole);
      return { pointerEvents: (liveRole === 'incoming' ? 'auto' : 'none') as 'auto' | 'none' };
    }, [legRole, liveSwapRoles, sceneKey]);
    // The split opacities stay attached for EVERY presentation, not just in-flight transitions.
    // THE COLD-TAB PURE-FROST BUG (P4 defect #1, probe-pinned): a leg that finishes a preserved
    // transition as the OUTGOING has opacity 0 written to its page-frame z-layers by these
    // worklets on the UI thread. Detaching the animated style at settle (`isTransitioning ?
    // style : undefined`) does NOT reset that written value — Reanimated leaves the last
    // animated opacity on the native views — so the NEXT hard-swap (non-transitioning)
    // presentation of that leg rendered plate + body at the RETAINED opacity 0: correct
    // persistent header, bodyNull:false, activity flags all green, pure frost (the exact
    // observed signature; repro = Favorites → Search [holds out:'bookmarks'] → Favorites).
    // Keeping the styles attached makes the layers' opacity a LIVE function of (player,
    // legRole) on every commit: at rest the player's token-null branch pins paintAck=1/
    // settleRamp=1 ⇒ incoming=1 / idle=0, continuously repairing any retained value. The
    // worklets already existed unconditionally (same mapper count) — only the attachment was
    // conditional, so this adds no per-frame work at rest (SharedValues only write in-flight).
    const splitChromeOpacityStyle = chromeSwapStyle;
    const splitBodyOpacityStyle = bodyDissolveStyle;
    const pageBody = isSearchLeg ? (
      // The SEARCH leg renders its results surface directly (no page frame at THIS level — the
      // bundle host owns its own page frame). P5: search is SEEDED/HARD now (never-null skeleton
      // page), but it still needs a paint-ack producer for any held pair presenting it, or the
      // ack-gated swap stays at incoming:0 (blank body). Wrap in an absolute-fill onLayout View
      // (layout-neutral — sceneStackBodyLayer is the same absoluteFill) to emit the first paint.
      <View
        pointerEvents="box-none"
        style={styles.sceneStackBodyLayer}
        onLayout={handleBodyFirstPaint}
      >
        {children}
      </View>
    ) : (
      <BottomSheetSceneStackPageFrame
        underlayComponent={
          <SceneStackChromeLayerHost
            legRole={legRole}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneKey={sceneKey}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            surface="underlay"
          />
        }
        backgroundComponent={
          <SceneStackChromeLayerHost
            legRole={legRole}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneKey={sceneKey}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            surface="background"
          />
        }
        bodyComponent={children}
        overlayComponent={
          <SceneStackChromeLayerHost
            legRole={legRole}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            sceneKey={sceneKey}
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            surface="overlay"
          />
        }
        // P3: NO per-leg headerComponent — the ONE persistent header (PersistentSheetHeaderHost)
        // is hoisted above the legs. The body top-inset is preserved by reserving the header lane
        // off the persistent header's measured height (undefined pre-measure → the page frame's
        // own OVERLAY_TAB_HEADER_HEIGHT fallback — the same fallback the deleted per-leg
        // measurement path bottomed out on). The leg's scroll divider is hoisted too
        // (PersistentHeaderScrollDividerHost) — it must paint ABOVE the persistent header's
        // opaque cutout plate, which sits above this whole leg.
        reserveHeaderLane
        reservedHeaderHeight={reservedHeaderHeight}
        chromeOpacityStyle={splitChromeOpacityStyle}
        bodyOpacityStyle={splitBodyOpacityStyle}
        onBodyFirstPaint={handleBodyFirstPaint}
      />
    );

    const frameHost = (
      <SceneStackBodyFrame
        sceneKey={sceneKey}
        visibilityStyle={sceneVisibilityStyle}
        pointerEventsAnimatedProps={legPointerEventsAnimatedProps}
      >
        {pageBody}
      </SceneStackBodyFrame>
    );
    const profiledFrameHost = onProfilerRender ? (
      <React.Profiler id={`SceneStackBodyFrameHost:${sceneKey}`} onRender={onProfilerRender}>
        {frameHost}
      </React.Profiler>
    ) : (
      frameHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackBodyFrameHost',
      operation: `render:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledFrameHost;
  },
  (previousProps, nextProps) =>
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.reservedHeaderHeight === nextProps.reservedHeaderHeight &&
    previousProps.legRole === nextProps.legRole &&
    previousProps.children === nextProps.children
);

// ── SKELETON-LEG fallback (page-switch-master-plan.md §9.1 "P2 DoD SCOPE"; invariant S2) ────────
// When a leg is PRESENTED (legRole !== 'idle') but its DERIVED body store hasn't caught up
// (contentEntry/transportEntry null — the blank-frame hole), render the scene's cutout-shimmer
// skeleton instead of null: presented ⇒ skeleton-or-content, never visible-and-empty. Per-scene
// row shapes mirror the scene's real content (cutout-skeleton-foundation co-design defaults).
// frostBacking=true ONLY where the body sits over an OPAQUE plate that blocks the hoisted
// frosted map (pollDetail's white sheetSurface; pollCreation's own form surface) — everywhere
// else the holes are real windows down to the frost. 'search' has no spec here because it never
// routes through this content host — its never-null skeleton page lives in
// SearchResultsPageBundleHost (P5), which is the search leg's own S2 guarantee.
// Skeleton specs DERIVE from the compile-time SceneFoundationSpec table
// (scene-foundation-spec.ts) — the one home for every scene's foundation decisions;
// a new OverlayKey fails the build there until its skeleton is stated.

const SceneStackBodyContentLayerHost = React.memo(
  ({
    sceneStackSurfaceAuthority,
    sceneKey,
    bodyRuntimeAuthority,
    legRole,
  }: SceneStackBodyContentLayerHostProps) => {
    useSearchNavSwitchCommitAttribution(`SceneStackBodyContentLayerHost:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const sceneBodySurfaceAuthority =
      sceneStackSurfaceAuthority.getSceneBodySurfaceAuthority(sceneKey);
    const sceneBodySurfaceSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodySurfaceAuthority.subscribe(listener),
        [sceneBodySurfaceAuthority]
      ),
      getSnapshot: sceneBodySurfaceAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: AppRouteSceneStackBodySurfaceSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodySurfaceSelectionsEqual,
      attributionOwner: 'SceneStackBodyContentLayerHost',
      attributionOperation: `bodySurfaceSelector:${sceneKey}`,
    });
    const sceneBodyRuntimeAuthority = bodyRuntimeAuthority.getSceneBodyRuntimeAuthority(sceneKey);
    const sceneBodyRuntimeSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
        [sceneBodyRuntimeAuthority]
      ),
      getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodyRuntimeSelectionsEqual,
      attributionOwner: 'SceneStackBodyContentLayerHost',
      attributionOperation: `bodyRuntimeSelector:${sceneKey}`,
    });

    const bodyIsNull =
      sceneBodySurfaceSelection.contentEntry == null ||
      sceneBodySurfaceSelection.transportEntry == null;

    // [pageswitch] per-leg BODY side of the race: does this leg have a body this commit? Also
    // feeds the synthetic-ack evidence: a detached body invalidates "painted" (§9.1).
    // NOTE (S2 skeleton-leg): recordSceneBodyAttached STILL reports bodyNull:true while the
    // skeleton fallback below is showing — the skeleton is NOT body evidence, and the probe's
    // semantics are unchanged on purpose (a bodyNull:true line under a visible leg now means
    // "skeleton showing", not "blank").
    const transitionDisplay = React.useContext(SceneStackTransitionDisplayContext);
    const recordSceneBodyAttached = transitionDisplay?.recordSceneBodyAttached;
    React.useEffect(() => {
      logPageSwitch('body', { scene: sceneKey, bodyNull: bodyIsNull });
      recordSceneBodyAttached?.(sceneKey, !bodyIsNull);
    }, [sceneKey, bodyIsNull, recordSceneBodyAttached]);

    // Inline null-check kept (not `if (bodyIsNull)`) so TS narrows contentEntry/transportEntry below.
    if (
      sceneBodySurfaceSelection.contentEntry == null ||
      sceneBodySurfaceSelection.transportEntry == null
    ) {
      // SKELETON-LEG fallback (invariant S2): a PRESENTED leg (incoming or outgoing of the live
      // transition — same role derivation as the sibling frame/chrome hosts) must never paint
      // visible-and-empty. Idle legs keep returning null (they render at opacity 0 — no wasted
      // skeleton). The wrapper is a plain absolute-fill: this host renders INSIDE the page
      // frame's body lane, which is already offset below the persistent header
      // (sceneStackPageBodyLayer top = measured persistent-header height), so no extra top
      // offset here. Full-width in the lane (no transport contentContainer inset) ⇒ keep the
      // surface's DEFAULT insetX so the holes align where the real content will sit. legRole is a
      // PROP now (synchronous-in-render from the surface host) → the content host re-renders in the
      // SAME switch commit (its element re-mints via the legRole useMemo dep in SceneStackBodyLayer
      // Host), so a cold presented leg observes legRole !== 'idle' in that commit and paints the
      // skeleton, never a one-frame frost (zero-JS-switch red-team guard #4).
      const skeletonSpec =
        legRole === 'idle' ? undefined : getSceneFoundationSpec(sceneKey)?.skeleton;
      if (skeletonSpec != null) {
        const skeletonHost = (
          <View pointerEvents="none" style={styles.sceneStackBodyLayer}>
            <SceneLoadingSurface
              rowType={skeletonSpec.rowType}
              frostBacking={skeletonSpec.frostBacking}
            />
          </View>
        );
        const profiledSkeletonHost = onProfilerRender ? (
          <React.Profiler
            id={`SceneStackBodyContentLayerHost:${sceneKey}`}
            onRender={onProfilerRender}
          >
            {skeletonHost}
          </React.Profiler>
        ) : (
          skeletonHost
        );
        finishSearchNavSwitchRuntimeAttributionSpan({
          owner: 'SceneStackBodyContentLayerHost',
          operation: `renderSkeleton:${sceneKey}`,
          startedAtMs: renderStartedAtMs,
        });
        return profiledSkeletonHost;
      }
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SceneStackBodyContentLayerHost',
        operation: `renderEmpty:${sceneKey}`,
        startedAtMs: renderStartedAtMs,
      });
      return null;
    }

    const contentLayerHost = (
      // Leg 6 (SceneBodyReadyGate §2.2): the mounting scene's key rides context so any body's
      // in-content pending gate resolves its DECLARED foundation skeleton with no per-call-site
      // scene plumbing.
      <SceneBodySceneKeyContext.Provider value={sceneKey}>
        <SceneStackBodyContentLayer
          contentEntry={sceneBodySurfaceSelection.contentEntry}
          transportEntry={sceneBodySurfaceSelection.transportEntry}
          contentActivity={sceneBodySurfaceSelection.contentActivity}
          bodyDefaults={sceneBodyRuntimeSelection.bodyDefaults}
          bodyScrollRuntime={sceneBodyRuntimeSelection.bodyScrollRuntime}
          mountedEntryUnits={sceneBodySurfaceSelection.mountedEntryUnits}
          activeEntryId={sceneBodySurfaceSelection.activeEntryId}
        />
      </SceneBodySceneKeyContext.Provider>
    );

    const profiledContentLayerHost = onProfilerRender ? (
      <React.Profiler id={`SceneStackBodyContentLayerHost:${sceneKey}`} onRender={onProfilerRender}>
        {contentLayerHost}
      </React.Profiler>
    ) : (
      contentLayerHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackBodyContentLayerHost',
      operation: `render:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledContentLayerHost;
  },
  areSceneStackBodyContentLayerHostPropsEqual
);

const SearchSceneStackBodyDisplayTarget = React.memo(
  ({
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    bodyRuntimeAuthority,
    legRole,
  }: Pick<
    SceneStackBodyLayerHostProps,
    | 'routeSceneDisplayTargetRegistry'
    | 'sceneStackSurfaceAuthority'
    | 'bodyRuntimeAuthority'
    | 'legRole'
  >) => {
    useSearchNavSwitchCommitAttribution('SearchSceneStackBodyDisplayTarget:search');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const sceneBodyRuntimeAuthority = bodyRuntimeAuthority.getSceneBodyRuntimeAuthority('search');
    const sceneBodyRuntimeSelection = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
        [sceneBodyRuntimeAuthority]
      ),
      getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) => snapshot,
        []
      ),
      isEqual: areSceneBodyRuntimeSelectionsEqual,
      attributionOwner: 'SearchSceneStackBodyDisplayTarget',
      attributionOperation: 'bodyRuntimeSelector:search',
    });

    const searchResultsPageBundle = (
      <SearchResultsPageBundleHost
        bodyDefaults={sceneBodyRuntimeSelection.bodyDefaults}
        bodyScrollRuntime={sceneBodyRuntimeSelection.bodyScrollRuntime}
      />
    );
    const searchDisplayLayer = (
      // P5: the search leg still renders through its bespoke bundle host (residual — see
      // SearchResultsPageBundleHost), but it is NEVER-NULL (skeleton page pre-bundle) and its
      // header/divider ride the hoisted persistent chrome like every other leg, so no
      // header/inset props here.
      <SceneStackBodyFrameHost
        sceneKey="search"
        routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
        sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
        legRole={legRole}
      >
        {searchResultsPageBundle}
      </SceneStackBodyFrameHost>
    );

    const profiledSearchBody = onProfilerRender ? (
      <React.Profiler id="SearchSceneStackBodyDisplayTarget:search" onRender={onProfilerRender}>
        {searchDisplayLayer}
      </React.Profiler>
    ) : (
      searchDisplayLayer
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchSceneStackBodyDisplayTarget',
      operation: 'render:search',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSearchBody;
  },
  (previousProps, nextProps) =>
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.legRole === nextProps.legRole
);

const SceneStackBodyLayerHost = React.memo((props: SceneStackBodyLayerHostProps) => {
  useSearchNavSwitchCommitAttribution(`SceneStackBodyLayerHost:${props.sceneKey}`);
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  // P3: the per-leg scroll-fade header divider moved OUT of the leg's page frame — with the header
  // hoisted (PersistentSheetHeaderHost, zIndex 60 above every leg), an in-frame divider would
  // paint UNDER the persistent header's opaque cutout plate and never show. The ONE hoisted
  // divider (PersistentHeaderScrollDividerHost) renders above the persistent header, keyed off
  // the same measured height + the PRESENTED scene's scroll offset.
  // legRole is in the deps: when this leg's role flips, the content-layer element RE-MINTS (new
  // identity) → the content host re-renders in the SAME switch commit (Commit-A), so a cold
  // presented leg paints its skeleton in that commit, never a one-frame frost.
  const contentLayer = React.useMemo(
    () => (
      <SceneStackBodyContentLayerHost
        sceneKey={props.sceneKey}
        sceneStackSurfaceAuthority={props.sceneStackSurfaceAuthority}
        bodyRuntimeAuthority={props.bodyRuntimeAuthority}
        legRole={props.legRole}
      />
    ),
    [props.bodyRuntimeAuthority, props.sceneKey, props.sceneStackSurfaceAuthority, props.legRole]
  );

  const bodyLayerHost = (
    <SceneStackBodyFrameHost
      sceneKey={props.sceneKey}
      routeSceneDisplayTargetRegistry={props.routeSceneDisplayTargetRegistry}
      sceneStackSurfaceAuthority={props.sceneStackSurfaceAuthority}
      reservedHeaderHeight={props.reservedHeaderHeight}
      legRole={props.legRole}
    >
      {contentLayer}
    </SceneStackBodyFrameHost>
  );

  const profiledBodyLayerHost = onProfilerRender ? (
    <React.Profiler id={`SceneStackBodyLayerHost:${props.sceneKey}`} onRender={onProfilerRender}>
      {bodyLayerHost}
    </React.Profiler>
  ) : (
    bodyLayerHost
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'SceneStackBodyLayerHost',
    operation: `render:${props.sceneKey}`,
    startedAtMs: renderStartedAtMs,
  });

  return profiledBodyLayerHost;
}, areSceneStackBodyLayerHostPropsEqual);

type SceneStackChromeLayerHostProps = Pick<
  BottomSheetSceneStackHostProps,
  'routeSceneDisplayTargetRegistry' | 'sceneStackSurfaceAuthority'
> & {
  sceneKey: OverlayKey;
  // This leg's role for THIS render (surface-host-computed prop) — replaces the old context read.
  legRole: SceneStackLegRole;
  // P3: 'header' is no longer a render surface — the per-leg header pass is deleted (the ONE
  // persistent header renders above the legs). The chromeSurfaces SNAPSHOT still carries its
  // 'header' field (app-route-scene-stack-surface-contract.ts — shape-preserved for the
  // in-flight descriptor conversion + the polls dismiss-handoff readiness reporter, scene-stack
  // runtime :1218); nothing renders it here anymore. POST-INTEGRATION SHRINK: drop the field.
  surface: 'underlay' | 'background' | 'overlay';
};

const SceneStackChromeLayerHost = React.memo(
  ({ sceneStackSurfaceAuthority, sceneKey, surface, legRole }: SceneStackChromeLayerHostProps) => {
    useSearchNavSwitchCommitAttribution(`SceneStackChromeLayerHost:${surface}:${sceneKey}`);
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const scenePresentationAuthority =
      sceneStackSurfaceAuthority.getScenePresentationAuthority(sceneKey);
    // Keep the chrome rendered for BOTH crossfade legs (outgoing + incoming) so the scene frame's
    // opacity ramp drives the chrome crossfade too; only fully hide it for idle scenes. (The frame
    // wraps body + chrome — one ramp.) legRole is now a synchronous-in-render PROP, no context read.
    const isVisible = legRole !== 'idle';
    const chromePresentation = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => scenePresentationAuthority.subscribe(listener),
        [scenePresentationAuthority]
      ),
      getSnapshot: scenePresentationAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: AppRouteSceneStackScenePresentationSnapshot) => ({
          sceneChromeEntry: snapshot.chromeSurfaces[surface],
        }),
        [surface]
      ),
      isEqual: areSceneChromePresentationSelectionsEqual,
      attributionOwner: 'SceneStackChromeLayerHost',
      attributionOperation: `chromeSelector:${surface}:${sceneKey}`,
    });
    const sceneChromeEntry = chromePresentation.sceneChromeEntry;

    if (sceneChromeEntry == null) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SceneStackChromeLayerHost',
        operation: `renderEmpty:${surface}:${sceneKey}`,
        startedAtMs: renderStartedAtMs,
      });
      return null;
    }

    const chromeLayer = (
      <SceneStackDecorLayer entry={sceneChromeEntry} kind={surface} isVisible={isVisible} />
    );

    const profiledChromeLayer = onProfilerRender ? (
      <React.Profiler
        id={`SceneStackChromeLayer:${surface}:${sceneKey}`}
        onRender={onProfilerRender}
      >
        {chromeLayer}
      </React.Profiler>
    ) : (
      chromeLayer
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SceneStackChromeLayerHost',
      operation: `render:${surface}:${sceneKey}`,
      startedAtMs: renderStartedAtMs,
    });

    return profiledChromeLayer;
  },
  (previousProps, nextProps) =>
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.sceneKey === nextProps.sceneKey &&
    previousProps.surface === nextProps.surface &&
    previousProps.legRole === nextProps.legRole
);

// ── P3 HOISTED HEADER SCROLL DIVIDER ──────────────────────────────────────────────────────────
// The header/body seam divider used to render inside each leg's page frame (zIndex 41), above
// that leg's in-frame header layer (40). With the ONE persistent header hoisted above every leg
// (zIndex 60, opaque white cutout plate covering [0, headerHeight]), an in-frame divider paints
// UNDER the plate and can never show. So the divider hoists with the header: ONE divider, a
// sibling ABOVE PersistentSheetHeaderHost, at the SAME measured boundary (the persistent header's
// height), faded by the PRESENTED scene's body scroll offset — the identical HeaderScrollDivider
// component, rendered once here instead of per-leg. Gated by the same persistent-header registry
// lookup the header host uses — post-P5 every sheet scene registers a descriptor (search
// included), so the gate only guards the dev-warned missing-descriptor case.
const PersistentHeaderScrollDividerLane = ({
  bodyRuntimeAuthority,
  sceneKey,
  headerHeight,
}: Pick<BottomSheetSceneStackHostProps, 'bodyRuntimeAuthority'> & {
  sceneKey: OverlayKey;
  headerHeight: number;
}) => {
  const sceneBodyRuntimeAuthority = bodyRuntimeAuthority.getSceneBodyRuntimeAuthority(sceneKey);
  // A body that OWNS its scroll (contentScrollMode 'static' — dmSession's thread ScrollView)
  // never scrolls the shared container, so the authority offset would pin the divider hidden.
  // Such a body publishes its own UI-thread offset (sceneScrollStateRegistry publications); a
  // publication wins over the authority's shared-container offset.
  const publishedScrollOffset = useSceneHeaderScrollOffset(sceneKey);
  const authorityScrollOffset = useRouteAuthoritySelector({
    subscribe: React.useCallback(
      (listener: () => void) => sceneBodyRuntimeAuthority.subscribe(listener),
      [sceneBodyRuntimeAuthority]
    ),
    getSnapshot: sceneBodyRuntimeAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: BottomSheetSceneStackBodyRuntimeSnapshot) =>
        snapshot.bodyScrollRuntime?.scrollOffset ?? null,
      []
    ),
    isEqual: (a: SharedValue<number> | null, b: SharedValue<number> | null) => a === b,
    attributionOwner: 'PersistentHeaderScrollDividerLane',
    attributionOperation: `dividerScrollOffset:${sceneKey}`,
  });
  const scrollOffset = publishedScrollOffset ?? authorityScrollOffset;
  if (scrollOffset == null) {
    // A scene whose body genuinely publishes no scroll renders no divider (offset-0 honest).
    return null;
  }
  return (
    <View pointerEvents="none" style={hoistedHeaderDividerStyles.overlay}>
      <HeaderScrollDivider headerHeight={headerHeight} scrollOffset={scrollOffset} />
    </View>
  );
};

const PersistentHeaderScrollDividerHost = ({
  bodyRuntimeAuthority,
  headerHeight,
}: Pick<BottomSheetSceneStackHostProps, 'bodyRuntimeAuthority'> & {
  headerHeight: number;
}) => {
  const { routeSceneSwitchRuntime } = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(routeSceneSwitchRuntime);
  // Same scene resolution as PersistentSheetHeaderHost, so divider and header always agree.
  const sceneKey = frame.presentedSceneKey ?? frame.activeSceneKey;
  if (sceneKey == null || getPersistentHeaderDescriptor(sceneKey) == null) {
    return null;
  }
  return (
    // Keyed by scene so the offset subscription re-anchors cleanly on a page switch.
    <PersistentHeaderScrollDividerLane
      key={`divider-${sceneKey}`}
      bodyRuntimeAuthority={bodyRuntimeAuthority}
      sceneKey={sceneKey}
      // §2.7: the divider sits on the chrome/body seam — it must move in the SAME committed
      // frame as the chrome box, so it derives the presented scene's chrome height from the
      // measured-chrome cache (the passed headerHeight is the retained-measurement fallback).
      headerHeight={resolveSceneChromeHeight(sceneKey) ?? headerHeight}
    />
  );
};

const hoistedHeaderDividerStyles = StyleSheet.create({
  // One notch above the persistent header overlay (60) so the hairline paints over the plate's
  // bottom edge — the same header-over-divider relationship the in-frame lane had (41 over 40).
  // Absolute-FILL (not a zero-height strip) so the divider's own absolute `top` stays inside the
  // wrapper's bounds on every platform; pointerEvents none — it can never intercept touches.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 61,
    elevation: 61,
  },
});

const ActiveSceneStackSurfaceHost = React.memo(
  ({
    bodyRuntimeAuthority,
    displayedSceneKey,
    outgoingSceneKey,
    incomingSceneKey,
    contentTransitionToken,
    onContentSettleComplete,
    onHeaderLayout,
    onScrollHeaderLayout,
    routeSceneDisplayTargetRegistry,
    sceneStackSurfaceAuthority,
    scrollHeaderComponent,
    scrollHeaderSyncStyle,
    shadowShellStyle,
    surfaceStyle,
  }: BottomSheetSceneStackHostProps) => {
    useSearchNavSwitchCommitAttribution('ActiveSceneStackSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    // P2 (page-switch-master-plan.md §9.2 site 3): the searchSurfaceOwnsVisibleSheet override is
    // DELETED as one unit (selector + effectiveDisplayedSceneKey + the per-leg outgoing relabel).
    // Its relabel JOB — presenting the frozen-results leg as 'search' — lives in the ONE
    // PresentationFrame writer (AppRouteSceneSwitchController) now; the sheet-host controller
    // feeds this host PF-derived displayedSceneKey/outgoingSceneKey/incomingSceneKey, so the
    // props ARE the clean presented/outgoing values and the host reads them directly.
    const isTransitioning = outgoingSceneKey != null && outgoingSceneKey !== incomingSceneKey;
    const effectiveOutgoing: OverlayKey | null = outgoingSceneKey;
    const effectiveIncoming: OverlayKey | null = isTransitioning
      ? incomingSceneKey
      : displayedSceneKey;
    // PF paint-ack sink (§9.1 R2): the scene-switch runtime records the switchId-keyed ack the
    // supersede rule reads. Provider-backed, identity-stable for the app's lifetime.
    const routeSceneSwitchRuntime = useAppRouteSceneRuntime().routeSceneSwitchRuntime;
    // ── ACK EPOCH (final red-team mustFix, §9 R2) ──────────────────────────────────────────────
    // The ARMING switch's PresentationFrame id. The acks below used to read
    // getPresentationFrame().switchId LIVE at ack time — but a native onLayout queued from
    // superseded switch N can arrive AFTER the controller synchronously committed N+1 and BEFORE
    // this host re-renders: the stale refs' identity gates still pass (they hold N's pair) and
    // the live read acks N+1, which never painted — the next supersede then holds a
    // never-painted leg (the R2 failure class). Capture the switchId HERE instead, via
    // useSyncExternalStore, so it commits IN THE SAME REACT COMMIT as the PF-derived leg props
    // (both are published by the same controller flush and batch into one commit) and rides the
    // SAME ref pattern as the identity gates. A pre-re-render onLayout then acks the ARMED id N
    // — stale, so commitPresentationPaintAck rejects it (the guard doing its job) — and N+1 acks
    // only from its own arming. Snapshot is the NUMBER switchId (not the frame object): revision
    // re-mints keep the same id and cause no extra host re-render.
    const subscribeToPresentationFrame = React.useCallback(
      (onStoreChange: () => void) =>
        routeSceneSwitchRuntime.subscribePresentationFrame(onStoreChange),
      [routeSceneSwitchRuntime]
    );
    const getPresentationSwitchId = React.useCallback(
      () => routeSceneSwitchRuntime.getPresentationFrame().switchId,
      [routeSceneSwitchRuntime]
    );
    const armedSwitchId = React.useSyncExternalStore(
      subscribeToPresentationFrame,
      getPresentationSwitchId,
      getPresentationSwitchId
    );
    const armedSwitchIdRef = React.useRef(armedSwitchId);
    armedSwitchIdRef.current = armedSwitchId;
    // ── P3 BODY TOP-INSET (persistent header) ──────────────────────────────────────────────────
    // The per-leg header render lane is DELETED; the ONE hoisted PersistentSheetHeaderHost is now
    // the measurement source. Capture its measured height HERE (it reports through the same
    // onHeaderLayout prop the per-leg headers used — forwarded upstream unchanged for the sheet's
    // headerHeight SharedValue) and thread it to every leg's page frame as reservedHeaderHeight,
    // so each body still starts below the header at the same offset. null until the first measure
    // → the page frame bottoms out on its OVERLAY_TAB_HEADER_HEIGHT fallback (same as before).
    // The value RETAINS its last measurement across frames where the persistent host renders null
    // (a scene missing its descriptor — dev-warned, should not exist post-P5) so leg insets never
    // collapse.
    const [persistentHeaderHeight, setPersistentHeaderHeight] = React.useState<number | null>(null);
    const handlePersistentHeaderLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (nextHeight > 0) {
          setPersistentHeaderHeight((previousHeight) =>
            previousHeight != null && Math.abs(previousHeight - nextHeight) < 0.5
              ? previousHeight
              : nextHeight
          );
        }
        onHeaderLayout(event);
      },
      [onHeaderLayout]
    );

    // [pageswitch] HOST side of the race: which leg(s) the host makes PAINT (effectiveIncoming/
    // Outgoing) — now straight prop echoes of the PresentationFrame — per commit. Correlate with
    // the per-leg [pageswitch] body lines to catch a painting leg with a null body (blank) or the
    // wrong leg painting (wrong page). searchOwns is logged as 'deleted' (the override is gone).
    React.useEffect(() => {
      logPageSwitch('host', {
        displayed: displayedSceneKey,
        t: Math.round(performance.now()),
        in: effectiveIncoming,
        out: effectiveOutgoing,
        token: contentTransitionToken,
        searchOwns: 'deleted',
        transitioning: isTransitioning,
      });
    }, [
      displayedSceneKey,
      effectiveIncoming,
      effectiveOutgoing,
      isTransitioning,
      contentTransitionToken,
    ]);
    // ── HOST-OWNED FOUR-LANE PLAYER ─────────────────────────────────────────────────────────────
    // The host owns the player (ONE progress + ONE paintAck). It is TOKEN-triggered:
    // `player.start(descriptor, 0, onSettle)` fires on the content-transition token bump. velocity =
    // 0 (these are programmatic taps, not sheet drags). The descriptor is DERIVED from the (outgoing,
    // incoming) pair the host has — the player drives ONLY the content + header lanes (sheet-Y stays
    // with the kept spring runtime; map/chrome are 'preserve'). The single paint-ack
    // (reportScenePaint, flipped by the incoming body's first onLayout) gates the content
    // visible-commit — it is the content completer.
    const player = useTransitionLanePlayer();
    // Leg 3 (design §4.2): expose the live player's paintAck to the dismiss motion plane so the
    // snap-crossing worklet can flip the staged swap UI-thread-side in the crossing frame (the
    // freeze primitive). The trailing runOnJS commit remains the store/React cleanup.
    React.useEffect(() => registerDismissBoundarySwapGate(player.paintAck), [player.paintAck]);
    // Stable, ref-backed bridge so the player's onSettle never re-fires the layout effect (and thus
    // never re-starts / wiggles) when the callback identity moves. The callback IS stable today
    // (bound once in the provider), but the ref keeps that guarantee local.
    const onContentSettleCompleteRef = React.useRef(onContentSettleComplete);
    onContentSettleCompleteRef.current = onContentSettleComplete;
    const runContentSettleComplete = React.useCallback((token: number) => {
      onContentSettleCompleteRef.current(token);
    }, []);
    // The content mode of the in-flight transition (derived from the incoming scene). Drives the
    // BODY dissolve (held-dissolve for the non-seedable results scene; hard for seedable
    // profile/restaurant/pollDetail). STABLE IDENTITY (2026-07-02 zero-JS-switch): keyed on the
    // SEMANTIC mode, not on effectiveOutgoing/effectiveIncoming — a fresh `{ mode: 'hard' }` object
    // every switch (the old deps) re-minted the ports context and re-rendered every leg. Recompute
    // the raw mode each render (cheap, pure), but only change the returned OBJECT identity when the
    // serialized mode actually changes — so a nav switch (always 'hard') keeps a stable identity.
    const rawContentMode: ContentMode =
      effectiveOutgoing != null && effectiveIncoming != null
        ? deriveHostTokenDescriptor(effectiveOutgoing, effectiveIncoming, 'middle').content.swap
        : { mode: 'hard' };
    const rawContentModeRef = React.useRef(rawContentMode);
    rawContentModeRef.current = rawContentMode;
    const contentModeKey = JSON.stringify(rawContentMode);
    const inFlightContentMode = React.useMemo<ContentMode>(
      () => rawContentModeRef.current,
      [contentModeKey]
    );
    // Paint-ack producer SINK. The incoming body's first onLayout calls this; honor it ONLY for the
    // live transition's incoming scene (gate on identity), so an idle/outgoing re-layout — or a
    // stale leg — can never flip the gate. markPaintAck reveals the content (#1 correctness).
    const effectiveIncomingRef = React.useRef(effectiveIncoming);
    effectiveIncomingRef.current = effectiveIncoming;
    const isTransitioningRef = React.useRef(isTransitioning);
    isTransitioningRef.current = isTransitioning;
    // Painted-evidence registry for the synthetic warm-leg ack (§9.1): legs record any real
    // layout; a body detach invalidates. Ref-backed (no render coupling) — read only inside the
    // start effect below.
    const hasPaintedSceneKeysRef = React.useRef<Set<OverlayKey>>(new Set());
    const recordScenePainted = React.useCallback((sceneKey: OverlayKey) => {
      hasPaintedSceneKeysRef.current.add(sceneKey);
    }, []);
    const recordSceneBodyAttached = React.useCallback((sceneKey: OverlayKey, attached: boolean) => {
      if (!attached) {
        // A detached body invalidates the painted evidence — its re-attach fires a real onLayout.
        hasPaintedSceneKeysRef.current.delete(sceneKey);
      }
    }, []);
    // ── THE UI-THREAD SWAP LANE SV (SceneStackLiveSwapRoles doc above) ────────────────────────
    const liveSwapRoles = useSharedValue<SceneStackLiveSwapRoles | null>(null);
    // ── THE JOINED REVEAL (leg 6 — child-transition primitive §2.3): every REVEAL flip (warm
    // early flip, real paint-ack, synthetic warm ack) joins {paintAck, chromeAck} — the flip
    // waits for the persistent header's post-commit chromeAck of the presented scene, so body
    // opacity can NEVER lead the header/strip paint (the nav-page one-beat lag). HOLD writes
    // (paintAck=0) stay immediate. One pending join at a time; a superseding reveal cancels its
    // predecessor. The 2-frame watchdog inside joinSceneChromeAck degrades to today's behavior
    // with a loud [JOINEDREVEAL] dev bark (provably RED by suppressing the header's ack).
    const pendingChromeJoinCancelRef = React.useRef<ChromeAckJoinCancel | null>(null);
    const joinRevealOnChromeAck = React.useCallback((scene: OverlayKey, flip: () => void) => {
      pendingChromeJoinCancelRef.current?.();
      pendingChromeJoinCancelRef.current = joinSceneChromeAck(scene, () => {
        pendingChromeJoinCancelRef.current = null;
        flip();
      });
    }, []);
    React.useEffect(
      () => () => {
        pendingChromeJoinCancelRef.current?.();
        pendingChromeJoinCancelRef.current = null;
      },
      []
    );
    // EARLY WRITE: subscribePresentationFrame listeners run SYNCHRONOUSLY inside the controller's
    // dispatch flush — the same JS instant the scene-motion executor writes the sheet-motion
    // command — so a warm swap reaches the UI thread on the next frame, ~1 frame after the sheet
    // starts moving, instead of after the full React commit (33-146ms measured).
    // ROLES-CHANGE GUARD: revision re-mints (lane-input changes) republish the frame with the
    // SAME presented/outgoing — re-running the writes below on one of those mid-transition would
    // seize the player and re-pin paintAck=0 AFTER a real ack (incoming flashes back to the
    // outgoing leg). Only a genuine roles change may write.
    const lastLiveSwapRolesRef = React.useRef<{
      presented: OverlayKey | null;
      outgoing: OverlayKey | null;
    }>({ presented: null, outgoing: null });
    React.useEffect(
      () =>
        routeSceneSwitchRuntime.subscribePresentationFrame((frame) => {
          const presented = frame.presentedSceneKey;
          if (presented == null) {
            return;
          }
          const outgoing = frame.outgoingSceneKey === presented ? null : frame.outgoingSceneKey;
          const lastRoles = lastLiveSwapRolesRef.current;
          if (lastRoles.presented === presented && lastRoles.outgoing === outgoing) {
            return;
          }
          lastLiveSwapRolesRef.current = { presented, outgoing };
          if (outgoing != null) {
            // Held transition: relabel the roles now (invisible — outgoing keeps opacity 1 under
            // paintAck 0) AND pin the hold in the same write, so the flush→commit window can't
            // flash the incoming leg off a stale resting paintAck=1. The player-start effect
            // re-arms these at commit (idempotent).
            liveSwapRoles.value = { presented, outgoing };
            player.seize();
            player.paintAck.value = 0;
            player.settleRamp.value = 0;
            logPageSwitch('liveSwap', {
              t: Math.round(performance.now()),
              presented,
              out: outgoing,
              held: true,
            });
            return;
          }
          if (!hasPaintedSceneKeysRef.current.has(presented)) {
            // Cold incoming: no early flip (nothing painted to reveal). The commit reconcile
            // below flips it in the commit that paints its body/skeleton — the old timing.
            return;
          }
          // Joined reveal (§2.3): the warm flip used to land on the UI thread a frame BEFORE
          // the header/strip React commit — the exact one-beat lag. Join on the header's
          // chromeAck: since the header commits in the same flush-fed React batch, the flip now
          // lands in that commit's layout phase (same painted frame as the header/strip).
          joinRevealOnChromeAck(presented, () => {
            liveSwapRoles.value = { presented, outgoing: null };
            player.seize();
            player.paintAck.value = 1;
            player.settleRamp.value = 1;
            logPageSwitch('liveSwap', {
              t: Math.round(performance.now()),
              presented,
              warm: true,
            });
          });
        }),
      [routeSceneSwitchRuntime, player, liveSwapRoles, joinRevealOnChromeAck]
    );
    const reportScenePaint = React.useCallback(
      (sceneKey: OverlayKey) => {
        if (isTransitioningRef.current && sceneKey === effectiveIncomingRef.current) {
          logPageSwitch('realAck', { t: Math.round(performance.now()), scene: sceneKey });
          // Joined reveal (§2.3): the header's layout effect normally recorded the chromeAck in
          // this same commit, so the join is synchronous; a missing ack defers ≤2 frames.
          // Inside the join: markPaintAck reveals the content, and (§9.1 R2) the switchId-keyed
          // PresentationFrame ack records — keyed to the ARMED switch's id (ACK EPOCH — the ref
          // was written in the arming commit), never a live getPresentationFrame() read: a
          // post-supersede pre-re-render onLayout must ack the superseded id (rejected
          // controller-side), not bless the new switch.
          joinRevealOnChromeAck(sceneKey, () => {
            player.markPaintAck();
            routeSceneSwitchRuntime.commitPresentationPaintAck(armedSwitchIdRef.current);
          });
        }
        // A paint from an idle/outgoing/stale leg is ignored — only the live transition's
        // incoming scene may flip the paint-ack gate.
      },
      [player, routeSceneSwitchRuntime, joinRevealOnChromeAck]
    );
    // COMMIT RECONCILE for the swap SV: converge it to the committed frame on every commit —
    // this is what flips a COLD leg (skipped by the warm gate above) in the exact commit that
    // paints its body/skeleton, and what backstops any frame the subscription missed (pre-mount
    // frames). Idempotent for warm legs (same values). Declared BEFORE the player-start effect
    // so start()'s paintAck arming always runs after the roles are current.
    React.useLayoutEffect(() => {
      if (effectiveIncoming == null) {
        return;
      }
      const outgoing =
        isTransitioning && effectiveOutgoing !== effectiveIncoming ? effectiveOutgoing : null;
      lastLiveSwapRolesRef.current = { presented: effectiveIncoming, outgoing };
      const current = liveSwapRoles.value;
      if (current?.presented === effectiveIncoming && current.outgoing === outgoing) {
        return;
      }
      liveSwapRoles.value = { presented: effectiveIncoming, outgoing };
    }, [effectiveIncoming, effectiveOutgoing, isTransitioning, liveSwapRoles]);
    React.useLayoutEffect(() => {
      // TOKEN-triggered start, keyed to the content-transition token (the same key the legacy ramp
      // used). Reset-then-start in a layout effect (pre-paint) so the first frame shows the OUTGOING
      // at full opacity (paintAck 0 ⇒ outgoing 1 / incoming 0), never a one-frame snap to the
      // incoming. The player's `start` resets paintAck=0 + settleRamp=0 and springs the settleRamp
      // 0→1 (an invisible timer); the body/header swaps derive from paintAck in worklets (no
      // setState). onSettle (ramp-end) settles the 'content' plane — the content completer.
      if (contentTransitionToken == null) {
        // Token not yet armed. If a transition is PENDING (outgoing differs from incoming — the
        // forward-open PRE-PUBLISH hold), hold paintAck=0 + settleRamp=0 so the OUTGOING leg stays
        // FULL opacity (outgoing=1) and the held body doesn't blink before the start arms. Idle/
        // settled (lone leg): paintAck=1 + settleRamp=1 so the lone leg shows fully (incoming=1).
        player.seize();
        const pending = effectiveOutgoing != null && effectiveOutgoing !== effectiveIncoming;
        if (pending) {
          logPageSwitch('playerHold', {
            t: Math.round(performance.now()),
            in: effectiveIncoming,
            out: effectiveOutgoing,
          });
        }
        player.settleRamp.value = pending ? 0 : 1;
        player.paintAck.value = pending ? 0 : 1;
        return;
      }
      if (effectiveOutgoing == null || effectiveIncoming == null) {
        return;
      }
      const settleToken = contentTransitionToken;
      const descriptor = deriveHostTokenDescriptor(effectiveOutgoing, effectiveIncoming, 'middle');
      // velocity 0 — programmatic tap. onSettle runs once on the spring's ramp-end (a superseded
      // start cancels the prior animation → finished=false → no stale settle).
      player.start(descriptor, 0, () => runContentSettleComplete(settleToken));
      // §9.1 SYNTHETIC ACK (evidence-based, pulled forward from P4): a WARM retained incoming leg
      // (body attached + painted before) never re-fires onLayout, so the real ack never arrives
      // and the paint-ack-gated swap would hold it invisible FOREVER (the stuck-blank the harness
      // caught: rapid burst back to the warm docked-polls leg → empty sheet shell). Evidence says
      // it is already painted — ack immediately, same semantics as the real paint it will never
      // send. A COLD incoming leg has no evidence and keeps the real onLayout-gated ack.
      // ACK EPOCH: keyed to the ARMED switch's id (the ref was written in this effect's own
      // commit, so it IS the arming frame's id) — structurally the armed id even though a fresh
      // getPresentationFrame() read is usually equal inside this effect.
      logPageSwitch('playerStart', {
        t: Math.round(performance.now()),
        token: settleToken,
        in: effectiveIncoming,
        out: effectiveOutgoing,
        warm: hasPaintedSceneKeysRef.current.has(effectiveIncoming),
      });
      if (hasPaintedSceneKeysRef.current.has(effectiveIncoming)) {
        // Joined reveal (§2.3): the synthetic warm ack joins the header's chromeAck too — this
        // layout effect and the header's run in the same commit, so the join is synchronous in
        // the healthy path (order-independent: whichever effect runs second completes it).
        joinRevealOnChromeAck(effectiveIncoming, () => {
          player.markPaintAck();
          routeSceneSwitchRuntime.commitPresentationPaintAck(armedSwitchIdRef.current);
        });
      }
    }, [
      contentTransitionToken,
      player,
      runContentSettleComplete,
      effectiveOutgoing,
      effectiveIncoming,
      routeSceneSwitchRuntime,
      joinRevealOnChromeAck,
    ]);
    // STABLE PORTS: no volatile role fields → identity survives a switch → idle legs never
    // re-render from this context. (Roles ride the per-leg legRole prop; see the .map below.)
    const transitionDisplayValue = React.useMemo<SceneStackTransitionDisplayValue>(
      () => ({
        player,
        liveSwapRoles,
        contentMode: inFlightContentMode,
        reportScenePaint,
        recordScenePainted,
        recordSceneBodyAttached,
      }),
      [
        player,
        liveSwapRoles,
        inFlightContentMode,
        reportScenePaint,
        recordScenePainted,
        recordSceneBodyAttached,
      ]
    );
    const surfaceHost = (
      <SceneStackTransitionDisplayContext.Provider value={transitionDisplayValue}>
        <View pointerEvents="box-none" style={shadowShellStyle}>
          <Animated.View pointerEvents="box-none" style={[styles.sceneStackSurface, surfaceStyle]}>
            <View style={styles.contentHost}>
              {/* CONSTANT FROST BACKING (sheet-frost-architecture, layering-corrected): ONE shared
                FrostedGlassBackground — the FROST ALONE, NO opaque-white fill — mounted ONCE here,
                BELOW every content layer, at a CONSTANT opacity 1.0. It carries NO animated style
                and NO engine handle; the engine's only animating opacities are the per-scene content
                body lanes (the player's content-lane opacities) ABOVE this, and a content lane NEVER
                fades this frost.
                The frost blurs the MAP behind the sheet → the frosted-map; frosted-glass is
                opaque-ENOUGH to stop the SHARP-map see-through while still showing the blurred map
                through the toggle-strip + close-button CUTOUTS. Per-scene WHITE PLATES WITH CUTOUTS
                (backgroundComponent, zIndex 1) sit ABOVE this and own the solid-white areas; their
                holes reveal this constant frosted-map. Sized absolute-fill (gorhom surface
                decoupling), clipped to the sheet's rounded corners by the surface overflow:hidden. */}
              <View pointerEvents="none" style={styles.sceneStackSurfaceHoistedBacking}>
                <FrostedGlassBackground />
              </View>
              {scrollHeaderComponent ? (
                <Animated.View
                  onLayout={onScrollHeaderLayout}
                  style={[styles.scrollHeaderOverlay, scrollHeaderSyncStyle]}
                >
                  {scrollHeaderComponent}
                </Animated.View>
              ) : null}
              {PERSISTENT_ROUTE_SCENE_STACK_KEYS.map((sceneKey) =>
                sceneKey === 'search' ? (
                  <SearchSceneStackBodyDisplayTarget
                    key="scene-search"
                    routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
                    sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
                    bodyRuntimeAuthority={bodyRuntimeAuthority}
                    legRole={computeLegRole(sceneKey, effectiveIncoming, effectiveOutgoing)}
                  />
                ) : (
                  <SceneStackBodyLayerHost
                    key={`scene-${sceneKey}`}
                    sceneKey={sceneKey}
                    sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
                    routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
                    bodyRuntimeAuthority={bodyRuntimeAuthority}
                    // §2.7: each leg's body-lane inset derives from ITS OWN scene's chrome
                    // height SYNCHRONOUSLY (measured-chrome cache) — chrome box and body lane
                    // move in the same committed frame; the retained shared measurement is only
                    // the never-measured-composition fallback (onLayout corrects it next frame).
                    reservedHeaderHeight={
                      resolveSceneChromeHeight(sceneKey) ?? persistentHeaderHeight ?? undefined
                    }
                    legRole={computeLegRole(sceneKey, effectiveIncoming, effectiveOutgoing)}
                  />
                )
              )}
              {/* THE PERSISTENT HEADER (P3, req 2b) — one OverlaySheetHeaderChrome hoisted above
                  every leg, never unmounts; title/action/grab swap per PresentationFrame in the
                  same committed frame as press-up. Every sheet scene registers a descriptor in
                  the persistent-header registry (search included, P5 — via
                  search-results-header-live-state); a scene missing one renders null and
                  dev-warns. Its onLayout is the ONE measurement source for every leg's body
                  top-inset (handlePersistentHeaderLayout above). */}
              <PersistentSheetHeaderHost onHeaderLayout={handlePersistentHeaderLayout} />
              {/* THE HOISTED SCROLL DIVIDER (P3) — the header/body seam line. It lived in each
                  leg's page frame (zIndex 41, above that leg's in-frame header at 40); with the
                  header hoisted to zIndex 60 the in-frame divider would paint UNDER the opaque
                  cutout plate, so the divider hoists too: one divider above the persistent
                  header, same measured boundary height, faded by the PRESENTED scene's scroll
                  offset. Renders only for scenes with a persistent-header descriptor (post-P5:
                  every sheet scene). */}
              <PersistentHeaderScrollDividerHost
                bodyRuntimeAuthority={bodyRuntimeAuthority}
                headerHeight={persistentHeaderHeight ?? OVERLAY_TAB_HEADER_HEIGHT}
              />
            </View>
          </Animated.View>
        </View>
      </SceneStackTransitionDisplayContext.Provider>
    );

    const profiledSurfaceHost = onProfilerRender ? (
      <React.Profiler id="ActiveSceneStackSurfaceHost" onRender={onProfilerRender}>
        {surfaceHost}
      </React.Profiler>
    ) : (
      surfaceHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'ActiveSceneStackSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSurfaceHost;
  },
  (previousProps, nextProps) =>
    previousProps.bodyRuntimeAuthority === nextProps.bodyRuntimeAuthority &&
    previousProps.displayedSceneKey === nextProps.displayedSceneKey &&
    previousProps.outgoingSceneKey === nextProps.outgoingSceneKey &&
    previousProps.incomingSceneKey === nextProps.incomingSceneKey &&
    previousProps.contentTransitionToken === nextProps.contentTransitionToken &&
    previousProps.onContentSettleComplete === nextProps.onContentSettleComplete &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.onScrollHeaderLayout === nextProps.onScrollHeaderLayout &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry &&
    previousProps.sceneStackSurfaceAuthority === nextProps.sceneStackSurfaceAuthority &&
    previousProps.scrollHeaderComponent === nextProps.scrollHeaderComponent &&
    previousProps.scrollHeaderSyncStyle === nextProps.scrollHeaderSyncStyle &&
    previousProps.shadowShellStyle === nextProps.shadowShellStyle &&
    previousProps.surfaceStyle === nextProps.surfaceStyle
);

const ActiveSceneStackHostLayers = ({
  sceneStackSurfaceAuthority,
  routeSceneDisplayTargetRegistry,
  shadowShellStyle,
  surfaceStyle,
  scrollHeaderComponent,
  onHeaderLayout,
  onScrollHeaderLayout,
  scrollHeaderSyncStyle,
  displayedSceneKey,
  outgoingSceneKey,
  incomingSceneKey,
  contentTransitionToken,
  onContentSettleComplete,
  bodyRuntimeAuthority,
}: BottomSheetSceneStackHostProps) => {
  useSearchNavSwitchCommitAttribution('ActiveSceneStackHostLayers');
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
  const onProfilerRender = useSearchOverlayProfilerRender();
  const sceneStackLayers = (
    <ActiveSceneStackSurfaceHost
      bodyRuntimeAuthority={bodyRuntimeAuthority}
      onHeaderLayout={onHeaderLayout}
      onScrollHeaderLayout={onScrollHeaderLayout}
      routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
      sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
      shadowShellStyle={shadowShellStyle}
      surfaceStyle={surfaceStyle}
      scrollHeaderComponent={scrollHeaderComponent}
      scrollHeaderSyncStyle={scrollHeaderSyncStyle}
      displayedSceneKey={displayedSceneKey}
      outgoingSceneKey={outgoingSceneKey}
      incomingSceneKey={incomingSceneKey}
      contentTransitionToken={contentTransitionToken}
      onContentSettleComplete={onContentSettleComplete}
    />
  );

  if (!onProfilerRender) {
    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'ActiveSceneStackHostLayers',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });
    return sceneStackLayers;
  }

  const profiledSceneStackLayers = (
    <React.Profiler id="ActiveSceneStackHostLayers" onRender={onProfilerRender}>
      {sceneStackLayers}
    </React.Profiler>
  );

  finishSearchNavSwitchRuntimeAttributionSpan({
    owner: 'ActiveSceneStackHostLayers',
    operation: 'render',
    startedAtMs: renderStartedAtMs,
  });

  return profiledSceneStackLayers;
};
