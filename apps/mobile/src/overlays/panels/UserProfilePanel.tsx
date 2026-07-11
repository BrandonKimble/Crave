import React from 'react';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { showAppModal } from '../../components/app-modal-store';
import { usersService, type PublicUserProfile } from '../../services/users';
import {
  fetchUserComments,
  fetchUserCreatedPolls,
  type UserProfileCommentRow,
  type UserProfilePollRow,
} from '../../services/polls';
import { favoriteListsService, type FavoriteListSummary } from '../../services/favorite-lists';
import { photosService, type FoodLogGroupDto } from '../../services/photos';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── userProfile — the REAL page body (trigger-nav pages; plans/page-registry.md) ───────────
// W3: the §7.3 dynamic single-page shape, crude — persistent identity header +
// FOUR segmented sections (Polls / Comments / Lists / Photos). Lists = the
// §8.12/§8.14/§8.15/§8.16 profile gallery: owner pins first (All tiles anchor
// the END of the pinned area), city-header grouping at 2+ cities, type badges,
// public lists only. Blocking (§8.6): the authed follow edge carries the block
// flags; either direction renders the "unavailable" body; the foreign profile
// carries a crude Block/Unblock row.

const AVATAR_SIZE = 64;

type SectionKey = 'polls' | 'comments' | 'lists' | 'photos';

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'polls', label: 'Polls' },
  { key: 'comments', label: 'Comments' },
  { key: 'lists', label: 'Lists' },
  { key: 'photos', label: 'Photos' },
];

const resolveDisplayTitle = (profile: PublicUserProfile): string =>
  profile.displayName?.trim() || profile.username?.trim() || 'Crave member';

