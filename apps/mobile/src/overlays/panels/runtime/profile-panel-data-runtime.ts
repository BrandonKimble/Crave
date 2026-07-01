import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useFavoriteLists } from '../../../hooks/use-favorite-lists';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import type { Poll } from '../../../services/polls';
import type { UserProfile } from '../../../services/users';
import {
  createProfileQueryOptions,
  createUserPollsQueryDescriptor,
  type ProfileSegment,
} from '../profileSceneQueryOptions';

const EMPTY_POLLS: readonly Poll[] = [];
const EMPTY_FAVORITE_LISTS: readonly FavoriteListSummary[] = [];

export type ProfilePanelDataRuntime = {
  profile: UserProfile | undefined;
  profileIsLoading: boolean;
  createdPolls: readonly Poll[];
  createdPollsIsLoading: boolean;
  contributedPolls: readonly Poll[];
  contributedPollsIsLoading: boolean;
  restaurantLists: readonly FavoriteListSummary[];
  restaurantListsIsLoading: boolean;
  restaurantListsIsError: boolean;
  dishLists: readonly FavoriteListSummary[];
  dishListsIsLoading: boolean;
  dishListsIsError: boolean;
};

export const useProfilePanelDataRuntime = ({
  activeSegment,
  dataLaneReady,
  shouldRenderExpandedContent,
}: {
  activeSegment: ProfileSegment;
  dataLaneReady: boolean;
  shouldRenderExpandedContent: boolean;
}): ProfilePanelDataRuntime => {
  const profileQuery = useQuery({
    ...createProfileQueryOptions(),
    enabled: dataLaneReady,
    subscribed: dataLaneReady,
  });
  const profile = profileQuery.data;
  const userId = profile?.userId ?? null;
  const createdPollsQueryEnabled =
    dataLaneReady && shouldRenderExpandedContent && activeSegment === 'created' && Boolean(userId);
  const contributedPollsQueryEnabled =
    dataLaneReady &&
    shouldRenderExpandedContent &&
    activeSegment === 'contributed' &&
    Boolean(userId);
  const favoriteListsQueryEnabled =
    dataLaneReady && shouldRenderExpandedContent && activeSegment === 'favorites';

  const createdPollsQuery = useQuery({
    ...createUserPollsQueryDescriptor({
      userId,
      activity: 'created',
    }),
    enabled: createdPollsQueryEnabled,
    subscribed: createdPollsQueryEnabled,
  });
  const contributedPollsQuery = useQuery({
    ...createUserPollsQueryDescriptor({
      userId,
      activity: 'participated',
    }),
    enabled: contributedPollsQueryEnabled,
    subscribed: contributedPollsQueryEnabled,
  });

  const restaurantListsQuery = useFavoriteLists({
    listType: 'restaurant',
    visibility: 'public',
    enabled: favoriteListsQueryEnabled,
    subscribed: favoriteListsQueryEnabled,
  });
  const dishListsQuery = useFavoriteLists({
    listType: 'dish',
    visibility: 'public',
    enabled: favoriteListsQueryEnabled,
    subscribed: favoriteListsQueryEnabled,
  });

  const contributedPollsSource = contributedPollsQuery.data?.polls ?? EMPTY_POLLS;
  const contributedPolls = React.useMemo(
    () =>
      userId == null
        ? contributedPollsSource
        : contributedPollsSource.filter((poll) => poll.createdByUserId !== userId),
    [contributedPollsSource, userId]
  );

  const restaurantLists = restaurantListsQuery.data ?? EMPTY_FAVORITE_LISTS;
  const dishLists = dishListsQuery.data ?? EMPTY_FAVORITE_LISTS;

  return {
    profile,
    profileIsLoading: profileQuery.isLoading,
    createdPolls: createdPollsQuery.data?.polls ?? EMPTY_POLLS,
    createdPollsIsLoading: createdPollsQuery.isLoading,
    contributedPolls,
    contributedPollsIsLoading: contributedPollsQuery.isLoading,
    restaurantLists,
    // While the favorites query is gated off (favoriteListsQueryEnabled false → React Query
    // reports isLoading=false even though no fetch has run yet) or the fetch is in flight with
    // no data, treat the section as LOADING so it shows the spinner instead of flashing the
    // 'No public … lists yet' empty message. The empty message is only correct once the query
    // RESOLVES empty. Mirrors SaveListPanel's isListsLoading gate.
    restaurantListsIsLoading:
      !favoriteListsQueryEnabled || (restaurantListsQuery.isLoading && restaurantLists.length === 0),
    restaurantListsIsError: restaurantListsQuery.isError && restaurantLists.length === 0,
    dishLists,
    dishListsIsLoading:
      !favoriteListsQueryEnabled || (dishListsQuery.isLoading && dishLists.length === 0),
    dishListsIsError: dishListsQuery.isError && dishLists.length === 0,
  };
};
