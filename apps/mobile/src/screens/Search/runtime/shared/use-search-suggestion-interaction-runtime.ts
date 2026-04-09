import { useSuggestionInteractionController } from '../../hooks/use-suggestion-interaction-controller';

type UseSearchSuggestionInteractionRuntimeArgs = Parameters<
  typeof useSuggestionInteractionController
>[0];

export const useSearchSuggestionInteractionRuntime = (
  args: UseSearchSuggestionInteractionRuntimeArgs
) => useSuggestionInteractionController(args);
