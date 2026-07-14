import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '../../components';
import {
  announceFailureIfOnline,
  showAppModal,
  type AppModalAction,
} from '../../components/app-modal-store';
import { showShareModal } from '../../components/share-modal-store';
import {
  fetchUserComments,
  fetchUserCreatedPolls,
  type UserProfileCommentRow,
  type UserProfilePollRow,
} from '../../services/polls';
import { favoriteListsService, type FavoriteListSummary } from '../../services/favorite-lists';
import { favoriteListKeys } from '../../hooks/use-favorite-lists';
import { photosService, type FoodLogGroupDto } from '../../services/photos';
import { openPostPhotosFunnel } from '../PostPhotosFunnelHost';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import SquircleSpinner from '../../components/SquircleSpinner';

// ─── ProfileSectionsBody — THE shared segmented-page machine ────────────────
// The W3 §7.3 four-section body (Polls / Comments / Lists / Photos) rendered by
// BOTH profile surfaces: the root profile TAB (own profile, ProfilePanel) and
// the entry-keyed userProfile child page (foreign + own, UserProfilePanel).
// One implementation, two consumers — the deferred abstraction the W3 plan
// promised, triggered by the second consumer. Lists = the §8.12/§8.14/§8.15/
// §8.16 profile gallery (owner pins first, All tiles anchor the END of the
// pinned area, city grouping at 2+ cities); own profile adds the §8.14
// long-press curation modal and the §7.4 "Add photos" entry.

export type ProfileSectionKey = 'polls' | 'comments' | 'lists' | 'photos';

export const PROFILE_DEFAULT_SECTION: ProfileSectionKey = 'polls';

// Runtime guard derived from the union as the single source of truth: a Record keyed by the
// union forces a compile error HERE if a section is added without listing it (restore
// validation for the root tab's origin-scene segment publication).
const PROFILE_SECTION_LOOKUP: Record<ProfileSectionKey, true> = {
  polls: true,
  comments: true,
  lists: true,
  photos: true,
};

export const isProfileSectionKey = (value: string | null): value is ProfileSectionKey =>
  value != null && Object.prototype.hasOwnProperty.call(PROFILE_SECTION_LOOKUP, value);

const SECTIONS: Array<{ key: ProfileSectionKey; label: string }> = [
  { key: 'polls', label: 'Polls' },
  { key: 'comments', label: 'Comments' },
  { key: 'lists', label: 'Lists' },
  { key: 'photos', label: 'Photos' },
];

const SectionEmpty = ({ text, testID }: { text: string; testID: string }) => (
  <View style={styles.sectionEmpty} testID={testID}>
    <Text variant="caption" style={styles.sectionEmptyText}>
      {text}
    </Text>
  </View>
);

