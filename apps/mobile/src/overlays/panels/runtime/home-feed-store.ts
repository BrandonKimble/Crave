import { create } from 'zustand';

import type { HomeFeedResponse } from '../../../services/home';

/**
 * THE home feed state (home-surface-charter). Module-scope zustand (house
 * pattern — polls-feed-controls-store): the BODY (home feed runtime, mounted
 * at the app-shell writer host, whose effects fire) is the only writer; the
 * persistent-header Title reads `feed.resolvedCity` from here so the header
 * consumes the SAME feed response's verdict (no separate verdict fetch).
 */
export type HomeFeedStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type HomeFeedState = {
  feed: HomeFeedResponse | null;
  status: HomeFeedStatus;
  setFeed: (feed: HomeFeedResponse) => void;
  setStatus: (status: HomeFeedStatus) => void;
};

export const useHomeFeedStore = create<HomeFeedState>((set) => ({
  feed: null,
  status: 'idle',
  setFeed: (feed) => set({ feed, status: 'ready' }),
  setStatus: (status) => set({ status }),
}));

/**
 * THE home scene nav-visibility fact (written by the home scene-input
 * controller — the docked-lane hybrid publisher; read by the body's data
 * gate). Mirrors the polls-as-docked semantics: visible while the docked
 * lane presents home and the sheet is not dismissed/hidden.
 */
export type HomeSceneState = {
  visible: boolean;
  currentSnap: 'expanded' | 'middle' | 'collapsed' | 'hidden';
  setSceneState: (state: Pick<HomeSceneState, 'visible' | 'currentSnap'>) => void;
};

export const useHomeSceneStateStore = create<HomeSceneState>((set) => ({
  visible: false,
  currentSnap: 'collapsed',
  setSceneState: (state) => set(state),
}));
