import React from 'react';
import { Alert } from 'react-native';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { Poll } from '../../../services/polls';

type UsePollsPanelComposerSubmitRuntimeArgs = {
  activePoll: Poll | undefined;
  activePollType: string;
  selectedPollId: string | null;
  restaurantQuery: string;
  setRestaurantQuery: React.Dispatch<React.SetStateAction<string>>;
  dishQuery: string;
  setDishQuery: React.Dispatch<React.SetStateAction<string>>;
  restaurantSelection: AutocompleteMatch | null;
  setRestaurantSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  dishSelection: AutocompleteMatch | null;
  setDishSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  needsRestaurantInput: boolean;
  needsDishInput: boolean;
  hideRestaurantSuggestions: () => void;
  hideDishSuggestions: () => void;
  submitPollOption: (
    pollId: string,
    payload: {
      label: string;
      restaurantId?: string;
      dishEntityId?: string;
      restaurantName?: string;
      dishName?: string;
    }
  ) => Promise<void>;
};

export type PollsPanelComposerSubmitRuntime = {
  submitOptionFromPanel: () => Promise<void>;
  onRestaurantSuggestionPick: (match: AutocompleteMatch) => void;
  onDishSuggestionPick: (match: AutocompleteMatch) => void;
};

const buildOptionPayload = ({
  activePoll,
  activePollType,
  restaurantLabel,
  dishLabel,
  needsRestaurantInput,
  needsDishInput,
  restaurantSelection,
  dishSelection,
}: {
  activePoll: Poll;
  activePollType: string;
  restaurantLabel: string;
  dishLabel: string;
  needsRestaurantInput: boolean;
  needsDishInput: boolean;
  restaurantSelection: AutocompleteMatch | null;
  dishSelection: AutocompleteMatch | null;
}) => {
  const targetRestaurantId = activePoll.topic?.targetRestaurantId ?? null;
  let label = '';

  if (activePollType === 'best_dish_attribute') {
    label = dishLabel && restaurantLabel ? `${dishLabel} @ ${restaurantLabel}` : dishLabel;
  } else if (activePollType === 'what_to_order') {
    label = dishLabel || activePoll.question;
  } else {
    label = restaurantLabel || activePoll.question;
  }

  const payload: {
    label: string;
    restaurantId?: string;
    dishEntityId?: string;
    restaurantName?: string;
    dishName?: string;
  } = {
    label: label.trim() || 'Poll option',
  };

  if (activePollType === 'what_to_order' && targetRestaurantId) {
    payload.restaurantId = targetRestaurantId;
  } else if (needsRestaurantInput) {
    if (restaurantSelection?.entityId) {
      payload.restaurantId = restaurantSelection.entityId;
    } else if (restaurantLabel) {
      payload.restaurantName = restaurantLabel;
    }
  }

  if (needsDishInput) {
    if (dishSelection?.entityId) {
      payload.dishEntityId = dishSelection.entityId;
    } else if (dishLabel) {
      payload.dishName = dishLabel;
    }
  }

  return payload;
};

export const usePollsPanelComposerSubmitRuntime = ({
  activePoll,
  activePollType,
  selectedPollId,
  restaurantQuery,
  setRestaurantQuery,
  dishQuery,
  setDishQuery,
  restaurantSelection,
  setRestaurantSelection,
  dishSelection,
  setDishSelection,
  needsRestaurantInput,
  needsDishInput,
  hideRestaurantSuggestions,
  hideDishSuggestions,
  submitPollOption,
}: UsePollsPanelComposerSubmitRuntimeArgs): PollsPanelComposerSubmitRuntime => {
  const resetOptionComposer = React.useCallback(() => {
    setRestaurantQuery('');
    setDishQuery('');
    setRestaurantSelection(null);
    setDishSelection(null);
    hideRestaurantSuggestions();
    hideDishSuggestions();
  }, [
    hideDishSuggestions,
    hideRestaurantSuggestions,
    setDishQuery,
    setDishSelection,
    setRestaurantQuery,
    setRestaurantSelection,
  ]);

  const submitOptionFromPanel = React.useCallback(async () => {
    if (!selectedPollId || !activePoll) {
      return;
    }

    const restaurantLabel = restaurantSelection?.name ?? restaurantQuery.trim();
    const dishLabel = dishSelection?.name ?? dishQuery.trim();

    if (needsRestaurantInput && !restaurantLabel) {
      Alert.alert('Select a restaurant', 'Pick a restaurant before adding your vote.');
      return;
    }

    if (needsDishInput && !dishLabel) {
      Alert.alert('Select a dish', 'Pick a dish before adding your vote.');
      return;
    }

    const payload = buildOptionPayload({
      activePoll,
      activePollType,
      restaurantLabel,
      dishLabel,
      needsRestaurantInput,
      needsDishInput,
      restaurantSelection,
      dishSelection,
    });

    await submitPollOption(selectedPollId, payload);
    resetOptionComposer();
  }, [
    activePoll,
    activePollType,
    dishQuery,
    dishSelection,
    needsDishInput,
    needsRestaurantInput,
    resetOptionComposer,
    restaurantQuery,
    restaurantSelection,
    selectedPollId,
    submitPollOption,
  ]);

  const onRestaurantSuggestionPick = React.useCallback(
    (match: AutocompleteMatch) => {
      setRestaurantQuery(match.name);
      setRestaurantSelection(match);
      hideRestaurantSuggestions();
    },
    [hideRestaurantSuggestions, setRestaurantQuery, setRestaurantSelection]
  );

  const onDishSuggestionPick = React.useCallback(
    (match: AutocompleteMatch) => {
      setDishQuery(match.name);
      setDishSelection(match);
      hideDishSuggestions();
    },
    [hideDishSuggestions, setDishQuery, setDishSelection]
  );

  return React.useMemo(
    () => ({
      submitOptionFromPanel,
      onRestaurantSuggestionPick,
      onDishSuggestionPick,
    }),
    [onDishSuggestionPick, onRestaurantSuggestionPick, submitOptionFromPanel]
  );
};
