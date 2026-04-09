import type React from 'react';

import type {
  DockedPollsSnapRequest,
  SearchRouteSaveSheetState,
} from './searchRouteOverlayCommandStore';
import type { OverlaySheetSnap } from './types';

export type SearchRouteOverlayCommandState = {
  searchHeaderActionResetToken: number;
  pollsHeaderActionAnimationToken: number;
  pollsDockedSnapRequest: DockedPollsSnapRequest | null;
  tabOverlaySnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
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
};

export type SearchRouteOverlayCommandActions = {
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

export type SearchRouteOverlaySaveSheetRuntime = {
  saveSheetState: SearchRouteSaveSheetState;
  showSaveListOverlay: boolean;
  getDishSaveHandler: (connectionId: string) => () => void;
  getRestaurantSaveHandler: (restaurantId: string) => () => void;
  handleRestaurantSavePress: (restaurantId: string) => void;
  handleCloseSaveSheet: () => void;
};

export type SearchRouteOverlayDockedPollsRestoreRuntime = {
  requestDockedPollsRestore: (snap?: Exclude<OverlaySheetSnap, 'hidden'>) => void;
  restoreDockedPolls: (args?: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
    clearTabSnapRequest?: boolean;
  }) => void;
};

export type SearchRouteOverlayResultsUiResetRuntime = {
  handleCloseResultsUiReset: () => void;
};
