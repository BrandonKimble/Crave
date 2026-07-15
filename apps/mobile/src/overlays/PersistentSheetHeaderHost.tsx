import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import {
  runHeaderCloseAction,
  runHeaderCreateAction,
} from '../navigation/runtime/header-nav-action-registry';
import {
  getSceneFoundationSpec,
  type SheetSceneKey,
} from '../navigation/runtime/scene-foundation-spec';
import { SceneStripLawContext } from '../toggles/toggle-strip-scene-law';
import { useAppOverlayRouteController } from './useAppOverlayRouteController';
import { closeSearchResultsSession } from './search-results-header-live-state';
import {
  getLiveTransitionTxn,
  subscribeTransitionTxn,
} from '../navigation/runtime/transition-engine/transition-transaction';
import { recordSceneChromeAck, recordSceneChromeMeasuredHeight } from './scene-chrome-ack-runtime';
import HeaderNavAction from './HeaderNavAction';
import OverlaySheetHeaderChrome from './OverlaySheetHeaderChrome';

// THE PERSISTENT SHEET HEADER (page-switch-master-plan.md §6-P3 / owner req 2b). ONE
// OverlaySheetHeaderChrome hoisted ABOVE the scene-stack legs (a sibling in
// ActiveSceneStackSurfaceHost, exactly how the Phase-0 frost plate was hoisted below them). It
// never unmounts and never rides a leg's opacity/mount gate — the chrome (white cutout plate,
// grab handle, close-circle cutout) is CONSTANT; the only things that swap, in the SAME committed
// frame as press-up, are the CONTENT slots resolved from the persistent-header registry by
// PresentationFrame.activeSceneKey: the left title, the right action area, and the grab press.
// The header is the user's "which page am I on" signal — that's why it swaps instantly and never
// skeletons (title seeds cover late data).
//
// SCOPE (P5): ALL presented sheet scenes — search included (its results header registered via
// search-results-header-live-state, completing owner req 2e). A scene without a descriptor
// (should not exist anymore) falls back to rendering nothing.
//
// GRAB-HANDLE / HEADER TAP (owner req 2026-07-02): the press is UNIFORM across every scene now —
// it PROMOTES the shared sheet up to at least middle (promoteActiveSheet) and can NEVER dismiss
// or collapse. So there is no per-scene grab hook anymore: one shared handler is wired here.
// Dismiss lives ONLY on the close (X) button in each scene's Action slot.

// Dev-only: warn ONCE per scene key when a presented scene has no descriptor (see the guard in
// the host below) — module scope so re-renders don't spam.
const warnedMissingDescriptorScenes = new Set<string>();
// Dev-only: the INVERSE strip law (leg 3 — plans/toggle-strip-rebuild-ledger.md). The
// foundation table's `strip: 'header'` is load-bearing on the HEADER side too: a scene
// declaring the header mount with no registered Strip slot is a silent no-strip page —
// bark it (same pattern as the missing-descriptor contract). And the reverse: a Strip
// slot on a scene NOT declared 'header' means declaration and registration disagree.
const barkedStripLawScenes = new Set<string>();

