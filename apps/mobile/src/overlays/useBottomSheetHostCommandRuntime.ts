import React from 'react';

import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import type { BottomSheetMotionCommand } from './bottomSheetMotionTypes';
import type { BottomSheetHostCommandRuntimeArgs } from './bottomSheetHostRuntimeContract';

export const useBottomSheetHostCommandRuntime = ({
  runtime,
}: BottomSheetHostCommandRuntimeArgs): BottomSheetMotionCommand | null => {
  const { snapController } = runtime;
  const [sheetCommand, setSheetCommand] = React.useState<BottomSheetMotionCommand | null>(null);

  useAnimatedReaction(
    () => snapController.motionCommand.value,
    (nextCommand, previousCommand) => {
      const nextToken = nextCommand?.token ?? null;
      const previousToken = previousCommand?.token ?? null;
      if (nextToken === previousToken) {
        return;
      }
      runOnJS(setSheetCommand)(nextCommand ?? null);
    },
    [setSheetCommand, snapController.motionCommand]
  );

  return sheetCommand;
};
