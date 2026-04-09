import type React from 'react';
import { create } from 'zustand';

import type { FavoriteListType } from '../services/favorite-lists';
import type { OverlaySheetSnap } from './types';

export type DockedPollsSnapRequest = {
  snap: OverlaySheetSnap;
  token: number;
};

export type SearchRouteSaveSheetState = {
  visible: boolean;
  listType: FavoriteListType;
  target: { restaurantId?: string; connectionId?: string } | null;
};

type RequestSearchRouteDockedRestoreArgs = {
  snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  pollsSheetSnap?: OverlaySheetSnap;
  isDockedPollsDismissed?: boolean;
  hasUserSharedSnap?: boolean;
  sharedSnap?: Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;
};

type SearchRouteOverlayCommandState = {
  pollsDockedSnapRequest: DockedPollsSnapRequest | null;
  tabOverlaySnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  searchHeaderActionResetToken: number;
  pollsHeaderActionAnimationToken: number;
  pollsSheetSnap: OverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  isNavRestorePending: boolean;
  overlaySwitchInFlight: boolean;
  dockedPollsRestoreInFlight: boolean;
  ignoreDockedPollsHiddenUntilMs: number;
  bookmarksSheetSnap: OverlaySheetSnap;
  profileSheetSnap: OverlaySheetSnap;
  saveSheetState: SearchRouteSaveSheetState;
  saveSheetSnap: OverlaySheetSnap;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  setPollsDockedSnapRequest: (next: React.SetStateAction<DockedPollsSnapRequest | null>) => void;
  setTabOverlaySnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
  requestSearchHeaderActionFollowCollapse: () => void;
  setPollsHeaderActionAnimationToken: (next: React.SetStateAction<number>) => void;
  setPollsSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setIsDockedPollsDismissed: (next: React.SetStateAction<boolean>) => void;
  setIsNavRestorePending: (next: React.SetStateAction<boolean>) => void;
  setOverlaySwitchInFlight: (next: React.SetStateAction<boolean>) => void;
  setDockedPollsRestoreInFlight: (next: React.SetStateAction<boolean>) => void;
  setIgnoreDockedPollsHiddenUntilMs: (next: React.SetStateAction<number>) => void;
  setBookmarksSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setProfileSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setSaveSheetState: (next: React.SetStateAction<SearchRouteSaveSheetState>) => void;
  setSaveSheetSnap: (next: React.SetStateAction<OverlaySheetSnap>) => void;
  setPollCreationSnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
};

const resolveStateUpdate = <T>(current: T, next: React.SetStateAction<T>): T =>
  typeof next === 'function' ? (next as (value: T) => T)(current) : next;

