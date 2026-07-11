import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePresentationFrame } from '../navigation/runtime/use-presentation-frame';
import { getPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { getSceneFoundationSpec } from '../navigation/runtime/scene-foundation-spec';
import { useAppOverlayRouteController } from './useAppOverlayRouteController';
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
  const sceneKey = frame.presentedSceneKey ?? frame.activeSceneKey;
  const descriptor = sceneKey != null ? getPersistentHeaderDescriptor(sceneKey) : undefined;
  // P5: fan the chrome layout out to the host (leg insets + sheet headerHeight) AND the
  // presented scene's optional observer (search feeds its internal header-height math off the
  // same measurement its old in-frame header produced). Plain function — descriptor identity is
  // stable at module scope and onHeaderLayout is host-stable.
  const descriptorOnChromeLayout = descriptor?.onChromeLayout;
  const handleChromeLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      onHeaderLayout?.(event);
      descriptorOnChromeLayout?.(event);
    },
    [onHeaderLayout, descriptorOnChromeLayout]
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
  const ActionContent = descriptor.Action;
  // W4 (§9a settings full-snap row): scene-foundation `grabHandle: 'hidden'` scenes render
  // the SAME persistent chrome minus the handle bar + cutout AND minus the promote press —
  // full-page illusion, X close is the only affordance. Every other scene keeps the handle.
  const grabHandleHidden = getSceneFoundationSpec(sceneKey)?.grabHandle === 'hidden';
  return (
    <View pointerEvents="box-none" style={styles.persistentHeaderOverlay}>
      <OverlaySheetHeaderChrome
        title={<TitleContent />}
        actionButton={<ActionContent />}
        onGrabHandlePress={grabHandleHidden ? undefined : promoteActiveSheet}
        grabHandleAccessibilityLabel="Expand sheet"
        grabHandleHidden={grabHandleHidden}
        onLayout={handleChromeLayout}
      />
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
});

export default PersistentSheetHeaderHost;
