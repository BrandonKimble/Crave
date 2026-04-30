import React from 'react';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { Poll } from '../../../services/polls';
import type { PollsPanelInteractionRef } from './polls-panel-runtime-contract';
import { usePollsAutocompleteOwner } from './polls-autocomplete-owner';

type UsePollsPanelComposerRuntimeArgs = {
  activePoll: Poll | undefined;
  interactionRef: PollsPanelInteractionRef | undefined;
  needsDishInput: boolean;
  needsRestaurantInput: boolean;
  selectedPollId: string | null;
};

export type PollsPanelComposerRuntime = {
  dishLoading: boolean;
  dishQuery: string;
  dishSelection: AutocompleteMatch | null;
  dishSuggestions: AutocompleteMatch[];
  hideDishSuggestions: () => void;
  hideRestaurantSuggestions: () => void;
  restaurantLoading: boolean;
  restaurantQuery: string;
  restaurantSelection: AutocompleteMatch | null;
  restaurantSuggestions: AutocompleteMatch[];
  setDishQuery: React.Dispatch<React.SetStateAction<string>>;
  setDishSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  setRestaurantQuery: React.Dispatch<React.SetStateAction<string>>;
  setRestaurantSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  showDishSuggestions: boolean;
  showRestaurantSuggestions: boolean;
};

export const usePollsPanelComposerRuntime = ({
  activePoll,
  interactionRef,
  needsDishInput,
  needsRestaurantInput,
  selectedPollId,
}: UsePollsPanelComposerRuntimeArgs): PollsPanelComposerRuntime => {
  const [restaurantQuery, setRestaurantQuery] = React.useState('');
  const [dishQuery, setDishQuery] = React.useState('');
  const [restaurantSelection, setRestaurantSelection] = React.useState<AutocompleteMatch | null>(
    null
  );
  const [dishSelection, setDishSelection] = React.useState<AutocompleteMatch | null>(null);

  const {
    restaurantSuggestions,
    dishSuggestions,
    showRestaurantSuggestions,
    showDishSuggestions,
    restaurantLoading,
    dishLoading,
    hideRestaurantSuggestions,
    hideDishSuggestions,
  } = usePollsAutocompleteOwner({
    activePoll,
    needsRestaurantInput,
    needsDishInput,
    restaurantQuery,
    dishQuery,
    interactionRef,
  });

  React.useEffect(() => {
    setRestaurantQuery('');
    setDishQuery('');
    setRestaurantSelection(null);
    setDishSelection(null);
    hideRestaurantSuggestions();
    hideDishSuggestions();
  }, [hideDishSuggestions, hideRestaurantSuggestions, selectedPollId]);

  return React.useMemo(
    () => ({
      dishLoading,
      dishQuery,
      dishSelection,
      dishSuggestions,
      hideDishSuggestions,
      hideRestaurantSuggestions,
      restaurantLoading,
      restaurantQuery,
      restaurantSelection,
      restaurantSuggestions,
      setDishQuery,
      setDishSelection,
      setRestaurantQuery,
      setRestaurantSelection,
      showDishSuggestions,
      showRestaurantSuggestions,
    }),
    [
      dishLoading,
      dishQuery,
      dishSelection,
      dishSuggestions,
      hideDishSuggestions,
      hideRestaurantSuggestions,
      restaurantLoading,
      restaurantQuery,
      restaurantSelection,
      restaurantSuggestions,
      showDishSuggestions,
      showRestaurantSuggestions,
    ]
  );
};
