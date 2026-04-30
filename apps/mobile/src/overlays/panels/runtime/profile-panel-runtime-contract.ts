import type { Poll } from '../../../services/polls';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import type { ProfileSegment } from '../profileSceneQueryOptions';

export type ProfileSceneHeaderProps = {
  avatarUrl?: string | null;
  initials: string;
  displayName: string;
  usernameLabel: string;
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  activeSegment: ProfileSegment;
  onOpenSettings: () => void;
  onSelectSegment: (segment: ProfileSegment) => void;
};

export type ProfileSceneRow =
  | {
      type: 'loading';
      key: 'loading';
    }
  | {
      type: 'empty';
      key: 'empty';
      message: string;
    }
  | {
      type: 'poll';
      key: string;
      poll: Poll;
    }
  | {
      type: 'favorite-section';
      key: string;
      title: string;
      lists: readonly FavoriteListSummary[];
      loading: boolean;
      emptyMessage: string;
    };

export type ProfilePanelActionsRuntime = {
  isSignedIn: boolean;
  handleOpenSettings: () => void;
  handlePollPress: (poll: Poll) => void;
  handleListPress: (listId: string) => void;
};
