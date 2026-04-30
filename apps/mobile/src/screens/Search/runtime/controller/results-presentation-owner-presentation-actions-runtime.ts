import type { ResultsPresentationActions } from '../shared/results-presentation-shell-runtime-contract';

export const createResultsPresentationActionsRuntimeValue = ({
  requestSearchPresentationIntent,
  beginCloseSearch,
  handleCloseResults,
  cancelCloseSearch,
}: ResultsPresentationActions): ResultsPresentationActions => ({
  requestSearchPresentationIntent,
  beginCloseSearch,
  handleCloseResults,
  cancelCloseSearch,
});
