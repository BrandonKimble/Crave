import React from 'react';

import type { UserProfile } from '../../../services/users';
import type { ProfileSegment } from '../profileSceneQueryOptions';
import type { ProfileSceneHeaderProps } from './profile-panel-runtime-contract';

export const useProfilePanelIdentityRuntime = ({
  activeSegment,
  onOpenSettings,
  onSelectSegment,
  profile,
}: {
  activeSegment: ProfileSegment;
  onOpenSettings: () => void;
  onSelectSegment: (segment: ProfileSegment) => void;
  profile: UserProfile | undefined;
}): ProfileSceneHeaderProps => {
  const displayName = profile?.displayName?.trim() || profile?.username || 'Crave Explorer';
  const usernameLabel = profile?.username ? `@${profile.username}` : 'Pick a username';
  const initials = React.useMemo(() => {
    const base = profile?.displayName || profile?.username || profile?.email || 'You';
    const cleaned = base.replace('@', '').trim();
    if (!cleaned) {
      return 'C';
    }
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return cleaned[0].toUpperCase();
  }, [profile?.displayName, profile?.email, profile?.username]);
  const stats = profile?.stats;

  return React.useMemo(
    () => ({
      avatarUrl: profile?.avatarUrl,
      initials,
      displayName,
      usernameLabel,
      pollsCreatedCount: stats?.pollsCreatedCount ?? 0,
      pollsContributedCount: stats?.pollsContributedCount ?? 0,
      followersCount: stats?.followersCount ?? 0,
      followingCount: stats?.followingCount ?? 0,
      activeSegment,
      onOpenSettings,
      onSelectSegment,
    }),
    [
      activeSegment,
      displayName,
      initials,
      onOpenSettings,
      onSelectSegment,
      profile?.avatarUrl,
      stats?.followersCount,
      stats?.followingCount,
      stats?.pollsContributedCount,
      stats?.pollsCreatedCount,
      usernameLabel,
    ]
  );
};
