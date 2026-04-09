import React from 'react';
import { Alert } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { Poll } from '../../../services/polls';
import { useAppOverlayRouteController } from '../../useAppOverlayRouteController';
import type { OverlayContentSpec, OverlaySheetSnap, OverlaySheetSnapRequest } from '../../types';
import type { PollsPanelSnapMeta, UsePollsPanelSpecOptions } from './polls-panel-runtime-contract';

const HEADER_ACTION_CREATE_PROGRESS_THRESHOLD = 0.98;
const HEADER_ACTION_CREATE_POSITION_EPSILON_PX = 6;

type UsePollsPanelInteractionRuntimeArgs = Pick<
  UsePollsPanelSpecOptions,
  | 'mode'
  | 'shellSnapRequest'
  | 'sheetY'
  | 'headerActionProgress'
  | 'onSnapStart'
  | 'onSnapChange'
  | 'onRequestPollCreationExpand'
  | 'onRequestReturnToSearch'
> & {
  snapPoints: UsePollsPanelSpecOptions['snapPoints'];
  headerAction: 'create' | 'close';
  coverageKey: string | null;
  coverageName: string | null;
  coverageOverride: string | null;
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

type PollsPanelInteractionRuntime = {
  activeShellSnapRequest: OverlaySheetSnapRequest | null;
  headerActionProgress: NonNullable<UsePollsPanelSpecOptions['headerActionProgress']>;
  submitOptionFromPanel: () => Promise<void>;
  onRestaurantSuggestionPick: (match: AutocompleteMatch) => void;
  onDishSuggestionPick: (match: AutocompleteMatch) => void;
  handleClose: () => void;
  handleOpenCreate: () => void;
  handleSnapChange: (snap: OverlaySheetSnap, meta?: PollsPanelSnapMeta) => void;
  handleSnapStart: NonNullable<OverlayContentSpec<Poll>['onSnapStart']>;
  handleHeaderActionPress: () => void;
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

export const usePollsPanelInteractionRuntime = ({
  mode = 'docked',
  shellSnapRequest,
  sheetY,
  headerActionProgress: headerActionProgressProp,
  onSnapStart,
  onSnapChange,
  onRequestPollCreationExpand,
  onRequestReturnToSearch,
  snapPoints,
  headerAction,
  coverageKey,
  coverageName,
  coverageOverride,
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
}: UsePollsPanelInteractionRuntimeArgs): PollsPanelInteractionRuntime => {
  const { pushRoute } = useAppOverlayRouteController();
  const snapRequestTokenRef = React.useRef(0);
  const [snapRequest, setSnapRequest] = React.useState<{
    snap: OverlaySheetSnap;
    token: number;
  } | null>(null);
  const activeShellSnapRequest = shellSnapRequest ?? snapRequest;

  React.useEffect(() => {
    if (shellSnapRequest) {
      setSnapRequest(null);
    }
  }, [shellSnapRequest]);

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

  const handleClose = React.useCallback(() => {
    snapRequestTokenRef.current += 1;
    setSnapRequest({ snap: 'collapsed', token: snapRequestTokenRef.current });
    if (mode === 'overlay') {
      onRequestReturnToSearch?.();
    }
  }, [mode, onRequestReturnToSearch]);

  const handleOpenCreate = React.useCallback(() => {
    if (!coverageKey && !coverageOverride) {
      Alert.alert('Pick a city', 'Move the map to a city before creating a poll.');
      return;
    }
    pushRoute('pollCreation', {
      coverageKey: coverageOverride ?? coverageKey ?? null,
      coverageName: coverageName ?? null,
    });
  }, [coverageKey, coverageName, coverageOverride, pushRoute]);

  const localHeaderActionProgress = useSharedValue(0);
  const headerActionProgress = headerActionProgressProp ?? localHeaderActionProgress;

  const handleSnapChange = React.useCallback(
    (snap: OverlaySheetSnap, meta?: PollsPanelSnapMeta) => {
      onSnapChange?.(snap, meta);
      if (snapRequest && snapRequest.snap === snap) {
        setSnapRequest(null);
      }
    },
    [onSnapChange, snapRequest]
  );

  const handleSnapStart = React.useCallback<NonNullable<OverlayContentSpec<Poll>['onSnapStart']>>(
    (snap, meta) => {
      onSnapStart?.(snap, meta);
    },
    [onSnapStart]
  );

  const resolveHeaderActionForPress = React.useCallback((): 'create' | 'close' => {
    if (!headerActionProgressProp) {
      return headerAction;
    }

    const isAtCollapsed =
      Math.abs(sheetY.value - (snapPoints?.collapsed ?? 0)) <=
      HEADER_ACTION_CREATE_POSITION_EPSILON_PX;
    return headerActionProgress.value >= HEADER_ACTION_CREATE_PROGRESS_THRESHOLD && isAtCollapsed
      ? 'create'
      : 'close';
  }, [headerAction, headerActionProgress, headerActionProgressProp, sheetY, snapPoints?.collapsed]);

  const handleHeaderActionPress = React.useCallback(() => {
    const action = resolveHeaderActionForPress();
    if (action === 'create') {
      onRequestPollCreationExpand?.();
      handleOpenCreate();
      return;
    }
    handleClose();
  }, [handleClose, handleOpenCreate, onRequestPollCreationExpand, resolveHeaderActionForPress]);

  return {
    activeShellSnapRequest,
    headerActionProgress,
    submitOptionFromPanel,
    onRestaurantSuggestionPick,
    onDishSuggestionPick,
    handleClose,
    handleOpenCreate,
    handleSnapChange,
    handleSnapStart,
    handleHeaderActionPress,
  };
};
