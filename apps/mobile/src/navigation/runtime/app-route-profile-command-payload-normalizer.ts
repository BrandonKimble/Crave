import type {
  PreparedProfilePresentationCommandSet,
  PreparedProfileResultsSheetCommand,
  ProfilePresentationCommandExecutionPayload,
} from './app-route-profile-prepared-presentation-transaction-contract';

export type NativeProfilePresentationSheetCommandSet = {
  resultsSheetCommand?: PreparedProfileResultsSheetCommand;
};

export type NativeProfilePresentationSheetExecutionPayload = {
  executionContext: {
    transactionId: string | null;
    phase: 'pre_shell' | 'post_shell';
    requestToken: number | null;
  };
  commandSet: NativeProfilePresentationSheetCommandSet | null;
};

export const mapProfileNativeSheetCommandSet = (
  commandSet: ProfilePresentationCommandExecutionPayload['commandSet']
): NativeProfilePresentationSheetCommandSet | null => {
  if (!commandSet) {
    return null;
  }
  return {
    ...(commandSet.resultsSheetCommand
      ? { resultsSheetCommand: commandSet.resultsSheetCommand }
      : {}),
  };
};

export const mapProfileNativeSheetExecutionPayload = (
  payload: ProfilePresentationCommandExecutionPayload
): NativeProfilePresentationSheetExecutionPayload => ({
  executionContext: {
    ...payload.executionContext,
    phase: payload.executionContext.phase === 'pre_shell' ? 'pre_shell' : 'post_shell',
  },
  commandSet: mapProfileNativeSheetCommandSet(payload.commandSet),
});

export const stripProfileNativeSheetCommands = (
  commandSet: ProfilePresentationCommandExecutionPayload['commandSet']
): PreparedProfilePresentationCommandSet | undefined => {
  if (!commandSet) {
    return undefined;
  }
  const nextCommandSet = {
    ...commandSet,
  };
  delete nextCommandSet.resultsSheetCommand;
  return Object.keys(nextCommandSet).length > 0 ? nextCommandSet : undefined;
};
