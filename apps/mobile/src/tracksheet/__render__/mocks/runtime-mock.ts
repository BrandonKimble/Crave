// ─── App-runtime seam mocks (render lane) ────────────────────────────────────
//
// One file serves every navigation/overlay/search RUNTIME module the host
// imports. Everything delegates to the harness world AT CALL TIME (worlds are
// rebuilt per test) — records in, controllable data out, zero host logic.

import React from 'react';
import { useSyncExternalStore } from 'react';

import { harness } from '../harness';

// ── AppRouteSceneRuntimeProvider ──
export const useAppRouteSceneRuntime = (): unknown => harness.world.sceneRuntime;

// ── AppRouteSharedSheetRuntimeProvider ──
export const useAppRouteSharedSheetRuntimeOwner = (): unknown => harness.world.sharedSheetOwner;

// ── use-presentation-frame ──
export const usePresentationFrame = (_runtime: unknown): unknown =>
  useSyncExternalStore(harness.world.frameStore.subscribe, () => harness.world.frameStore.get());

// ── scene-foundation-spec ──
export type SheetSceneKey = string;
const LOADING_MATERIALS: Record<string, { rowType: string; withStripHoles: boolean }> = {
  polls: { rowType: 'poll', withStripHoles: true },
  home: { rowType: 'home', withStripHoles: false },
  restaurant: { rowType: 'restaurant', withStripHoles: false },
  userProfile: { rowType: 'profile', withStripHoles: false },
};
export const resolveSceneLoadingMaterial = (
  sceneKey: string
): { rowType: string; withStripHoles: boolean } | null => LOADING_MATERIALS[sceneKey] ?? null;

// ── app-route-persistent-header-registry ──
const titleCache = new Map<string, React.ComponentType>();
const stripCache = new Map<string, React.ComponentType>();
export const getPersistentHeaderDescriptor = (
  sceneKey: string
): { Title?: React.ComponentType; Strip?: React.ComponentType; Extras?: undefined } | null => {
  let Title = titleCache.get(sceneKey);
  if (Title == null) {
    Title = () => React.createElement('leg-title', { scene: sceneKey });
    titleCache.set(sceneKey, Title);
  }
  let Strip = stripCache.get(sceneKey);
  if (Strip == null && sceneKey === 'polls') {
    Strip = () => React.createElement('leg-strip', { scene: sceneKey });
    stripCache.set(sceneKey, Strip);
  }
  return { Title, Strip: sceneKey === 'polls' ? Strip : undefined, Extras: undefined };
};

// ── header-nav-action-registry ──
export const runHeaderCloseAction = (_scene: string): boolean => false;
export const runHeaderCreateAction = (_scene: string): boolean => false;

// ── transition-engine/transition-transaction ──
export const getLiveTransitionTxn = (): unknown => harness.world.txn.live;
export const offerTransitionJoinInput = (input: string): void => {
  harness.world.txn.offers.push(input);
};
export const amendTransitionTxnJoinInputs = (inputs: string[]): void => {
  harness.world.txn.amends.push(inputs);
};
export const sealLiveTransitionTxnJoin = (): void => {
  harness.world.txn.seals += 1;
};

// ── scene-chrome-ack-runtime ──
export const recordSceneChromeAck = (scene: string): void => {
  harness.world.chromeAcks.push(scene);
};

// ── useAppOverlayRouteController ──
const overlayController = {
  closeActiveRoute: (): void => undefined,
  promoteActiveSheet: (_args: unknown): void => undefined,
  pushRoute: (_key: string): void => undefined,
};
export const useAppOverlayRouteController = (): typeof overlayController => overlayController;

// ── search-surface-runtime ──
export const getSearchSurfaceRuntime = (): unknown => harness.world.surface.runtime;

// ── search-startup-geometry-seed-runtime ──
export const getSearchStartupGeometrySeed = (): {
  routeOverlaySnapPoints: { expanded: number; middle: number; collapsed: number };
} => ({
  routeOverlaySnapPoints: (
    harness.world.sharedSheetOwner as {
      snapPoints: { expanded: number; middle: number; collapsed: number };
    }
  ).snapPoints,
});
