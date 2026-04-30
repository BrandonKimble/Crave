import type { ResultsInteractionModel } from '../shared/results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from '../shared/results-presentation-runtime-owner-contract';

type ResultsPresentationInteractionRuntimeValue = Pick<
  ResultsPresentationRuntimeOwner,
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'notifyFrostReady'
  | 'cancelToggleInteraction'
> & {
  interactionModel: ResultsInteractionModel;
};

export const createResultsPresentationInteractionRuntimeValue = ({
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  interactionModel,
}: ResultsPresentationInteractionRuntimeValue): ResultsPresentationInteractionRuntimeValue => ({
  pendingTogglePresentationIntentId,
  scheduleToggleCommit,
  notifyFrostReady,
  cancelToggleInteraction,
  interactionModel,
});
