import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import type { OverlayKey } from '../../../store/overlayStore';
import type { OverlayRuntimeController } from '../runtime/controller/overlay-runtime-controller';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

type DockedPollsSnapRequest = {
  snap: OverlaySheetSnap;
  token: number;
};

type UseOverlaySnapOrchestrationArgs = {
  handleOverlaySelect: (target: OverlayKey) => void;
  setPollsSheetSnap: React.Dispatch<React.SetStateAction<OverlaySheetSnap>>;
  setPollsDockedSnapRequest: React.Dispatch<React.SetStateAction<DockedPollsSnapRequest | null>>;
  setTabOverlaySnapRequest: React.Dispatch<
    React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  >;
  setIsDockedPollsDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  setPollCreationSnapRequest: React.Dispatch<
    React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  >;
  setBookmarksSheetSnap: React.Dispatch<React.SetStateAction<OverlaySheetSnap>>;
  setProfileSheetSnap: React.Dispatch<React.SetStateAction<OverlaySheetSnap>>;
  pollsDockedSnapRequest: DockedPollsSnapRequest | null;
  tabOverlaySnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  pollsSheetSnap: OverlaySheetSnap;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden'>;
  rootOverlay: OverlayKey;
  overlaySwitchInFlightRef: React.MutableRefObject<boolean>;
  dockedPollsRestoreInFlightRef: React.MutableRefObject<boolean>;
  ignoreDockedPollsHiddenUntilMsRef: React.MutableRefObject<number>;
  overlayRuntimeController: OverlayRuntimeController;
  restoreDockedPolls: () => void;
};

type UseOverlaySnapOrchestrationResult = {
  requestReturnToSearchFromPolls: () => void;
  handlePollsSnapStart: (snap: OverlaySheetSnap) => void;
  handlePollsSnapChange: (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ) => void;
  requestPollCreationExpand: () => void;
  handlePollCreationSnapChange: (snap: OverlaySheetSnap) => void;
  handleBookmarksSnapStart: (snap: OverlaySheetSnap) => void;
  handleBookmarksSnapChange: (snap: OverlaySheetSnap) => void;
  handleProfileSnapStart: (snap: OverlaySheetSnap) => void;
  handleProfileSnapChange: (snap: OverlaySheetSnap) => void;
};

export const useOverlaySnapOrchestration = ({
  handleOverlaySelect,
  setPollsSheetSnap,
  setPollsDockedSnapRequest,
  setTabOverlaySnapRequest,
  setIsDockedPollsDismissed,
  setPollCreationSnapRequest,
  setBookmarksSheetSnap,
  setProfileSheetSnap,
  pollsDockedSnapRequest,
  tabOverlaySnapRequest,
  pollCreationSnapRequest,
  pollsSheetSnap,
  hasUserSharedSnap,
  sharedSnap,
  rootOverlay,
  overlaySwitchInFlightRef,
  dockedPollsRestoreInFlightRef,
  ignoreDockedPollsHiddenUntilMsRef,
  overlayRuntimeController,
  restoreDockedPolls,
}: UseOverlaySnapOrchestrationArgs): UseOverlaySnapOrchestrationResult => {
  const requestReturnToSearchFromPolls = React.useCallback(
    () => handleOverlaySelect('search'),
    [handleOverlaySelect]
  );

  const handlePollsSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
    },
    [setPollsSheetSnap]
  );

  const handlePollsSnapChange = React.useCallback(
    (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => {
      setPollsSheetSnap(snap);
      if (snap === 'collapsed') {
        dockedPollsRestoreInFlightRef.current = false;
      }
      if (pollsDockedSnapRequest && pollsDockedSnapRequest.snap === snap) {
        setPollsDockedSnapRequest(null);
      }
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden') {
        if (rootOverlay === 'search') {
          const isGestureHidden = meta?.source === 'gesture';
          if (!isGestureHidden) {
            return;
          }
          if (
            dockedPollsRestoreInFlightRef.current ||
            pollsDockedSnapRequest?.snap === 'collapsed'
          ) {
            return;
          }
          if (Date.now() < ignoreDockedPollsHiddenUntilMsRef.current) {
            return;
          }
          dockedPollsRestoreInFlightRef.current = false;
          setPollsDockedSnapRequest(null);
          setIsDockedPollsDismissed(true);
          return;
        }
        setTabOverlaySnapRequest(null);
        if (rootOverlay === 'polls' && !overlaySwitchInFlightRef.current) {
          unstable_batchedUpdates(() => {
            overlayRuntimeController.switchToSearchRootWithDockedPolls(restoreDockedPolls);
          });
        }
      }
    },
    [
      dockedPollsRestoreInFlightRef,
      ignoreDockedPollsHiddenUntilMsRef,
      overlayRuntimeController,
      overlaySwitchInFlightRef,
      pollsDockedSnapRequest,
      restoreDockedPolls,
      rootOverlay,
      setIsDockedPollsDismissed,
      setPollsDockedSnapRequest,
      setPollsSheetSnap,
      setTabOverlaySnapRequest,
      tabOverlaySnapRequest,
    ]
  );

  const requestPollCreationExpand = React.useCallback(() => {
    if (pollsSheetSnap !== 'collapsed') {
      return;
    }
    const desired = hasUserSharedSnap ? sharedSnap : 'expanded';
    setPollCreationSnapRequest(desired);
  }, [hasUserSharedSnap, pollsSheetSnap, setPollCreationSnapRequest, sharedSnap]);

  const handlePollCreationSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
      if (pollCreationSnapRequest && pollCreationSnapRequest === snap) {
        setPollCreationSnapRequest(null);
      }
    },
    [pollCreationSnapRequest, setPollCreationSnapRequest, setPollsSheetSnap]
  );

  const handleBookmarksSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
    },
    [setBookmarksSheetSnap]
  );

  const handleBookmarksSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden' && rootOverlay === 'bookmarks' && !overlaySwitchInFlightRef.current) {
        setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          overlayRuntimeController.switchToSearchRootWithDockedPolls(restoreDockedPolls);
        });
      }
    },
    [
      overlayRuntimeController,
      overlaySwitchInFlightRef,
      restoreDockedPolls,
      rootOverlay,
      setBookmarksSheetSnap,
      setTabOverlaySnapRequest,
      tabOverlaySnapRequest,
    ]
  );

  const handleProfileSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setProfileSheetSnap(snap);
    },
    [setProfileSheetSnap]
  );

  const handleProfileSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setProfileSheetSnap(snap);
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden' && rootOverlay === 'profile' && !overlaySwitchInFlightRef.current) {
        setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          overlayRuntimeController.switchToSearchRootWithDockedPolls(restoreDockedPolls);
        });
      }
    },
    [
      overlayRuntimeController,
      overlaySwitchInFlightRef,
      restoreDockedPolls,
      rootOverlay,
      setProfileSheetSnap,
      setTabOverlaySnapRequest,
      tabOverlaySnapRequest,
    ]
  );

  return {
    requestReturnToSearchFromPolls,
    handlePollsSnapStart,
    handlePollsSnapChange,
    requestPollCreationExpand,
    handlePollCreationSnapChange,
    handleBookmarksSnapStart,
    handleBookmarksSnapChange,
    handleProfileSnapStart,
    handleProfileSnapChange,
  };
};
