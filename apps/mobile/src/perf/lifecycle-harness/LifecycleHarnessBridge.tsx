import React from 'react';

import { registerLifecycleHarnessVerb } from './lifecycle-harness-registry';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import type { EntityRef } from '../../navigation/runtime/entity-ref-action-policy';
import { getSearchSurfaceRuntime } from '../../screens/Search/runtime/surface/search-surface-runtime';
import { readPerfScenarioCommandRegistry } from '../perf-scenario-command-registry';
import { runHeaderCloseAction } from '../../navigation/runtime/header-nav-action-registry';
import { closeSearchResultsSession } from '../../overlays/search-results-header-live-state';
import type { OverlayKey } from '../../overlays/types';

/**
 * Registers the context-scoped lifecycle-harness verbs (Phase-3 Leg 1b).
 * Mounted dev-only inside AppRouteSceneRuntimeProvider. Verbs added by later
 * legs register at THEIR owning runtimes — this bridge only carries the verbs
 * whose dependencies are the route/coordinator contexts.
 */
const SHEET_SNAP_SCENES: OverlayKey[] = ['search', 'polls', 'bookmarks', 'profile'];

export const LifecycleHarnessBridge: React.FC = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const executeEntityRefAction = useEntityRefActionExecutor();
  const executeEntityRefActionRef = React.useRef(executeEntityRefAction);
  executeEntityRefActionRef.current = executeEntityRefAction;

  React.useEffect(() => {
    const readLifecycleState = () => {
      const routeState = routeSceneRuntime.routeSceneSwitchRuntime.getRouteState();
      const surface = getSearchSurfaceRuntime().getSnapshot();
      const sheetSnaps: Record<string, string | null> = {};
      for (const scene of SHEET_SNAP_SCENES) {
        try {
          sheetSnaps[scene] =
            routeSceneRuntime.routeSheetSnapSessionActions?.getRouteSceneSwitchSceneSnap?.(scene) ??
            null;
        } catch {
          sheetSnaps[scene] = null;
        }
      }
      return {
        root: routeState.rootOverlayKey,
        activeKey: routeState.activeOverlayRoute.key,
        stack: routeState.overlayRouteStack.map((entry) => ({
          key: entry.key,
          entryId: entry.entryId ?? null,
        })),
        stackLength: routeState.overlayRouteStackLength,
        surface: {
          activeBundleKind: surface.activeBundle.kind,
          hasHeldBundle: surface.heldBundle != null,
          redrawTransactionId: surface.redrawTransaction?.id ?? null,
          dismissTransactionId: surface.dismissTransaction?.id ?? null,
        },
        sheetSnaps,
      };
    };

    const unregisterState = registerLifecycleHarnessVerb('read_lifecycle_state', () =>
      readLifecycleState()
    );

    const unregisterTrigger = registerLifecycleHarnessVerb('trigger_mouth', (payload) => {
      const kind = String(payload.kind ?? '');
      if (kind === 'list' || kind === 'restaurant' || kind === 'entity') {
        const ref: EntityRef = {
          entityId: String(payload.entityId ?? ''),
          entityType:
            kind === 'list'
              ? ('list' as EntityRef['entityType'])
              : kind === 'restaurant'
                ? ('restaurant' as EntityRef['entityType'])
                : ((payload.entityType ?? 'food') as EntityRef['entityType']),
          label: String(payload.label ?? ''),
          ...(kind === 'list'
            ? {
                listType: (payload.listType ?? 'restaurant') as 'restaurant' | 'dish',
                targetUserId: (payload.targetUserId as string | undefined) ?? null,
              }
            : null),
        };
        if (!ref.entityId) {
          throw new Error('trigger_mouth requires entityId');
        }
        executeEntityRefActionRef.current(ref);
        return readLifecycleState();
      }
      if (kind === 'shortcut') {
        const submit = readPerfScenarioCommandRegistry().submitShortcutRestaurants;
        if (!submit) {
          throw new Error('shortcut submit not registered');
        }
        void submit();
        return readLifecycleState();
      }
      throw new Error(`unknown mouth kind '${kind}' (list|restaurant|entity|shortcut)`);
    });

    const unregisterDismiss = registerLifecycleHarnessVerb('dismiss', (payload) => {
      const affordance = String(payload.affordance ?? '');
      if (affordance === 'searchBarX') {
        const closeResults = readPerfScenarioCommandRegistry().closeResults;
        if (!closeResults) {
          throw new Error('closeResults not registered (search surface not mounted?)');
        }
        closeResults();
        return readLifecycleState();
      }
      if (affordance === 'back') {
        // Faithful to the real header X protocol: session-close override → the
        // world-bearing derivation (entry.desire → session close) → default pop.
        const activeEntry =
          routeSceneRuntime.routeSceneSwitchRuntime.getRouteState().activeOverlayRoute;
        if (!runHeaderCloseAction(activeEntry.key)) {
          if (activeEntry.desire != null) {
            closeSearchResultsSession();
          } else {
            routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute({
              applyOriginDetent: true,
            });
          }
        }
        return readLifecycleState();
      }
      throw new Error(`unknown affordance '${affordance}' (searchBarX|back)`);
    });

    const unregisterOpenScene = registerLifecycleHarnessVerb('open_scene', (payload) => {
      const openOverlayScene = readPerfScenarioCommandRegistry().openOverlayScene;
      if (!openOverlayScene) {
        throw new Error('openOverlayScene not registered');
      }
      const accepted = openOverlayScene({
        scene: String(payload.scene ?? ''),
        routeParam: (payload.routeParam as string | undefined) ?? null,
        label: 'lifecycle-harness',
      });
      if (!accepted) {
        throw new Error(`open_scene rejected for '${String(payload.scene)}'`);
      }
      return readLifecycleState();
    });

    return () => {
      unregisterState();
      unregisterTrigger();
      unregisterDismiss();
      unregisterOpenScene();
    };
  }, [routeSceneRuntime]);

  return null;
};
