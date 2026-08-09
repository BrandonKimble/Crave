import { useQuery } from '@tanstack/react-query';
import { VIEWER_STATE_CACHE_POLICY } from '../services/query-cache-policy';
import {
  userListsService,
  type UserListSummary,
  type UserListType,
  type UserListVisibility,
} from '../services/user-lists';

export const userListKeys = {
  all: ['user-lists'] as const,
  list: (listType?: UserListType, visibility?: UserListVisibility) =>
    ['user-lists', listType ?? 'all', visibility ?? 'all'] as const,
  detail: (listId: string) => ['user-list', listId] as const,
};

export const createUserListsQueryOptions = ({
  listType,
  visibility,
}: {
  listType?: UserListType;
  visibility?: UserListVisibility;
}) => ({
  queryKey: userListKeys.list(listType, visibility),
  queryFn: () => userListsService.list({ listType, visibility }),
  ...VIEWER_STATE_CACHE_POLICY,
});

export const useUserLists = (params: {
  listType?: UserListType;
  visibility?: UserListVisibility;
  enabled?: boolean;
  subscribed?: boolean;
}) => {
  const enabled = params.enabled ?? true;
  const subscribed = params.subscribed ?? true;
  return useQuery<UserListSummary[]>({
    ...createUserListsQueryOptions(params),
    enabled,
    subscribed,
  });
};
