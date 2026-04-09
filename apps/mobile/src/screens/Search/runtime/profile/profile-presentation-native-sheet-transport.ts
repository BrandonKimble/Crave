import { NativeModules, Platform } from 'react-native';

import type {
  PreparedProfilePresentationCommandSet,
  ProfilePresentationCommandExecutionPayload,
} from './profile-prepared-presentation-transaction-contract';

const PRESENTATION_COMMAND_EXECUTOR_MODULE_NAME = 'PresentationCommandExecutor';

type NativeProfilePresentationSheetCommandSet = {
  restaurantSheetCommand?:
    | {
        type: 'request';
        snap: 'expanded' | 'middle' | 'collapsed';
      }
    | {
        type: 'clear';
      };
  resultsSheetCommand?:
    | {
        type: 'request';
        snap: 'expanded' | 'middle' | 'collapsed' | 'hidden';
      }
    | {
        type: 'hide';
      };
};

type NativeProfilePresentationSheetExecutionPayload = {
  executionContext: {
    transactionId: string | null;
    phase: 'pre_shell' | 'post_shell';
    requestToken: number | null;
  };
  commandSet: NativeProfilePresentationSheetCommandSet | null;
};

type PresentationCommandExecutorNativeModule = {
  sheetCommandExecutionAvailable?: boolean;
  executeSheetCommands: (payload: NativeProfilePresentationSheetExecutionPayload) => Promise<void>;
};

const profilePresentationNativeModule = (
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules as Record<string, unknown>)[PRESENTATION_COMMAND_EXECUTOR_MODULE_NAME]
    : null
) as PresentationCommandExecutorNativeModule | null;

const mapNativeCommandSet = (
  commandSet: ProfilePresentationCommandExecutionPayload['commandSet']
): NativeProfilePresentationSheetCommandSet | null => {
  if (!commandSet) {
    return null;
  }
  return {
    ...(commandSet.restaurantSheetCommand
      ? { restaurantSheetCommand: commandSet.restaurantSheetCommand }
      : {}),
    ...(commandSet.resultsSheetCommand
      ? { resultsSheetCommand: commandSet.resultsSheetCommand }
      : {}),
  };
};

const mapNativeExecutionPayload = (
  payload: ProfilePresentationCommandExecutionPayload
): NativeProfilePresentationSheetExecutionPayload => ({
  executionContext: payload.executionContext,
  commandSet: mapNativeCommandSet(payload.commandSet),
});

const stripNativeSheetCommands = (
  commandSet: ProfilePresentationCommandExecutionPayload['commandSet']
): PreparedProfilePresentationCommandSet | undefined => {
  if (!commandSet) {
    return undefined;
  }
  const nextCommandSet = {
    ...commandSet,
  };
  delete nextCommandSet.restaurantSheetCommand;
  delete nextCommandSet.resultsSheetCommand;
  return Object.keys(nextCommandSet).length > 0 ? nextCommandSet : undefined;
};

export const executeAndStripNativeProfileSheetCommands = (
  payload: ProfilePresentationCommandExecutionPayload
): ProfilePresentationCommandExecutionPayload => {
  const sheetCommandExecutionAvailable =
    profilePresentationNativeModule?.sheetCommandExecutionAvailable === true;
  if (
    !sheetCommandExecutionAvailable ||
    !profilePresentationNativeModule ||
    !payload.commandSet ||
    (!payload.commandSet.restaurantSheetCommand && !payload.commandSet.resultsSheetCommand)
  ) {
    return payload;
  }
  void profilePresentationNativeModule.executeSheetCommands(mapNativeExecutionPayload(payload));
  return {
    ...payload,
    commandSet: stripNativeSheetCommands(payload.commandSet),
  };
};
