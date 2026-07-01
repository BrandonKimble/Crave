import React from 'react';

import type { ProfileSegment } from '../profileSceneQueryOptions';
import type { ProfilePanelDataRuntime } from './profile-panel-data-runtime';
import type { ProfileSceneRow } from './profile-panel-runtime-contract';

const areProfileSceneRowsEqual = (
  previousRows: readonly ProfileSceneRow[],
  nextRows: readonly ProfileSceneRow[]
): boolean => {
  if (previousRows === nextRows) {
    return true;
  }
  if (previousRows.length !== nextRows.length) {
    return false;
  }
  for (let index = 0; index < previousRows.length; index += 1) {
    const previousRow = previousRows[index];
    const nextRow = nextRows[index];
    if (previousRow.type !== nextRow.type || previousRow.key !== nextRow.key) {
      return false;
    }
    switch (previousRow.type) {
      case 'loading':
        break;
      case 'empty':
        if (nextRow.type !== 'empty' || previousRow.message !== nextRow.message) {
          return false;
        }
        break;
      case 'poll':
        if (nextRow.type !== 'poll' || previousRow.poll !== nextRow.poll) {
          return false;
        }
        break;
      case 'favorite-section':
        if (
          nextRow.type !== 'favorite-section' ||
          previousRow.title !== nextRow.title ||
          previousRow.lists !== nextRow.lists ||
          previousRow.loading !== nextRow.loading ||
          previousRow.error !== nextRow.error ||
          previousRow.emptyMessage !== nextRow.emptyMessage
        ) {
          return false;
        }
        break;
      default:
        return false;
    }
  }
  return true;
};

export const useProfilePanelSegmentRowsRuntime = ({
  activeSegment,
  dataRuntime,
  shouldRenderExpandedContent,
}: {
  activeSegment: ProfileSegment;
  dataRuntime: ProfilePanelDataRuntime;
  shouldRenderExpandedContent: boolean;
}): readonly ProfileSceneRow[] => {
  const rows = React.useMemo<readonly ProfileSceneRow[]>(() => {
    if (!shouldRenderExpandedContent) {
      return [{ type: 'loading', key: 'loading' }];
    }

    if (activeSegment === 'favorites') {
      return [
        {
          type: 'favorite-section',
          key: 'favorites:restaurants',
          title: 'Restaurant lists',
          lists: dataRuntime.restaurantLists,
          loading: dataRuntime.restaurantListsIsLoading,
          error: dataRuntime.restaurantListsIsError,
          emptyMessage: 'No public restaurant lists yet.',
        },
        {
          type: 'favorite-section',
          key: 'favorites:dishes',
          title: 'Dish lists',
          lists: dataRuntime.dishLists,
          loading: dataRuntime.dishListsIsLoading,
          error: dataRuntime.dishListsIsError,
          emptyMessage: 'No public dish lists yet.',
        },
      ];
    }

    const activePolls =
      activeSegment === 'created' ? dataRuntime.createdPolls : dataRuntime.contributedPolls;
    const isActivePollListLoading =
      activeSegment === 'created'
        ? dataRuntime.createdPollsIsLoading
        : dataRuntime.contributedPollsIsLoading;

    if (dataRuntime.profileIsLoading || isActivePollListLoading) {
      return [{ type: 'loading', key: 'loading' }];
    }

    if (activePolls.length === 0) {
      return [
        {
          type: 'empty',
          key: 'empty',
          message:
            activeSegment === 'created' ? 'No polls created yet.' : 'No poll contributions yet.',
        },
      ];
    }

    return activePolls.map((poll) => ({
      type: 'poll' as const,
      key: `poll:${poll.pollId}`,
      poll,
    }));
  }, [
    activeSegment,
    dataRuntime.contributedPolls,
    dataRuntime.contributedPollsIsLoading,
    dataRuntime.createdPolls,
    dataRuntime.createdPollsIsLoading,
    dataRuntime.dishLists,
    dataRuntime.dishListsIsError,
    dataRuntime.dishListsIsLoading,
    dataRuntime.profileIsLoading,
    dataRuntime.restaurantLists,
    dataRuntime.restaurantListsIsError,
    dataRuntime.restaurantListsIsLoading,
    shouldRenderExpandedContent,
  ]);
  const rowsRef = React.useRef<readonly ProfileSceneRow[]>(rows);
  if (!areProfileSceneRowsEqual(rowsRef.current, rows)) {
    rowsRef.current = rows;
  }
  return rowsRef.current;
};
