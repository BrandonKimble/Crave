import { create } from 'zustand';

import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../../navigation/runtime/app-route-scene-descriptor-contract';

/**
 * THE feed-runtime handle (red-team 2026-08-19 mobile P0, ruled 2026-09-04).
 *
 * The polls and home feed runtimes — controller state, socket, fetches, toggle
 * consequences — are app-lifetime singletons keyed by SCENE identity (each feed
 * scene is a tab root with exactly one entry, so scene identity IS entry
 * identity for them). ONE mounted owner instantiates each runtime: the
 * app-shell scene-input writer host (use-app-route-{polls,home}-scene-input-
 * writer-runtime), which is mounted for the whole life of the app shell and is
 * already the publisher the presented leg paints from. Every other consumer —
 * the track host's leg resolver (a per-render resolution pass that must read
 * lanes, never run feeds) — reads that one instance's list parts through this
 * registry instead of instantiating its own. Before the P0 fix the resolver
 * called the parts hooks itself, so every effect committed TWICE: two socket
 * connections, two /polls/query and two home-feed fetches per trigger, two
 * header-model writers racing.
 *
 * Module-scope zustand (house pattern — home-feed-store). null = the owner
 * has not committed a publication yet (one boot commit) or has unmounted.
 */
export type FeedSceneKey = 'polls' | 'home';

export type FeedSceneParts = {
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
};

type FeedScenePartsRegistryState = {
  parts: Record<FeedSceneKey, FeedSceneParts | null>;
  publishFeedSceneParts: (scene: FeedSceneKey, parts: FeedSceneParts) => void;
  clearFeedSceneParts: (scene: FeedSceneKey) => void;
};

export const useFeedScenePartsRegistry = create<FeedScenePartsRegistryState>((set) => ({
  parts: { polls: null, home: null },
  publishFeedSceneParts: (scene, parts) =>
    set((state) =>
      state.parts[scene] === parts ? state : { parts: { ...state.parts, [scene]: parts } }
    ),
  clearFeedSceneParts: (scene) =>
    set((state) =>
      state.parts[scene] === null ? state : { parts: { ...state.parts, [scene]: null } }
    ),
}));

export const publishFeedSceneParts = (scene: FeedSceneKey, parts: FeedSceneParts): void =>
  useFeedScenePartsRegistry.getState().publishFeedSceneParts(scene, parts);

export const clearFeedSceneParts = (scene: FeedSceneKey): void =>
  useFeedScenePartsRegistry.getState().clearFeedSceneParts(scene);

/** The owner's live list parts for a feed scene (null until the owner's first commit). */
export const useFeedSceneParts = (scene: FeedSceneKey): FeedSceneParts | null =>
  useFeedScenePartsRegistry((state) => state.parts[scene]);
