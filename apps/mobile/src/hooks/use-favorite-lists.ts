import { useQuery } from '@tanstack/react-query';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../services/favorite-lists';

export const favoriteListKeys = {
  all: ['favorite-lists'] as const,
  list: (listType?: FavoriteListType, visibility?: FavoriteListVisibility) =>
    ['favorite-lists', listType ?? 'all', visibility ?? 'all'] as const,
  detail: (listId: string) => ['favorite-list', listId] as const,
};

export const createFavoriteListsQueryOptions = ({
  listType,
  visibility,
}: {
  listType?: FavoriteListType;
  visibility?: FavoriteListVisibility;
}) => ({
  queryKey: favoriteListKeys.list(listType, visibility),
  queryFn: () => favoriteListsService.list({ listType, visibility }),
  staleTime: 1000 * 20,
});

export const useFavoriteLists = (params: {
  listType?: FavoriteListType;
  visibility?: FavoriteListVisibility;
  enabled?: boolean;
  subscribed?: boolean;
}) => {
  const enabled = params.enabled ?? true;
  const subscribed = params.subscribed ?? true;
  return useQuery<FavoriteListSummary[]>({
    ...createFavoriteListsQueryOptions(params),
    enabled,
    subscribed,
  });
};
