import React from 'react';

import { usePollCreationPanelSpec } from '../../../overlays/panels/PollCreationPanel';
import type { SnapPoints } from '../../../overlays/BottomSheetWithFlashList';
import type { OverlaySheetSnap } from '../../../overlays/types';
import type { OverlayRuntimeController } from '../runtime/controller/overlay-runtime-controller';

type PollCreationParams = {
  coverageKey?: string | null;
  coverageName?: string | null;
};

type UsePollCreationPanelControllerArgs = {
  activeOverlay: string;
  pollCreationParams: PollCreationParams | undefined;
  setPollCreationSnapRequest: React.Dispatch<
    React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  >;
  overlayRuntimeController: OverlayRuntimeController;
  searchBarTop: number;
  snapPoints: SnapPoints;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  handlePollCreationSnapChange: (snap: OverlaySheetSnap) => void;
};

type UsePollCreationPanelControllerResult = {
  shouldShowPollCreationPanel: boolean;
  pollCreationPanelSpec: ReturnType<typeof usePollCreationPanelSpec>;
};

export const usePollCreationPanelController = ({
  activeOverlay,
  pollCreationParams,
  setPollCreationSnapRequest,
  overlayRuntimeController,
  searchBarTop,
  snapPoints,
  pollCreationSnapRequest,
  handlePollCreationSnapChange,
}: UsePollCreationPanelControllerArgs): UsePollCreationPanelControllerResult => {
  const shouldShowPollCreationPanel = activeOverlay === 'pollCreation';

  const handleClosePollCreation = React.useCallback(() => {
    setPollCreationSnapRequest(null);
    overlayRuntimeController.closeActiveOverlay();
  }, [overlayRuntimeController, setPollCreationSnapRequest]);

  const handlePollCreated = React.useCallback(
    (poll: { pollId: string; coverageKey?: string | null }) => {
      setPollCreationSnapRequest(null);
      overlayRuntimeController.setOverlayData('polls', {
        pollId: poll.pollId,
        coverageKey: poll.coverageKey ?? pollCreationParams?.coverageKey ?? null,
      });
      overlayRuntimeController.closeActiveOverlay();
    },
    [overlayRuntimeController, pollCreationParams?.coverageKey, setPollCreationSnapRequest]
  );

  const pollCreationPanelSpec = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    coverageKey: pollCreationParams?.coverageKey ?? null,
    coverageName: pollCreationParams?.coverageName ?? null,
    searchBarTop,
    snapPoints,
    snapTo: pollCreationSnapRequest,
    onClose: handleClosePollCreation,
    onCreated: handlePollCreated,
    onSnapChange: handlePollCreationSnapChange,
  });

  return { shouldShowPollCreationPanel, pollCreationPanelSpec };
};
