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
  /**
   * The last EXPLICITLY picked city (a tapped pick-a-city card). Sent with
   * every feed fetch as a SOFT FALLBACK: the server's viewport verdict wins
   * whenever it honestly resolves a live city; the pick fills only the
   * broader-than-city gap (a city-bbox camera fit leaves the city under the
   * ⅔ header law, so without this the tap lands back on pick-a-city).
   */
  pickedCityId: string | null;
  /** Increments on EVERY pick — the runtime's refetch edge. A re-tap of the
   *  same city is still an explicit act and must still refetch (the id alone
   *  wouldn't change). */
  pickSeq: number;
  setFeed: (feed: HomeFeedResponse) => void;
  setStatus: (status: HomeFeedStatus) => void;
  setPickedCity: (placeId: string) => void;
};

export const useHomeFeedStore = create<HomeFeedState>((set) => ({
  feed: null,
  status: 'idle',
  pickedCityId: null,
  pickSeq: 0,
  setFeed: (feed) => set({ feed, status: 'ready' }),
  setStatus: (status) => set({ status }),
  setPickedCity: (placeId) =>
    set((state) => ({ pickedCityId: placeId, pickSeq: state.pickSeq + 1 })),
}));

/**
 * THE home scene nav-visibility fact (written by the home scene-input
 * controller — the docked-lane hybrid publisher; read by the body's data
 * gate). Mirrors the polls-as-docked semantics: visible while the docked
 * lane presents home and the sheet is not dismissed/hidden.
 */
export type HomeSceneState = {
  visible: boolean;
  setSceneState: (state: Pick<HomeSceneState, 'visible'>) => void;
};

export const useHomeSceneStateStore = create<HomeSceneState>((set) => ({
  visible: false,
  setSceneState: (state) => set(state),
}));
