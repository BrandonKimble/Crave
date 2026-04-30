import type {
  SearchOverlaySuggestionShellLayoutHostAuthority,
} from './search-root-host-authority-contract';
import type { SearchForegroundSuggestionLayoutInputs } from './search-foreground-chrome-contract';
import { useSnapshotAuthority } from './use-snapshot-authority';

export const useSearchRootOverlaySuggestionShellLayoutAuthorityRuntime = (
  suggestionShellLayoutRuntime: SearchForegroundSuggestionLayoutInputs
): SearchOverlaySuggestionShellLayoutHostAuthority =>
  useSnapshotAuthority(suggestionShellLayoutRuntime);