// Leg 6 spinner sweep: profile's section slices load under an instant page shell — inline
// squircle (the sanctioned inline/button affordance); the page-level pending state is the
// declared foundation skeleton via the shared skeleton leg.
const SectionLoading = () => (
  <View style={styles.sectionEmpty}>
    <SquircleSpinner size={18} color="#94a3b8" />
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

const ListTileRow = ({
  tile,
  onPress,
  onLongPress,
}: {
  tile: GalleryTile;
  onPress: () => void;
  /** §8.14 owner curation modal — only wired on the OWN profile's concrete lists. */
  onLongPress?: () => void;
}) => {
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
      onLongPress={onLongPress}
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

export type ProfileSectionsBodyProps = {
  userId: string;
  /** Own profile unlocks the §8.14 list long-press modal + the "Add photos" entry. */
  isOwnProfile: boolean;
  /** Gate the section queries (e.g. profile loaded + unblocked, scene expanded). */
  enabled: boolean;
  activeSection: ProfileSectionKey;
  onSelectSection: (section: ProfileSectionKey) => void;
};

export const ProfileSectionsBody = React.memo(
  ({ userId, isOwnProfile, enabled, activeSection, onSelectSection }: ProfileSectionsBodyProps) => {
    const { pushRoute } = useAppOverlayRouteController();
    const executeEntityRefAction = useEntityRefActionExecutor();
    const queryClient = useQueryClient();

    // Section data (lazy per section). Query keys are userId-scoped, so the root
    // own-profile tab and a pushed own userProfile page SHARE one cache.
    const pollsQuery = useQuery({
      queryKey: ['userProfilePolls', userId],
      enabled: enabled && activeSection === 'polls',
      staleTime: 60_000,
      queryFn: () => fetchUserCreatedPolls(userId),
    });
    const commentsQuery = useQuery({
      queryKey: ['userProfileComments', userId],
      enabled: enabled && activeSection === 'comments',
      staleTime: 60_000,
      queryFn: () => fetchUserComments(userId),
    });
    const listsQuery = useQuery({
      queryKey: ['userProfileLists', userId],
      enabled: enabled && activeSection === 'lists',
      staleTime: 60_000,
      queryFn: () => favoriteListsService.listPublic({ userId }),
    });
    const photosQuery = useQuery({
      queryKey: ['userProfileFoodLog', userId],
      enabled: enabled && activeSection === 'photos',
      staleTime: 60_000,
      queryFn: () => photosService.getUserFoodLog(userId),
    });

    // ── §8.14 owner long-press modal (Pin / Share / Delete) — OWN profile only.
    const invalidateListSurfaces = React.useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['userProfileLists', userId] });
      // The home lists surface shares the rows (pinned/share/existence changed).
      void queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    }, [queryClient, userId]);

    const handleTogglePin = React.useCallback(
      (list: FavoriteListSummary) => {
        const next = list.pinned !== true;
        // Optimistic flip in the profile-gallery cache; the refetch re-sorts
        // (server order = pins first) and is the settled truth.
        queryClient.setQueryData<FavoriteListSummary[]>(['userProfileLists', userId], (rows) =>
          rows?.map((row) => (row.listId === list.listId ? { ...row, pinned: next } : row))
        );
        favoriteListsService
          .update(list.listId, { pinned: next })
          .catch(() => {
            queryClient.setQueryData<FavoriteListSummary[]>(['userProfileLists', userId], (rows) =>
              rows?.map((row) =>
                row.listId === list.listId ? { ...row, pinned: list.pinned === true } : row
              )
            );
            announceFailureIfOnline();
          })
          .finally(() => {
            invalidateListSurfaces();
          });
      },
      [invalidateListSurfaces, queryClient, userId]
    );

    const handleShareList = React.useCallback((list: FavoriteListSummary) => {
      // W3: the universal share modal owns list sharing (its copy-link row does
      // the enableShare-on-demand this handler used to do inline).
      showShareModal({
        kind: 'list',
        id: list.listId,
        title: list.name,
        listShareSlug: list.shareEnabled ? (list.shareSlug ?? null) : null,
        // The Share action only exists on the OWN-profile long-press menu.
        listOwnedByViewer: true,
      });
    }, []);

    const handleDeleteList = React.useCallback(
      (list: FavoriteListSummary) => {
        showAppModal({
          title: 'Delete this list?',
          message: `“${list.name}” and its saves will be removed. This cannot be undone.`,
          actions: [
            { label: 'Cancel', style: 'cancel' },
            {
              label: 'Delete',
              style: 'destructive',
              testID: 'user-profile-list-delete-confirm',
              onPress: () => {
                favoriteListsService
                  .remove(list.listId)
                  .then(() => {
                    invalidateListSurfaces();
                    // Stats row (list count) lives on the profile read.
                    void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
                  })
                  .catch(() => {
                    announceFailureIfOnline();
                  });
              },
            },
          ],
        });
      },
      [invalidateListSurfaces, queryClient, userId]
    );

    const handleListLongPress = React.useCallback(
      (list: FavoriteListSummary) => {
        const actions: AppModalAction[] = [
          {
            label: list.pinned === true ? 'Unpin from profile' : 'Pin to profile',
            testID: 'user-profile-list-pin',
            onPress: () => handleTogglePin(list),
          },
          {
            label: 'Share',
            testID: 'user-profile-list-share',
            onPress: () => handleShareList(list),
          },
        ];
        // Wave-2 §2: system defaults are REGULAR lists — deletable like any other.
        actions.push({
          label: 'Delete list',
          style: 'destructive',
          testID: 'user-profile-list-delete',
          onPress: () => handleDeleteList(list),
        });
        actions.push({ label: 'Cancel', style: 'cancel' });
        showAppModal({ title: list.name, actions });
      },
      [handleDeleteList, handleShareList, handleTogglePin]
    );

    const openListTile = (tile: GalleryTile) => {
      // Wave-4 §3 (audit mouth #3, the a48e96ef-era wiring restored): profile list
      // taps route through THE policy — the listWorld composite (push + the list's
      // search world). targetUserId scopes virtual-All unions + viewer role.
      const isAll = tile.kind === 'all';
      const listType = isAll ? tile.listType : tile.list.listType;
      const listId = isAll
        ? tile.listType === 'restaurant'
          ? 'all:restaurants'
          : 'all:dishes'
        : tile.list.listId;
      const label = isAll
        ? tile.listType === 'restaurant'
          ? 'All restaurants'
          : 'All dishes'
        : tile.list.name;
      executeEntityRefAction({
        entityId: listId,
        entityType: 'list',
        label,
        listType,
        targetUserId: userId,
      });
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
                      onLongPress={
                        isOwnProfile && tile.kind === 'list'
                          ? () => handleListLongPress(tile.list)
                          : undefined
                      }
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
                        onLongPress={
                          isOwnProfile ? () => handleListLongPress(tile.list) : undefined
                        }
                      />
                    ) : null
                  )}
                </View>
              ))}
            </View>
          );
        }
        case 'photos': {
          // Red-team W2 (§7.4 own-profile entry): add-photos with NO restaurant
          // context — the post page opens in "pick a restaurant first" state.
          const addPhotosButton = isOwnProfile ? (
            <Pressable
              onPress={() => openPostPhotosFunnel({})}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
              style={styles.addPhotosButton}
              testID="user-profile-add-photos"
            >
              <Feather name="camera" size={16} color="#0f172a" />
              <Text variant="caption" weight="semibold" style={styles.addPhotosButtonText}>
                Add photos
              </Text>
            </Pressable>
          ) : null;
          const withAdd = (content: React.ReactNode): React.ReactElement => (
            <View>
              {addPhotosButton}
              {content}
            </View>
          );
          if (photosQuery.isPending) return withAdd(<SectionLoading />);
          if (photosQuery.isError) {
            return withAdd(
              <SectionEmpty
                text="Couldn’t load their photos."
                testID="user-profile-photos-failed"
              />
            );
          }
          const groups = photosQuery.data ?? [];
          if (groups.length === 0) {
            return withAdd(
              <SectionEmpty text="No photos yet." testID="user-profile-photos-empty" />
            );
          }
          return withAdd(
            groups.map((group: FoodLogGroupDto) => (
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
            ))
          );
        }
        default:
          return null;
      }
    };

    return (
      <View>
        {/* §7.3 segmented sections — crude selector, real content. */}
        <View style={styles.sectionTabs}>
          {SECTIONS.map((section) => {
            const active = activeSection === section.key;
            return (
              <Pressable
                key={section.key}
                onPress={() => onSelectSection(section.key)}
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
      </View>
    );
  }
);
ProfileSectionsBody.displayName = 'ProfileSectionsBody';

const styles = StyleSheet.create({
  sectionTabs: {
    flexDirection: 'row',
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
  addPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    marginTop: 8,
  },
  addPhotosButtonText: {
    color: '#0f172a',
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
});