const AvatarCircle = ({ profile }: { profile: PublicUserProfile }) => {
  const title = resolveDisplayTitle(profile);
  if (profile.avatarUrl) {
    return <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text variant="title" weight="semibold" style={styles.avatarInitial}>
        {title.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
};

const StatCell = ({
  label,
  value,
  testID,
  onPress,
}: {
  label: string;
  value: number;
  testID: string;
  onPress?: () => void;
}) => {
  const content = (
    <>
      <Text variant="title" weight="semibold" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" style={styles.statLabel}>
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.statCell} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
      style={styles.statCell}
    >
      {content}
    </Pressable>
  );
};

const SectionEmpty = ({ text, testID }: { text: string; testID: string }) => (
  <View style={styles.sectionEmpty} testID={testID}>
    <Text variant="caption" style={styles.sectionEmptyText}>
      {text}
    </Text>
  </View>
);

const SectionLoading = () => (
  <View style={styles.sectionEmpty}>
    <ActivityIndicator />
  </View>
);

// ─── Lists section (§8.12/§8.14/§8.15/§8.16) ────────────────────────────────

type ListsGallery = {
  /** Pinned area: owner pins first, All tiles anchored at the END (§8.16). */
  pinnedTiles: Array<GalleryTile>;
  /** City groups (only when 2+ distinct cities among unpinned lists), else one flat group. */
  groups: Array<{ city: string | null; tiles: GalleryTile[] }>;
};

type GalleryTile =
  | { kind: 'list'; list: FavoriteListSummary }
  | { kind: 'all'; listType: 'restaurant' | 'dish' };

const buildListsGallery = (lists: FavoriteListSummary[]): ListsGallery => {
  const pinned = lists.filter((list) => list.pinned === true);
  const unpinned = lists.filter((list) => list.pinned !== true);
  const pinnedTiles: GalleryTile[] = pinned.map((list) => ({ kind: 'list' as const, list }));
  // §8.16: the synthetic All list is furniture — pinned by default, not
  // unpinnable, one tile per side, rendered only when that side has any
  // public lists; anchored at the END of the pinned area.
  if (lists.some((list) => list.listType === 'restaurant')) {
    pinnedTiles.push({ kind: 'all', listType: 'restaurant' });
  }
  if (lists.some((list) => list.listType === 'dish')) {
    pinnedTiles.push({ kind: 'all', listType: 'dish' });
  }
  // §8.15: grouping ACTIVATES only at 2+ cities; single-city stays flat.
  const cities = new Set(unpinned.map((list) => list.city ?? null));
  if (cities.size < 2) {
    return {
      pinnedTiles,
      groups:
        unpinned.length > 0
          ? [{ city: null, tiles: unpinned.map((list) => ({ kind: 'list' as const, list })) }]
          : [],
    };
  }
  const groupsByCity = new Map<string | null, GalleryTile[]>();
  for (const list of unpinned) {
    const key = list.city ?? null;
    const tiles = groupsByCity.get(key) ?? [];
    tiles.push({ kind: 'list', list });
    groupsByCity.set(key, tiles);
  }
  const groups = [...groupsByCity.entries()]
    .map(([city, tiles]) => ({ city, tiles }))
    // Named cities alphabetical; the null bucket ("Multiple cities") last.
    .sort((a, b) => {
      if (a.city == null) return 1;
      if (b.city == null) return -1;
      return a.city.localeCompare(b.city);
    });
  return { pinnedTiles, groups };
};

const ListTileRow = ({ tile, onPress }: { tile: GalleryTile; onPress: () => void }) => {
  const isAll = tile.kind === 'all';
  const name = isAll
    ? tile.listType === 'restaurant'
      ? 'All restaurants'
      : 'All dishes'
    : tile.list.name;
  const badge =
    (isAll ? tile.listType : tile.list.listType) === 'restaurant' ? 'Restaurants' : 'Dishes';
  const count = isAll ? null : tile.list.itemCount;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open list ${name}`}
      testID={
        isAll ? `user-profile-list-all-${tile.listType}` : `user-profile-list-${tile.list.listId}`
      }
      style={styles.listTile}
    >
      <View style={styles.listTileText}>
        <Text variant="body" weight="semibold" numberOfLines={1} style={styles.listTileName}>
          {name}
        </Text>
        <Text variant="caption" style={styles.listTileMeta}>
          {badge}
          {count != null ? ` · ${count} ${count === 1 ? 'item' : 'items'}` : ''}
        </Text>
      </View>
    </Pressable>
  );
};

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live userProfile entries (the drill loop) the topmost-per-key read renders the wrong one.
export const UserProfilePanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  const queryClient = useQueryClient();
  const params =
    entry?.key === 'userProfile'
      ? (entry.params as import('../../navigation/runtime/app-overlay-route-types').OverlayRouteParamsMap['userProfile'])
      : null;
  const userId = typeof params?.userId === 'string' ? params.userId : null;

  // RT-19 (state-loss half): page data rides the query CACHE keyed by userId — the drill
  // loop's pop back to A re-renders instantly from cache instead of a spinner refetch.
  const profileQuery = useQuery({
    queryKey: ['userProfile', userId],
    enabled: userId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const [profile, edge] = await Promise.all([
        usersService.getPublicProfile(userId as string),
        usersService.getFollowEdge(userId as string),
      ]);
      return { profile, edge };
    },
  });
  const [followOverride, setFollowOverride] = React.useState<{
    forUserId: string;
    value: boolean;
  } | null>(null);
  const [followBusy, setFollowBusy] = React.useState(false);
  const [blockBusy, setBlockBusy] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<SectionKey>('polls');
  const serverFollowed = profileQuery.data?.edge.isFollowedByMe ?? false;
  React.useEffect(() => {
    if (followOverride != null && followOverride.value === serverFollowed) {
      setFollowOverride(null);
    }
  }, [followOverride, serverFollowed]);
  const isFollowedByMe =
    followOverride != null && followOverride.forUserId === userId
      ? followOverride.value
      : serverFollowed;

  const edge = profileQuery.data?.edge ?? null;
  // §8.6: either direction of block renders the unavailable body.
  const isBlockedByMe = edge?.isBlockedByMe === true;
  const hasBlockedMe = edge?.hasBlockedMe === true;
  const blockedEitherWay = isBlockedByMe || hasBlockedMe;

  // ── Section data (lazy per section; gated on a loaded, unblocked profile).
  const sectionsEnabled = userId != null && profileQuery.data != null && !blockedEitherWay;
  const pollsQuery = useQuery({
    queryKey: ['userProfilePolls', userId],
    enabled: sectionsEnabled && activeSection === 'polls',
    staleTime: 60_000,
    queryFn: () => fetchUserCreatedPolls(userId as string),
  });
  const commentsQuery = useQuery({
    queryKey: ['userProfileComments', userId],
    enabled: sectionsEnabled && activeSection === 'comments',
    staleTime: 60_000,
    queryFn: () => fetchUserComments(userId as string),
  });
  const listsQuery = useQuery({
    queryKey: ['userProfileLists', userId],
    enabled: sectionsEnabled && activeSection === 'lists',
    staleTime: 60_000,
    queryFn: () => favoriteListsService.listPublic({ userId: userId as string }),
  });
  const photosQuery = useQuery({
    queryKey: ['userProfileFoodLog', userId],
    enabled: sectionsEnabled && activeSection === 'photos',
    staleTime: 60_000,
    queryFn: () => photosService.getUserFoodLog(userId as string),
  });

  const handleToggleFollow = React.useCallback(() => {
    if (!userId || followBusy) {
      return;
    }
    const next = !isFollowedByMe;
    setFollowOverride({ forUserId: userId, value: next });
    setFollowBusy(true);
    void (next ? usersService.followUser(userId) : usersService.unfollowUser(userId))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['followList'] });
        void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      })
      .catch(() => {
        setFollowOverride({ forUserId: userId, value: !next });
      })
      .finally(() => {
        setFollowBusy(false);
      });
  }, [followBusy, isFollowedByMe, userId, queryClient]);

  const runBlockChange = React.useCallback(
    (block: boolean) => {
      if (!userId || blockBusy) {
        return;
      }
      setBlockBusy(true);
      void (block ? usersService.blockUser(userId) : usersService.unblockUser(userId))
        .then(() => {
          // The edge + every follow surface changed (block severs follows).
          void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
          void queryClient.invalidateQueries({ queryKey: ['followList'] });
        })
        .catch(() => {
          showAppModal({
            title: 'Something went wrong',
            message: 'Please try again.',
            actions: [{ label: 'OK', style: 'default' }],
          });
        })
        .finally(() => {
          setBlockBusy(false);
        });
    },
    [blockBusy, queryClient, userId]
  );

  const handleBlockPress = React.useCallback(() => {
    if (isBlockedByMe) {
      runBlockChange(false);
      return;
    }
    showAppModal({
      title: 'Block this user?',
      message:
        'They will no longer be able to follow you, and you will not see each other in follow lists.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Block',
          style: 'destructive',
          onPress: () => runBlockChange(true),
          testID: 'user-profile-block-confirm',
        },
      ],
    });
  }, [isBlockedByMe, runBlockChange]);

  const load = profileQuery.refetch;

  if (userId != null && profileQuery.isPending) {
    return (
      <View style={styles.stateBody} testID="user-profile-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (userId == null || profileQuery.isError || profileQuery.data == null) {
    return (
      <View style={styles.stateBody} testID="user-profile-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load this profile.
        </Text>
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          testID="user-profile-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const { profile } = profileQuery.data;
  const followersDelta =
    edge != null && !edge.isMe && isFollowedByMe !== serverFollowed ? (isFollowedByMe ? 1 : -1) : 0;
  const title = resolveDisplayTitle(profile);

  // §8.6: blocked-either-way = the minimal "unavailable" body (they blocked
  // me → nothing else at all; I blocked them → plus the Unblock affordance).
  if (blockedEitherWay) {
    return (
      <View style={styles.stateBody} testID="user-profile-unavailable">
        <Text variant="body" style={styles.stateText}>
          This profile is unavailable.
        </Text>
        {isBlockedByMe ? (
          <Pressable
            onPress={handleBlockPress}
            disabled={blockBusy}
            accessibilityRole="button"
            accessibilityLabel="Unblock user"
            testID="user-profile-unblock"
            style={styles.retryButton}
          >
            <Text variant="body" weight="semibold" style={styles.retryText}>
              Unblock
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const openListTile = (tile: GalleryTile) => {
    // The W1 listDetail page handles the foreign role (targetUserId scopes
    // virtual All unions; concrete public lists resolve viewer role there).
    const listId =
      tile.kind === 'all'
        ? tile.listType === 'restaurant'
          ? 'all:restaurants'
          : 'all:dishes'
        : tile.list.listId;
    pushRoute('listDetail', { listId, targetUserId: userId });
  };

  const renderSectionBody = () => {
    switch (activeSection) {
      case 'polls': {
        if (pollsQuery.isPending) return <SectionLoading />;
        const rows = pollsQuery.data ?? [];
        if (pollsQuery.isError) {
          return (
            <SectionEmpty text="Couldn’t load their polls." testID="user-profile-polls-failed" />
          );
        }
        if (rows.length === 0) {
          return <SectionEmpty text="No polls yet." testID="user-profile-polls-empty" />;
        }
        return rows.map((poll: UserProfilePollRow) => (
          <Pressable
            key={poll.pollId}
            onPress={() => pushRoute('pollDetail', { pollId: poll.pollId })}
            accessibilityRole="button"
            style={styles.rowItem}
            testID={`user-profile-poll-${poll.pollId}`}
          >
            <Text variant="body" weight="semibold" numberOfLines={2} style={styles.rowTitle}>
              {poll.topic?.title ?? 'Poll'}
            </Text>
            {poll.topic?.description ? (
              <Text variant="caption" numberOfLines={2} style={styles.rowMeta}>
                {poll.topic.description}
              </Text>
            ) : null}
          </Pressable>
        ));
      }
      case 'comments': {
        if (commentsQuery.isPending) return <SectionLoading />;
        if (commentsQuery.isError) {
          return (
            <SectionEmpty
              text="Couldn’t load their comments."
              testID="user-profile-comments-failed"
            />
          );
        }
        const rows = commentsQuery.data ?? [];
        if (rows.length === 0) {
          return <SectionEmpty text="No comments yet." testID="user-profile-comments-empty" />;
        }
        return rows.map((comment: UserProfileCommentRow) => (
          <Pressable
            key={comment.commentId}
            onPress={() =>
              pushRoute('pollDetail', {
                pollId: comment.pollId,
                commentAnchorId: comment.commentId,
              })
            }
            accessibilityRole="button"
            style={styles.rowItem}
            testID={`user-profile-comment-${comment.commentId}`}
          >
            {comment.pollTitle ? (
              <Text variant="caption" numberOfLines={1} style={styles.rowMeta}>
                on {comment.pollTitle}
              </Text>
            ) : null}
            <Text variant="body" numberOfLines={3} style={styles.rowTitle}>
              {comment.body}
            </Text>
          </Pressable>
        ));
      }
      case 'lists': {
        if (listsQuery.isPending) return <SectionLoading />;
        if (listsQuery.isError) {
          return (
            <SectionEmpty text="Couldn’t load their lists." testID="user-profile-lists-failed" />
          );
        }
        const lists = listsQuery.data ?? [];
        if (lists.length === 0) {
          return <SectionEmpty text="No public lists yet." testID="user-profile-lists-empty" />;
        }
        const gallery = buildListsGallery(lists);
        return (
          <View testID="user-profile-lists-gallery">
            {gallery.pinnedTiles.length > 0 ? (
              <View>
                <Text variant="caption" weight="semibold" style={styles.groupHeader}>
                  Pinned
                </Text>
                {gallery.pinnedTiles.map((tile) => (
                  <ListTileRow
                    key={tile.kind === 'all' ? `all-${tile.listType}` : tile.list.listId}
                    tile={tile}
                    onPress={() => openListTile(tile)}
                  />
                ))}
              </View>
            ) : null}
            {gallery.groups.map((group) => (
              <View key={group.city ?? '__multi__'}>
                {group.city !== null || gallery.groups.length > 1 ? (
                  <Text variant="caption" weight="semibold" style={styles.groupHeader}>
                    {group.city ?? 'Multiple cities'}
                  </Text>
                ) : null}
                {group.tiles.map((tile) =>
                  tile.kind === 'list' ? (
                    <ListTileRow
                      key={tile.list.listId}
                      tile={tile}
                      onPress={() => openListTile(tile)}
                    />
                  ) : null
                )}
              </View>
            ))}
          </View>
        );
      }
      case 'photos': {
        if (photosQuery.isPending) return <SectionLoading />;
        if (photosQuery.isError) {
          return (
            <SectionEmpty text="Couldn’t load their photos." testID="user-profile-photos-failed" />
          );
        }
        const groups = photosQuery.data ?? [];
        if (groups.length === 0) {
          return <SectionEmpty text="No photos yet." testID="user-profile-photos-empty" />;
        }
        return groups.map((group: FoodLogGroupDto) => (
          <View key={group.restaurantId} style={styles.foodLogGroup}>
            <Text variant="body" weight="semibold" numberOfLines={1} style={styles.rowTitle}>
              {group.restaurantName || 'Restaurant'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.foodLogStrip}
            >
              {group.photos.map((photo) => (
                <View key={photo.photoId} style={styles.foodLogCell}>
                  <Image source={{ uri: photo.urls.thumb }} style={styles.foodLogThumb} />
                  {photo.caption ? (
                    <Text variant="caption" numberOfLines={1} style={styles.foodLogCaption}>
                      {photo.caption}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ));
      }
      default:
        return null;
    }
  };

  return (
    <View style={styles.body} testID="stub-scene-userProfile">
      <View style={styles.identityRow}>
        <AvatarCircle profile={profile} />
        <View style={styles.identityText}>
          <Text
            variant="title"
            weight="semibold"
            numberOfLines={1}
            style={styles.displayName}
            testID="user-profile-user-id"
          >
            {title}
          </Text>
          {profile.username ? (
            <Text variant="caption" style={styles.username}>
              @{profile.username}
            </Text>
          ) : null}
        </View>
        {edge != null && !edge.isMe ? (
          <Pressable
            onPress={handleToggleFollow}
            disabled={followBusy}
            accessibilityRole="button"
            accessibilityLabel={isFollowedByMe ? 'Unfollow' : 'Follow'}
            testID="user-profile-follow-button"
            style={[styles.followButton, isFollowedByMe && styles.followButtonActive]}
          >
            <Text
              variant="body"
              weight="semibold"
              style={isFollowedByMe ? styles.followTextActive : styles.followText}
            >
              {isFollowedByMe ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCell
          label="Followers"
          value={profile.stats.followersCount + followersDelta}
          testID="user-profile-followers"
          onPress={() => pushRoute('followList', { userId: profile.userId, mode: 'followers' })}
        />
        <StatCell
          label="Following"
          value={profile.stats.followingCount}
          testID="user-profile-following"
          onPress={() => pushRoute('followList', { userId: profile.userId, mode: 'following' })}
        />
        <StatCell
          label="Polls"
          value={profile.stats.pollsCreatedCount}
          testID="user-profile-polls"
        />
        <StatCell
          label="Lists"
          value={profile.stats.favoriteListsCount}
          testID="user-profile-lists"
        />
      </View>

      {/* §7.3 segmented sections — crude selector, real content. */}
      <View style={styles.sectionTabs}>
        {SECTIONS.map((section) => {
          const active = activeSection === section.key;
          return (
            <Pressable
              key={section.key}
              onPress={() => setActiveSection(section.key)}
              accessibilityRole="button"
              accessibilityLabel={`${section.label} section`}
              testID={`user-profile-section-${section.key}`}
              style={[styles.sectionTab, active && styles.sectionTabActive]}
            >
              <Text
                variant="caption"
                weight="semibold"
                style={active ? styles.sectionTabTextActive : styles.sectionTabText}
              >
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionBody}>{renderSectionBody()}</View>

      {edge != null && !edge.isMe ? (
        <Pressable
          onPress={handleBlockPress}
          disabled={blockBusy}
          accessibilityRole="button"
          accessibilityLabel="Block user"
          testID="user-profile-block-row"
          style={styles.blockRow}
        >
          <Text variant="body" weight="semibold" style={styles.blockRowText}>
            Block user
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});
UserProfilePanelBody.displayName = 'UserProfilePanelBody';

const styles = StyleSheet.create({
  body: {
    paddingVertical: 24,
  },
  stateBody: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  retryText: {
    color: '#0f172a',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#f1f5f9',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#0f172a',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: '#0f172a',
  },
  username: {
    color: '#64748b',
  },
  followButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  followButtonActive: {
    backgroundColor: '#f1f5f9',
  },
  followText: {
    color: '#ffffff',
  },
  followTextActive: {
    color: '#0f172a',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: '#0f172a',
  },
  statLabel: {
    color: '#64748b',
  },
  sectionTabs: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 8,
  },
  sectionTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  sectionTabActive: {
    backgroundColor: '#0f172a',
  },
  sectionTabText: {
    color: '#0f172a',
  },
  sectionTabTextActive: {
    color: '#ffffff',
  },
  sectionBody: {
    marginTop: 12,
  },
  sectionEmpty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  sectionEmptyText: {
    color: '#64748b',
  },
  rowItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    gap: 2,
  },
  rowTitle: {
    color: '#0f172a',
  },
  rowMeta: {
    color: '#64748b',
  },
  groupHeader: {
    color: '#64748b',
    marginTop: 14,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  listTile: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  listTileText: {
    gap: 2,
  },
  listTileName: {
    color: '#0f172a',
  },
  listTileMeta: {
    color: '#64748b',
  },
  foodLogGroup: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  foodLogStrip: {
    flexGrow: 0,
  },
  foodLogCell: {
    marginRight: 8,
    width: 96,
  },
  foodLogThumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  foodLogCaption: {
    color: '#64748b',
    marginTop: 2,
  },
  blockRow: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  blockRowText: {
    color: '#dc2626',
  },
});
