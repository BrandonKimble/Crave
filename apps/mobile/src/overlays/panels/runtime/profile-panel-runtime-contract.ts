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
  // False while the profile query is still resolving (profile === undefined). Drives the
  // identity chrome to render name/avatar/stat skeletons instead of the 'Crave Explorer'/
  // 'Pick a username'/'C'/0-count text fallbacks, which would otherwise flash on the hard-swap
  // header for the seeded-but-not-yet-loaded window.
  identityResolved: boolean;
  activeSegment: ProfileSegment;
  onOpenSettings: () => void;
  // W3 messaging (§4.4 entry 2): own-profile header → messagesInbox child push.
  onOpenMessages: () => void;
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
      error: boolean;
      emptyMessage: string;
    };

export type ProfilePanelActionsRuntime = {
  isSignedIn: boolean;
  handleOpenSettings: () => void;
  handleOpenMessages: () => void;
  handlePollPress: (poll: Poll) => void;
  handleListPress: (list: FavoriteListSummary) => void;
};