export const PersistentSheetHeaderHost: React.FC<{
  onHeaderLayout?: (event: LayoutChangeEvent) => void;
}> = ({ onHeaderLayout }) => {
  const { routeSceneSwitchRuntime } = useAppRouteSceneRuntime();
  const frame = usePresentationFrame(routeSceneSwitchRuntime);
  const { promoteActiveSheet } = useAppOverlayRouteController();
  // PRESENTED truth drives the header (presentedSceneKey first, activeSceneKey fallback): the
  // header must title WHAT THE SHEET IS PAINTING, and presentedSceneKey is the leg that paints.
  // The one legal steady divergence is the docked-polls lane — route/activeSceneKey is 'search'
  // while the sheet presents the polls feed — and presented-first is exactly what shows the polls
  // header there. activeSceneKey only backstops the frames where no presented key exists yet.
  // §Q redo T1d (ledger O-1/P-14): during a FREEZE-MODE dismissal the chrome is part of
  // the frozen bundle — the header keeps the OUTGOING scene until the transaction's
  // reveal (the boundary edge), so header/strip/body swap in ONE frame. Page switches
  // keep the chrome-leads law (their plans never freeze).
  const liveTxn = React.useSyncExternalStore(subscribeTransitionTxn, getLiveTransitionTxn);
  const frozenChromeSceneKey =
    liveTxn != null &&
    liveTxn.plan.content.kind === 'freezeUntilSnap' &&
    (liveTxn.phase === 'staged' || liveTxn.phase === 'committed' || liveTxn.phase === 'joining') &&
    liveTxn.mutation.sourceSceneKey != null
      ? liveTxn.mutation.sourceSceneKey
      : null;
  const sceneKey = frozenChromeSceneKey ?? frame.presentedSceneKey ?? frame.activeSceneKey;
  const descriptor = sceneKey != null ? getPersistentHeaderDescriptor(sceneKey) : undefined;
  // ─── HeaderNavAction driver (leg 6 — §4 plus↔X rotation, child-transition primitive §3.2).
  // ONE host-owned rotating control; the driver is the PF chrome clock (frame.headerNavAction,
  // committed on press-up), so the rotation starts DURING the transition by construction.
  // 0 = red plus (parents), 1 = black X (children/search results); child→child stays 1 (no
  // animation). 220ms out-cubic — the proven prior-art feel (OverlayHeaderActionButton).
  const headerNavAction = frame.headerNavAction;
  const navActionProgress = useSharedValue(headerNavAction === 'close' ? 1 : 0);
  React.useEffect(() => {
    navActionProgress.value = withTiming(headerNavAction === 'close' ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [headerNavAction, navActionProgress]);
  // ─── chromeAck (leg 6 — §2.3 joined reveal): recorded POST-COMMIT for the scene this host
  // just committed (the host is a real component — its effects fire, unlike body-spec hooks).
  // The scene-stack host's reveal joins {paintAck, chromeAck}, so body opacity can never lead
  // the header/strip paint. Recorded even when the descriptor is missing (the missing-
  // descriptor bark below is the signal there; the reveal must not deadlock on it).
  React.useLayoutEffect(() => {
    if (sceneKey != null) {
      recordSceneChromeAck(sceneKey);
    }
  }, [sceneKey]);
  const { closeActiveRoute, pushRoute } = useAppOverlayRouteController();
  const handleNavActionPress = React.useCallback(() => {
    if (sceneKey == null) {
      return;
    }
    if (headerNavAction === 'close') {
      // Session-close overrides first ('search' = the published results-session close;
      // 'restaurant' = its token-guarded session close); default = the canonical
      // pop-to-origin dismiss every child inherits.
      if (runHeaderCloseAction(sceneKey)) {
        return;
      }
      // Leg 4 (design §1.3/C3): a WORLD-BEARING entry's X is a SESSION close by
      // DERIVATION — the launch chokepoint stamped the desire onto the entry, so any
      // scene presenting a world inherits the full back-out (tuple→idle, world/native
      // teardown, pop to captured origin) with zero per-scene registration.
      const activeEntry = routeSceneSwitchRuntime.getRouteState?.().activeOverlayRoute ?? null;
      if (activeEntry?.desire != null) {
        closeSearchResultsSession();
        return;
      }
      closeActiveRoute();
      return;
    }
    // CREATE (parents). Panel-internal create flows register on the header-create registry
    // (module-scope); route-level fallbacks below. Parents are non-dismissable by
    // construction — the plus press never dismisses.
    if (runHeaderCreateAction(sceneKey)) {
      return;
    }
    if (sceneKey === 'polls') {
      // Fallback create-poll push. The market-gated create (market params + "Pick a market"
      // modal) registers from PollsPanel's header Title mount (leg 7) — this fallback only
      // fires if the plus is pressed before that effect commits, and the warn is the signal.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          `[HeaderNavAction] polls create fell back to a bare pollCreation push — ` +
            `PollsPanel has not registered its market-gated create on the header-create registry.`
        );
      }
      pushRoute('pollCreation');
      return;
    }
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error(
        sceneKey === 'profile'
          ? `[HeaderNavAction] STUB: profile's catch-all create sheet is OWNER-OPEN ` +
              `(wave-2 charter §9 — profile page deferred). No action wired on purpose.`
          : `[HeaderNavAction] no create action for presented scene '${sceneKey}' — ` +
              `register one via registerHeaderCreateAction.`
      );
    }
  }, [sceneKey, headerNavAction, closeActiveRoute, pushRoute]);
  // P5: fan the chrome layout out to the host (leg insets + sheet headerHeight) AND the
  // presented scene's optional observer (search feeds its internal header-height math off the
  // same measurement its old in-frame header produced). Plain function — descriptor identity is
  // stable at module scope and onHeaderLayout is host-stable.
  const descriptorOnChromeLayout = descriptor?.onChromeLayout;
  const handleChromeLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      // §2.7 measured-chrome cache: record THIS scene's chrome height so the next presentation
      // of it (and of any same-composition scene) derives the body-lane inset synchronously in
      // the PF commit — the chrome box and the body lane move in the same committed frame.
      if (sceneKey != null) {
        recordSceneChromeMeasuredHeight(sceneKey, event.nativeEvent.layout.height);
      }
      onHeaderLayout?.(event);
      descriptorOnChromeLayout?.(event);
    },
    [sceneKey, onHeaderLayout, descriptorOnChromeLayout]
  );
  if (descriptor == null || sceneKey == null) {
    // A presented scene with NO registered descriptor unmounts the ENTIRE persistent chrome
    // (white plate + grab handle + close cutout), not just the title — every sheet scene must
    // register a descriptor at module scope. Surface that loudly in dev instead of silently
    // blanking the header.
    if (
      __DEV__ &&
      sceneKey != null &&
      descriptor == null &&
      !warnedMissingDescriptorScenes.has(sceneKey)
    ) {
      warnedMissingDescriptorScenes.add(sceneKey);
      // The foundation table (scene-foundation-spec.ts) declares header: 'persistent'
      // for every sheet scene — a missing descriptor is a CONTRACT VIOLATION, not a
      // styling nit: the entire sheet chrome unmounts. Bark accordingly (error, named
      // key); prod behavior stays graceful-null.
      const requiresHeader = getSceneFoundationSpec(sceneKey)?.header === 'persistent';
      const report = requiresHeader ? console.error : console.warn;
      report(
        `[FOUNDATION] presented scene '${sceneKey}' has no persistent-header descriptor` +
          ` — the full sheet chrome is unmounted. Register one via` +
          ` registerPersistentHeaderDescriptor (scene-foundation-spec.ts declares` +
          ` header: 'persistent' for every sheet scene).`
      );
    }
    return null;
  }
  const TitleContent = descriptor.Title;
  // Leg 6: descriptor.Action is a DEAD slot (host-owned HeaderNavAction below); the optional
  // Extras slot renders LEFT of the nav action, riding the same transitionProgress.
  const ExtrasContent = descriptor.Extras;
  // §Q redo T2 (ledger P-1): THE STRIP RIDES THE BODY BUNDLE. Chrome-leads (O-5) is
  // title + nav ONLY — during a HELD page switch the outgoing body stays visible, so
  // unmounting ITS header-mounted strip at press-up left the strip band's plate holes
  // exposed over the held body (the owner's "gaping hole to frost"). The strip slot
  // resolves from the OUTGOING scene until the transaction reveals, swapping in the
  // same frame as the body (O-1's bundle law applied to the strip region).
  const heldUnrevealedSourceKey =
    liveTxn != null &&
    liveTxn.plan.content.kind === 'holdOutgoingUntilSettle' &&
    (liveTxn.phase === 'staged' || liveTxn.phase === 'committed' || liveTxn.phase === 'joining') &&
    liveTxn.mutation.sourceSceneKey != null
      ? liveTxn.mutation.sourceSceneKey
      : null;
  const stripSceneKey = heldUnrevealedSourceKey ?? sceneKey;
  const stripDescriptor =
    stripSceneKey === sceneKey ? descriptor : getPersistentHeaderDescriptor(stripSceneKey);
  const StripContent = stripDescriptor?.Strip;
  const foundationSpec = getSceneFoundationSpec(sceneKey);
  // THE INVERSE STRIP LAW (leg 3): `strip: 'header'` in the foundation table means THIS
  // host renders the scene's strip — a declared-but-missing Strip slot (or a Strip slot
  // the table doesn't sanction) is a contract violation, not a styling nit. Judged on
  // the STRIP's own scene (which trails the title during a held switch — P-1).
  if (__DEV__ && !barkedStripLawScenes.has(stripSceneKey)) {
    const stripFoundationSpec = getSceneFoundationSpec(stripSceneKey);
    const declaresHeaderStrip = stripFoundationSpec?.strip === 'header';
    if (declaresHeaderStrip && StripContent == null) {
      barkedStripLawScenes.add(stripSceneKey);
      console.error(
        `[FOUNDATION] scene '${stripSceneKey}' declares strip: 'header' but registered no Strip` +
          ` slot on its persistent-header descriptor — the page presents with NO strip.` +
          ` Register Strip via registerPersistentHeaderDescriptor.`
      );
    } else if (!declaresHeaderStrip && StripContent != null) {
      barkedStripLawScenes.add(stripSceneKey);
      console.error(
        `[FOUNDATION] scene '${stripSceneKey}' registered a persistent-header Strip slot but its` +
          ` foundation row declares strip: '${stripFoundationSpec?.strip ?? 'none'}' — declaration` +
          ` and registration must agree (scene-foundation-spec.ts).`
      );
    }
  }
  // W4 (§9a settings full-snap row): scene-foundation `grabHandle: 'hidden'` scenes render
  // the SAME persistent chrome minus the handle bar + cutout AND minus the promote press —
  // full-page illusion, X close is the only affordance. Every other scene keeps the handle.
  const grabHandleHidden = foundationSpec?.grabHandle === 'hidden';
  return (
    // The ONE measured chrome box (leg 3): the wrapper's onLayout — not the chrome row's —
    // feeds the header-height fan-out, so a header-mounted strip GROWS the measured chrome:
    // the divider (top = headerHeight − 1) lands below the strip and every leg's reserved
    // body lane starts under it, by the existing measurement plumbing. For strip-less
    // scenes the wrapper is exactly the chrome box — byte-identical geometry to before.
    <View
      pointerEvents="box-none"
      style={styles.persistentHeaderOverlay}
      onLayout={handleChromeLayout}
    >
      <OverlaySheetHeaderChrome
        title={<TitleContent />}
        actionButton={
          <View style={styles.headerActionGroup} pointerEvents="box-none">
            {ExtrasContent != null ? (
              <ExtrasContent transitionProgress={navActionProgress} />
            ) : null}
            <HeaderNavAction
              progress={navActionProgress}
              onPress={handleNavActionPress}
              accessibilityLabel={headerNavAction === 'close' ? 'Close page' : 'Create'}
            />
          </View>
        }
        onGrabHandlePress={grabHandleHidden ? undefined : promoteActiveSheet}
        grabHandleAccessibilityLabel="Expand sheet"
        grabHandleHidden={grabHandleHidden}
      />
      {StripContent != null ? (
        // HEADER-EXTENSION STRIP MOUNT (audit D4.2): the band renders directly under the
        // title row, over the sheet's hoisted frost (above the body plate by z-order and
        // above the body lane by geometry) — `backdrop: 'chrome-frost'`, honest cutouts
        // for free. The scene-law context binds ToggleStrip's placement assert to the
        // PRESENTED scene. The 8px white spacer below the band mirrors the results
        // reference (resultsListHeaderBottomStrip) so the band-to-divider seam reads
        // identical across both mounts.
        <SceneStripLawContext.Provider value={stripSceneKey as SheetSceneKey}>
          <View pointerEvents="box-none">
            <StripContent />
            <View style={styles.headerStripBottomSpacer} />
          </View>
        </SceneStripLawContext.Provider>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  // Above every leg's internal z-layers (page overlay lane is 50) — the one header sits on top.
  persistentHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
    elevation: 60,
  },
  headerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStripBottomSpacer: {
    height: 8,
    width: '100%',
    backgroundColor: '#ffffff',
  },
});

export default PersistentSheetHeaderHost;