export const useSearchRouteOverlayCommandStore = create<SearchRouteOverlayCommandState>((set) => ({
  pollsDockedSnapRequest: null,
  tabOverlaySnapRequest: null,
  searchHeaderActionResetToken: 0,
  pollsHeaderActionAnimationToken: 0,
  pollsSheetSnap: 'hidden',
  isDockedPollsDismissed: false,
  isNavRestorePending: false,
  overlaySwitchInFlight: false,
  dockedPollsRestoreInFlight: false,
  ignoreDockedPollsHiddenUntilMs: 0,
  bookmarksSheetSnap: 'hidden',
  profileSheetSnap: 'hidden',
  saveSheetState: {
    visible: false,
    listType: 'restaurant',
    target: null,
  },
  saveSheetSnap: 'hidden',
  pollCreationSnapRequest: null,
  setPollsDockedSnapRequest: (next) =>
    set((state) => ({
      pollsDockedSnapRequest: resolveStateUpdate(state.pollsDockedSnapRequest, next),
    })),
  setTabOverlaySnapRequest: (next) =>
    set((state) => ({
      tabOverlaySnapRequest: resolveStateUpdate(state.tabOverlaySnapRequest, next),
    })),
  requestSearchHeaderActionFollowCollapse: () =>
    set((state) => ({
      searchHeaderActionResetToken: state.searchHeaderActionResetToken + 1,
    })),
  setPollsHeaderActionAnimationToken: (next) =>
    set((state) => ({
      pollsHeaderActionAnimationToken: resolveStateUpdate(
        state.pollsHeaderActionAnimationToken,
        next
      ),
    })),
  setPollsSheetSnap: (next) =>
    set((state) => ({
      pollsSheetSnap: resolveStateUpdate(state.pollsSheetSnap, next),
    })),
  setIsDockedPollsDismissed: (next) =>
    set((state) => ({
      isDockedPollsDismissed: resolveStateUpdate(state.isDockedPollsDismissed, next),
    })),
  setIsNavRestorePending: (next) =>
    set((state) => ({
      isNavRestorePending: resolveStateUpdate(state.isNavRestorePending, next),
    })),
  setOverlaySwitchInFlight: (next) =>
    set((state) => ({
      overlaySwitchInFlight: resolveStateUpdate(state.overlaySwitchInFlight, next),
    })),
  setDockedPollsRestoreInFlight: (next) =>
    set((state) => ({
      dockedPollsRestoreInFlight: resolveStateUpdate(state.dockedPollsRestoreInFlight, next),
    })),
  setIgnoreDockedPollsHiddenUntilMs: (next) =>
    set((state) => ({
      ignoreDockedPollsHiddenUntilMs: resolveStateUpdate(
        state.ignoreDockedPollsHiddenUntilMs,
        next
      ),
    })),
  setBookmarksSheetSnap: (next) =>
    set((state) => ({
      bookmarksSheetSnap: resolveStateUpdate(state.bookmarksSheetSnap, next),
    })),
  setProfileSheetSnap: (next) =>
    set((state) => ({
      profileSheetSnap: resolveStateUpdate(state.profileSheetSnap, next),
    })),
  setSaveSheetState: (next) =>
    set((state) => ({
      saveSheetState: resolveStateUpdate(state.saveSheetState, next),
    })),
  setSaveSheetSnap: (next) =>
    set((state) => ({
      saveSheetSnap: resolveStateUpdate(state.saveSheetSnap, next),
    })),
  setPollCreationSnapRequest: (next) =>
    set((state) => ({
      pollCreationSnapRequest: resolveStateUpdate(state.pollCreationSnapRequest, next),
    })),
}));

let nextDockedPollsSnapRequestToken = 0;

export const requestSearchRouteDockedRestore = ({
  snap,
  pollsSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
}: RequestSearchRouteDockedRestoreArgs = {}): void => {
  const commandState = useSearchRouteOverlayCommandStore.getState();
  const currentPollsSheetSnap = pollsSheetSnap ?? commandState.pollsSheetSnap;
  const currentDockedDismissed = isDockedPollsDismissed ?? commandState.isDockedPollsDismissed;
  const isImplicitRecallFromHidden = snap == null && currentPollsSheetSnap === 'hidden';
  const resolvedSnap: Exclude<OverlaySheetSnap, 'hidden'> =
    snap ??
    (currentPollsSheetSnap !== 'hidden'
      ? currentPollsSheetSnap
      : currentDockedDismissed
      ? 'collapsed'
      : hasUserSharedSnap && sharedSnap
      ? sharedSnap
      : 'collapsed');

  commandState.setIgnoreDockedPollsHiddenUntilMs(Date.now() + 650);
  commandState.setDockedPollsRestoreInFlight(true);
  commandState.setIsDockedPollsDismissed(false);
  commandState.setPollsDockedSnapRequest((previous) => {
    if (
      snap == null &&
      resolvedSnap === 'collapsed' &&
      previous &&
      previous.snap !== 'collapsed' &&
      !isImplicitRecallFromHidden
    ) {
      return previous;
    }
    nextDockedPollsSnapRequestToken += 1;
    return {
      snap: resolvedSnap,
      token: nextDockedPollsSnapRequestToken,
    };
  });
};
