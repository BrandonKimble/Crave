import React from 'react';

import { addPollOption, voteOnPoll } from '../../../services/polls';
import { logger } from '../../../utils';
import type { PollsFeedRuntimeController } from './polls-feed-runtime-controller';

type PollOptionPayload = {
  label: string;
  restaurantId?: string;
  dishEntityId?: string;
  restaurantName?: string;
  dishName?: string;
};

type UsePollsVoteMutationRuntimeArgs = {
  refreshPollFeed: PollsFeedRuntimeController['refreshPollFeed'];
};

export type PollsVoteMutationRuntime = {
  castVote: (pollId: string, optionId: string) => Promise<void>;
  submitPollOption: (pollId: string, payload: PollOptionPayload) => Promise<void>;
};

export const usePollsVoteMutationRuntime = ({
  refreshPollFeed,
}: UsePollsVoteMutationRuntimeArgs): PollsVoteMutationRuntime => {
  const castVote = React.useCallback(
    async (pollId: string, optionId: string) => {
      try {
        await voteOnPoll(pollId, { optionId });
        await refreshPollFeed();
      } catch (error) {
        logger.error('Vote failed', error);
      }
    },
    [refreshPollFeed]
  );

  const submitPollOption = React.useCallback(
    async (pollId: string, payload: PollOptionPayload) => {
      try {
        await addPollOption(pollId, payload);
        await refreshPollFeed({ focusPollId: pollId });
      } catch (error) {
        logger.error('Failed to add poll option', error);
      }
    },
    [refreshPollFeed]
  );

  return React.useMemo(
    () => ({
      castVote,
      submitPollOption,
    }),
    [castVote, submitPollOption]
  );
};
