import { NativeModules, Platform } from 'react-native';

import type { ProfilePresentationCommandExecutionPayload } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transaction-contract';
import {
  mapProfileNativeSheetExecutionPayload,
  stripProfileNativeSheetCommands,
  type NativeProfilePresentationSheetExecutionPayload,
} from '../../../../navigation/runtime/app-route-profile-command-payload-normalizer';

const PRESENTATION_COMMAND_EXECUTOR_MODULE_NAME = 'PresentationCommandExecutor';

type PresentationCommandExecutorNativeModule = {
  sheetCommandExecutionAvailable?: boolean;
  executeSheetCommands: (payload: NativeProfilePresentationSheetExecutionPayload) => Promise<void>;
};

const profilePresentationNativeModule = (
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules as Record<string, unknown>)[PRESENTATION_COMMAND_EXECUTOR_MODULE_NAME]
    : null
) as PresentationCommandExecutorNativeModule | null;

export const executeAndStripNativeProfileSheetCommands = (
  payload: ProfilePresentationCommandExecutionPayload
): ProfilePresentationCommandExecutionPayload => {
  const sheetCommandExecutionAvailable =
    profilePresentationNativeModule?.sheetCommandExecutionAvailable === true;
  if (
    !sheetCommandExecutionAvailable ||
    !profilePresentationNativeModule ||
    !payload.commandSet ||
    !payload.commandSet.resultsSheetCommand
  ) {
    return payload;
  }
  void profilePresentationNativeModule.executeSheetCommands(
    mapProfileNativeSheetExecutionPayload(payload)
  );
  return {
    ...payload,
    commandSet: stripProfileNativeSheetCommands(payload.commandSet),
  };
};
