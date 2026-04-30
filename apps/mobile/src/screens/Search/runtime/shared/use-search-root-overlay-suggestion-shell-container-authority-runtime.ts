import type {
  SearchOverlaySuggestionShellContainerHostAuthority,
} from './search-root-host-authority-contract';
import type { SearchRootOverlaySuggestionShellContainerRuntime } from './use-search-root-overlay-suggestion-shell-container-runtime';
import { useSnapshotAuthority } from './use-snapshot-authority';

export const useSearchRootOverlaySuggestionShellContainerAuthorityRuntime = (
  suggestionShellContainerRuntime: SearchRootOverlaySuggestionShellContainerRuntime
): SearchOverlaySuggestionShellContainerHostAuthority =>
  useSnapshotAuthority(suggestionShellContainerRuntime);
