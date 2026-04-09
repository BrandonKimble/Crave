import useTransitionDriver from '../../../../hooks/use-transition-driver';
import type {
  SearchSuggestionTransitionPresenceRuntime,
  SearchSuggestionTransitionPresenceRuntimeArgs,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionTransitionPresenceRuntime = ({
  isSuggestionPanelActive,
  getSuggestionTransitionDurationMs,
  getSuggestionTransitionEasing,
  getSuggestionTransitionDelayMs,
}: SearchSuggestionTransitionPresenceRuntimeArgs): SearchSuggestionTransitionPresenceRuntime => {
  const { progress: suggestionProgress, isVisible: isSuggestionPanelVisible } = useTransitionDriver(
    {
      enabled: true,
      target: isSuggestionPanelActive ? 1 : 0,
      getDurationMs: getSuggestionTransitionDurationMs,
      getEasing: getSuggestionTransitionEasing,
      getDelayMs: getSuggestionTransitionDelayMs,
    }
  );

  return {
    suggestionProgress,
    isSuggestionPanelVisible,
    isSuggestionOverlayVisible: isSuggestionPanelActive || isSuggestionPanelVisible,
  };
};
