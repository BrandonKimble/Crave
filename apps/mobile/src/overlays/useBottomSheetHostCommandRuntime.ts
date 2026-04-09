import React from 'react';

import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import type { BottomSheetMotionCommand } from './bottomSheetMotionTypes';
import type { BottomSheetHostCommandRuntimeArgs } from './bottomSheetHostRuntimeContract';

export const useBottomSheetHostCommandRuntime = ({
  runtime,
}: BottomSheetHostCommandRuntimeArgs): BottomSheetMotionCommand | null => {
  const { snapController } = runtime;
  const [sheetCommand, setSheetCommand] = React.useState<BottomSheetMotionCommand | null>(
    snapController.motionCommand.value
  );

  useAnimatedReaction(
    () => snapController.motionCommand.value?.token ?? null,
    (token, previousToken) => {
      if (token == null || token === previousToken || !snapController.motionCommand.value) {
        return;
      }
      runOnJS(setSheetCommand)(snapController.motionCommand.value);
    },
    [snapController.motionCommand]
  );

  return sheetCommand;
};
