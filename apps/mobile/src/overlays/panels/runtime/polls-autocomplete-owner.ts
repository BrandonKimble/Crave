import React from 'react';

import { autocompleteService, type AutocompleteMatch } from '../../../services/autocomplete';
import type { Poll } from '../../../services/polls';
import { logger } from '../../../utils';

type InteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

type UsePollsAutocompleteOwnerArgs = {
  activePoll: Poll | undefined;
  needsRestaurantInput: boolean;
  needsDishInput: boolean;
  restaurantQuery: string;
  dishQuery: string;
  interactionRef?: InteractionRef;
};

type UsePollsAutocompleteOwnerResult = {
  restaurantSuggestions: AutocompleteMatch[];
  dishSuggestions: AutocompleteMatch[];
  showRestaurantSuggestions: boolean;
  showDishSuggestions: boolean;
  restaurantLoading: boolean;
  dishLoading: boolean;
  hideRestaurantSuggestions: () => void;
  hideDishSuggestions: () => void;
};

export const usePollsAutocompleteOwner = ({
  activePoll,
  needsRestaurantInput,
  needsDishInput,
  restaurantQuery,
  dishQuery,
  interactionRef,
}: UsePollsAutocompleteOwnerArgs): UsePollsAutocompleteOwnerResult => {
  const [restaurantSuggestions, setRestaurantSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [dishSuggestions, setDishSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [showRestaurantSuggestions, setShowRestaurantSuggestions] = React.useState(false);
  const [showDishSuggestions, setShowDishSuggestions] = React.useState(false);
  const [restaurantLoading, setRestaurantLoading] = React.useState(false);
  const [dishLoading, setDishLoading] = React.useState(false);

  React.useEffect(() => {
    if (!activePoll || !needsRestaurantInput) {
      setShowRestaurantSuggestions(false);
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
      return;
    }

    const trimmed = restaurantQuery.trim();
    if (trimmed.length < 2) {
      setShowRestaurantSuggestions(false);
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
      return;
    }

    if (interactionRef?.current.isInteracting) {
      return;
    }

    let isActive = true;
    setRestaurantLoading(true);
    const handle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed, { entityType: 'restaurant' })
        .then((response) => {
          if (!isActive) {
            return;
          }
          const matches = response.matches.filter((match) => match.entityType === 'restaurant');
          setRestaurantSuggestions(matches);
          setShowRestaurantSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Restaurant autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setRestaurantSuggestions([]);
          setShowRestaurantSuggestions(false);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setRestaurantLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [activePoll, interactionRef, needsRestaurantInput, restaurantQuery]);

  React.useEffect(() => {
    if (!activePoll || !needsDishInput) {
      setShowDishSuggestions(false);
      setDishSuggestions([]);
      setDishLoading(false);
      return;
    }

    const trimmed = dishQuery.trim();
    if (trimmed.length < 2) {
      setShowDishSuggestions(false);
      setDishSuggestions([]);
      setDishLoading(false);
      return;
    }

    if (interactionRef?.current.isInteracting) {
      return;
    }

    let isActive = true;
    setDishLoading(true);
    const handle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed, { entityType: 'food' })
        .then((response) => {
          if (!isActive) {
            return;
          }
          const matches = response.matches.filter((match) => match.entityType === 'food');
          setDishSuggestions(matches);
          setShowDishSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Dish autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setDishSuggestions([]);
          setShowDishSuggestions(false);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setDishLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [activePoll, dishQuery, interactionRef, needsDishInput]);

  const hideRestaurantSuggestions = React.useCallback(() => {
    setShowRestaurantSuggestions(false);
  }, []);

  const hideDishSuggestions = React.useCallback(() => {
    setShowDishSuggestions(false);
  }, []);

  return {
    restaurantSuggestions,
    dishSuggestions,
    showRestaurantSuggestions,
    showDishSuggestions,
    restaurantLoading,
    dishLoading,
    hideRestaurantSuggestions,
    hideDishSuggestions,
  };
};
