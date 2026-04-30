import type {
  SearchOverlaySuggestionShellMotionHostAuthority,
} from './search-root-host-authority-contract';
import type { SearchForegroundSuggestionMotionInputs } from './search-foreground-chrome-contract';
import { useSnapshotAuthority } from './use-snapshot-authority';

export const useSearchRootOverlaySuggestionShellMotionAuthorityRuntime = (
  suggestionShellMotionRuntime: SearchForegroundSuggestionMotionInputs
): SearchOverlaySuggestionShellMotionHostAuthority =>
  useSnapshotAuthority(suggestionShellMotionRuntime);
