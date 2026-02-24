import { useShallow } from 'zustand/react/shallow';

import { useOverlaySheetPositionStore } from '../../../overlays/useOverlaySheetPositionStore';
import { useOverlayStore } from '../../../store/overlayStore';
import { useSearchStore } from '../../../store/searchStore';
import { useSystemStatusStore } from '../../../store/systemStatusStore';

export const useSearchTabSlice = () =>
  useSearchStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      preferredActiveTab: state.preferredActiveTab,
      setActiveTab: state.setActiveTab,
      hasActiveTabPreference: state.hasActiveTabPreference,
      setActiveTabPreference: state.setActiveTabPreference,
      setPreferredActiveTab: state.setPreferredActiveTab,
    }))
  );

export const useSearchFiltersSlice = () =>
  useSearchStore(
    useShallow((state) => ({
      openNow: state.openNow,
      setOpenNow: state.setOpenNow,
      priceLevels: state.priceLevels,
      setPriceLevels: state.setPriceLevels,
      votes100Plus: state.votes100Plus,
      setVotes100Plus: state.setVotes100Plus,
      resetFilters: state.resetFilters,
      scoreMode: state.scoreMode,
      setPreferredScoreMode: state.setPreferredScoreMode,
    }))
  );

export const useOverlaySlice = () =>
  useOverlayStore(
    useShallow((state) => ({
      activeOverlay: state.activeOverlay,
      overlayStack: state.overlayStack,
      overlayParams: state.overlayParams,
      registerTransientDismissor: state.registerTransientDismissor,
      dismissTransientOverlays: state.dismissTransientOverlays,
    }))
  );

export const useSheetPositionSlice = () =>
  useOverlaySheetPositionStore(
    useShallow((state) => ({
      hasUserSharedSnap: state.hasUserSharedSnap,
      sharedSnap: state.sharedSnap,
    }))
  );

export const useSystemStatusSlice = () =>
  useSystemStatusStore(
    useShallow((state) => ({
      isOffline: state.isOffline,
      hasSystemStatusBanner: state.isOffline || Boolean(state.serviceIssue),
    }))
  );
