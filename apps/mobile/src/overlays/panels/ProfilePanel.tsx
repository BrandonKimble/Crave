import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { SegmentedToggle } from '../../components/SegmentedToggle';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import type { Poll } from '../../services/polls';
import type { FavoriteListSummary } from '../../services/favorite-lists';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useBottomSheetSceneStackBodyRenderActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useSearchOverlayProfilerRender } from '../SearchOverlayProfilerContext';
import { FrostCutout } from '../SceneBodyFoundationSurface';
import { SceneLoadingSurface, SkeletonBox } from '../../components/skeletons';
import type { ProfileSegment } from './profileSceneQueryOptions';
import { useProfilePanelBodyModelRuntime } from './runtime/profile-panel-body-model-runtime';
import { getCraveScoreColorFromScore } from '../../utils/quality-color';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import type {
  ProfileSceneHeaderProps,
  ProfileSceneRow,
} from './runtime/profile-panel-runtime-contract';

const PROFILE_SEGMENT_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'contributed', label: 'Contributed' },
  { value: 'favorites', label: 'Favorites' },
] as const satisfies readonly { value: ProfileSegment; label: string }[];

type ProfilePreviewRowProps = {
  item: FavoriteListSummary['previewItems'][number];
};

const ProfilePreviewRow = React.memo(({ item }: ProfilePreviewRowProps) => (
  <View style={styles.previewRow}>
    <View
      style={[styles.previewDot, { backgroundColor: getCraveScoreColorFromScore(item.craveScore) }]}
    />
    <Text variant="caption" numberOfLines={1} style={styles.previewText}>
      {item.label}
      {item.subLabel ? ` • ${item.subLabel}` : ''}
    </Text>
  </View>
));

ProfilePreviewRow.displayName = 'ProfilePreviewRow';

type ProfileFavoriteListTileProps = {
  list: FavoriteListSummary;
  onPress: (list: FavoriteListSummary) => void;
};

const ProfileFavoriteListTile = React.memo(({ list, onPress }: ProfileFavoriteListTileProps) => (
  <Pressable onPress={() => onPress(list)} style={styles.listTileWrapper}>
    <View style={styles.listTile}>
      {list.previewItems.length ? (
        list.previewItems.map((item) => <ProfilePreviewRow key={item.itemId} item={item} />)
      ) : (
        <Text variant="caption" style={styles.previewEmpty}>
          No items yet
        </Text>
      )}
    </View>
    <Text variant="body" weight="semibold" style={styles.listTitle} numberOfLines={1}>
      {list.name}
    </Text>
  </Pressable>
));

ProfileFavoriteListTile.displayName = 'ProfileFavoriteListTile';

type ProfilePollCardProps = {
  poll: Poll;
  onPress: (poll: Poll) => void;
};

const ProfilePollCard = React.memo(({ poll, onPress }: ProfilePollCardProps) => {
  const commentCount = poll.commentCount ?? 0;
  const endorserCount = poll.endorserCount ?? 0;

  return (
    <Pressable style={styles.pollCard} onPress={() => onPress(poll)}>
      <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
        {poll.question}
      </Text>
      {poll.topic?.description ? (
        <Text variant="body" style={styles.pollDescription}>
          {poll.topic.description}
        </Text>
      ) : null}
      <Text variant="caption" style={styles.pollMeta}>
        {[
          poll.marketName,
          `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`,
          `${endorserCount} ${endorserCount === 1 ? 'endorser' : 'endorsers'}`,
        ]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .join(' · ')}
      </Text>
    </Pressable>
  );
});

ProfilePollCard.displayName = 'ProfilePollCard';

type ProfileIdentityChromeProps = {
  avatarUrl?: string | null;
  initials: string;
  displayName: string;
  usernameLabel: string;
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  identityResolved: boolean;
  onOpenSettings: () => void;
  onOpenMessages: () => void;
};

const PROFILE_STAT_LABELS = ['Polls created', 'Polls contributed', 'Followers', 'Following'];

const ProfileIdentityChrome = React.memo(
  ({
    avatarUrl,
    initials,
    displayName,
    usernameLabel,
    pollsCreatedCount,
    pollsContributedCount,
    followersCount,
    followingCount,
    identityResolved,
    onOpenSettings,
    onOpenMessages,
  }: ProfileIdentityChromeProps) => {
    const statValues = [pollsCreatedCount, pollsContributedCount, followersCount, followingCount];
    return (
      <>
        <View style={styles.header}>
          <View style={styles.avatarWrapper}>
            {!identityResolved ? (
              // Profile still loading — pulse a circle so the seeded header doesn't flash the
              // 'C' initials fallback before the real avatar/initials resolve.
              <SkeletonBox width="100%" height={64} borderRadius={32} />
            ) : (
              <MonogramAvatar
                seed={usernameLabel}
                avatarUrl={avatarUrl}
                title={initials}
                monogram={initials}
                size={64}
                textVariant="title"
              />
            )}
          </View>
          <View style={styles.headerText}>
            {!identityResolved ? (
              <>
                <SkeletonBox width={160} height={20} style={styles.identitySkeletonName} />
                <SkeletonBox width={100} height={12} style={styles.identitySkeletonUsername} />
              </>
            ) : (
              <>
                <Text variant="title" weight="bold" style={styles.displayName}>
                  {displayName}
                </Text>
                <Text variant="caption" style={styles.username}>
                  {usernameLabel}
                </Text>
              </>
            )}
          </View>
          {/* W3 messaging (§4.4 entry 2): own-profile header → inbox. */}
          <Pressable
            style={styles.settingsButton}
            onPress={onOpenMessages}
            accessibilityRole="button"
            accessibilityLabel="Messages"
            testID="profile-open-messages"
          >
            <Feather name="message-circle" size={20} color={themeColors.primary} />
          </Pressable>
          <Pressable
            style={styles.settingsButton}
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Profile settings"
          >
            <Feather name="settings" size={20} color={themeColors.primary} />
          </Pressable>
        </View>

        {/* Foundation cutout (first consumer): the metrics box is a HOLE in the scene's white
            layer — the shared frost shows through as its background (no opaque bg of its own). */}
        <FrostCutout borderRadius={16} style={styles.statsRow}>
          {PROFILE_STAT_LABELS.map((label, index) => (
            <View key={label} style={styles.statBlock}>
              {!identityResolved ? (
                <SkeletonBox width={28} height={18} style={styles.identitySkeletonStat} />
              ) : (
                <Text variant="subtitle" weight="bold" style={styles.statValue}>
                  {statValues[index]}
                </Text>
              )}
              <Text variant="caption" style={styles.statLabel}>
                {label}
              </Text>
            </View>
          ))}
        </FrostCutout>
      </>
    );
  }
);

ProfileIdentityChrome.displayName = 'ProfileIdentityChrome';

type ProfileSegmentSwitcherProps = {
  activeSegment: ProfileSegment;
  onSelectSegment: (segment: ProfileSegment) => void;
};

const ProfileSegmentSwitcher = React.memo(
  ({ activeSegment, onSelectSegment }: ProfileSegmentSwitcherProps) => (
    <View style={styles.segmentRow}>
      <SegmentedToggle
        options={PROFILE_SEGMENT_OPTIONS}
        value={activeSegment}
        onChange={onSelectSegment}
        accessibilityLabel="Switch profile section"
        testID="profile-segment-toggle"
      />
    </View>
  )
);

ProfileSegmentSwitcher.displayName = 'ProfileSegmentSwitcher';

type ProfileFavoriteListsSectionRowProps = {
  title: string;
  lists: readonly FavoriteListSummary[];
  loading: boolean;
  error: boolean;
  emptyMessage: string;
  onListPress: (list: FavoriteListSummary) => void;
};

const ProfileFavoriteListsSectionRow = React.memo(
  ({
    title,
    lists,
    loading,
    error,
    emptyMessage,
    onListPress,
  }: ProfileFavoriteListsSectionRowProps) => (
    <View style={styles.section}>
      <Text variant="subtitle" weight="semibold" style={styles.sectionTitle}>
        {title}
      </Text>
      {loading ? (
        <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
      ) : lists.length ? (
        <View style={styles.listGrid}>
          {lists.map((list) => (
            <ProfileFavoriteListTile key={list.listId} list={list} onPress={onListPress} />
          ))}
        </View>
      ) : error ? (
        // A failed fetch must not claim the user has no public lists.
        <Text variant="caption" style={styles.emptyText}>
          Couldn&apos;t load lists
        </Text>
      ) : (
        <Text variant="caption" style={styles.emptyText}>
          {emptyMessage}
        </Text>
      )}
    </View>
  )
);

ProfileFavoriteListsSectionRow.displayName = 'ProfileFavoriteListsSectionRow';

const ProfileLoadingRow = React.memo(() => (
  <View style={styles.section}>
    <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
  </View>
));

ProfileLoadingRow.displayName = 'ProfileLoadingRow';

type ProfileEmptyRowProps = {
  message: string;
};

const ProfileEmptyRow = React.memo(({ message }: ProfileEmptyRowProps) => (
  <View style={styles.section}>
    <Text variant="caption" style={styles.emptyText}>
      {message}
    </Text>
  </View>
));

ProfileEmptyRow.displayName = 'ProfileEmptyRow';

const ProfileSceneListHeader = React.memo(
  ({
    avatarUrl,
    initials,
    displayName,
    usernameLabel,
    pollsCreatedCount,
    pollsContributedCount,
    followersCount,
    followingCount,
    identityResolved,
    activeSegment,
    onOpenSettings,
    onOpenMessages,
    onSelectSegment,
  }: ProfileSceneHeaderProps) => (
    <View style={styles.sceneListHeader}>
      <ProfileIdentityChrome
        avatarUrl={avatarUrl}
        initials={initials}
        displayName={displayName}
        usernameLabel={usernameLabel}
        pollsCreatedCount={pollsCreatedCount}
        pollsContributedCount={pollsContributedCount}
        followersCount={followersCount}
        followingCount={followingCount}
        identityResolved={identityResolved}
        onOpenSettings={onOpenSettings}
        onOpenMessages={onOpenMessages}
      />

      <ProfileSegmentSwitcher activeSegment={activeSegment} onSelectSegment={onSelectSegment} />
    </View>
  )
);

ProfileSceneListHeader.displayName = 'ProfileSceneListHeader';

type ProfileSceneBodyProps = {
  headerProps: ProfileSceneHeaderProps;
  rows: readonly ProfileSceneRow[];
  sceneReady: boolean;
  onPollPress: (poll: Poll) => void;
  onListPress: (list: FavoriteListSummary) => void;
};

const ProfileSceneBody = React.memo(
  ({ headerProps, rows, sceneReady, onPollPress, onListPress }: ProfileSceneBodyProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const header = <ProfileSceneListHeader {...headerProps} />;
    const profiledHeader = onProfilerRender ? (
      <React.Profiler id="ProfileSceneBody:header" onRender={onProfilerRender}>
        {header}
      </React.Profiler>
    ) : (
      header
    );
    const rowsContent = sceneReady ? (
      rows.map((row) => {
        switch (row.type) {
          case 'loading':
            return (
              <View key={row.key} style={styles.sceneRow}>
                <ProfileLoadingRow />
              </View>
            );
          case 'empty':
            return (
              <View key={row.key} style={styles.sceneRow}>
                <ProfileEmptyRow message={row.message} />
              </View>
            );
          case 'favorite-section':
            return (
              <View key={row.key} style={styles.sceneRow}>
                <ProfileFavoriteListsSectionRow
                  title={row.title}
                  lists={row.lists}
                  loading={row.loading}
                  error={row.error}
                  emptyMessage={row.emptyMessage}
                  onListPress={onListPress}
                />
              </View>
            );
          case 'poll':
            return (
              <View key={row.key} style={styles.pollRow}>
                <ProfilePollCard poll={row.poll} onPress={onPollPress} />
              </View>
            );
          default:
            return null;
        }
      })
    ) : (
      <SceneLoadingSurface rowType="restaurant" frostBacking />
    );
    const profiledRows = onProfilerRender ? (
      <React.Profiler id="ProfileSceneBody:rows" onRender={onProfilerRender}>
        {rowsContent}
      </React.Profiler>
    ) : (
      rowsContent
    );

    return (
      <View style={styles.contentContainer}>
        {profiledHeader}
        {profiledRows}
      </View>
    );
  }
);

ProfileSceneBody.displayName = 'ProfileSceneBody';

const ProfileTransitionShell = React.memo(() => (
  <View style={styles.contentContainer}>
    <SceneLoadingSurface rowType="restaurant" frostBacking />
  </View>
));

ProfileTransitionShell.displayName = 'ProfileTransitionShell';

type ProfileDataSurfaceProps = {
  shouldSubscribeDataLane: boolean;
  sceneReady: boolean;
  isActive: boolean;
};

const ProfileDataSurface = React.memo(
  ({ shouldSubscribeDataLane, sceneReady, isActive }: ProfileDataSurfaceProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const profilePanelBodyModelRuntime = useProfilePanelBodyModelRuntime({
      shouldRunDataLane: shouldSubscribeDataLane,
      shouldRenderExpandedContent: sceneReady,
      isActive,
    });

    const dataSurface = (
      <ProfileSceneBody
        headerProps={profilePanelBodyModelRuntime.headerProps}
        rows={profilePanelBodyModelRuntime.rows}
        sceneReady={sceneReady}
        onPollPress={profilePanelBodyModelRuntime.actionsRuntime.handlePollPress}
        onListPress={profilePanelBodyModelRuntime.actionsRuntime.handleListPress}
      />
    );

    return onProfilerRender ? (
      <React.Profiler id="ProfileDataSurface" onRender={onProfilerRender}>
        {dataSurface}
      </React.Profiler>
    ) : (
      dataSurface
    );
  }
);

ProfileDataSurface.displayName = 'ProfileDataSurface';

export const ProfileMountedSceneBody = React.memo(() => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  const { shouldSubscribeDataLane, hasActivatedExpandedContent, isActive } =
    useBottomSheetSceneStackBodyRenderActivity();

  const mountedBody = (
    <>
      {hasActivatedExpandedContent ? null : <ProfileTransitionShell />}
      <View style={hasActivatedExpandedContent ? null : styles.prewarmedMountedBodyHidden}>
        <ProfileDataSurface
          shouldSubscribeDataLane={shouldSubscribeDataLane}
          sceneReady={hasActivatedExpandedContent}
          isActive={isActive}
        />
      </View>
    </>
  );

  return onProfilerRender ? (
    <React.Profiler id="ProfileMountedSceneBody" onRender={onProfilerRender}>
      {mountedBody}
    </React.Profiler>
  ) : (
    mountedBody
  );
});

ProfileMountedSceneBody.displayName = 'ProfileMountedSceneBody';

// P3 persistent header (page-switch-master-plan.md §6-P3): the profile header CONTENT mounts
// inside the hoisted PersistentSheetHeaderHost, NOT inside this panel — the close (X) semantics
// come from the overlay route controller (reachable anywhere under the app providers). The
// grab-handle tap is the shared promote handler.
const ProfilePersistentHeaderTitle = React.memo(() => (
  <Text variant="title" weight="semibold" style={styles.sheetTitle}>
    Profile
  </Text>
));

ProfilePersistentHeaderTitle.displayName = 'ProfilePersistentHeaderTitle';

const ProfilePersistentHeaderAction = React.memo(() => {
  const { setRootRoute } = useAppOverlayRouteController();
  const localHeaderActionProgress = useSharedValue(0);

  const handleClose = React.useCallback(() => {
    setRootRoute('search');
  }, [setRootRoute]);

  return (
    <OverlayHeaderActionButton
      progress={localHeaderActionProgress}
      onPress={handleClose}
      accessibilityLabel="Close profile"
      accentColor={themeColors.primary}
      closeColor="#000000"
    />
  );
});

ProfilePersistentHeaderAction.displayName = 'ProfilePersistentHeaderAction';

// Module-scope registration (house pattern — origin-scene-live-state-registry).
registerPersistentHeaderDescriptor('profile', {
  Title: ProfilePersistentHeaderTitle,
  Action: ProfilePersistentHeaderAction,
});

const styles = StyleSheet.create({
  contentContainer: {
    gap: 20,
  },
  sceneListHeader: {
    gap: 20,
    marginBottom: 20,
  },
  sceneRow: {
    marginBottom: 20,
  },
  pollRow: {
    marginBottom: 12,
  },
  sceneRowSeparator: {
    height: 0,
  },
  sheetTitle: {
    color: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  displayName: {
    color: '#0f172a',
  },
  username: {
    color: themeColors.textBody,
    marginTop: 4,
  },
  identitySkeletonName: {
    marginTop: 4,
  },
  identitySkeletonUsername: {
    marginTop: 10,
  },
  identitySkeletonStat: {
    marginBottom: 2,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  // The metrics box is a FrostCutout: NO background — the hole in the foundation white layer
  // shows the frost through; borderRadius here only rounds the wrapper for layout parity with
  // the punched hole (radius passed to FrostCutout).
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#0f172a',
  },
  statLabel: {
    color: themeColors.textBody,
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    color: '#0f172a',
  },
  sectionSpinner: {
    marginTop: 12,
  },
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prewarmedMountedBodyHidden: {
    display: 'none',
  },
  pollCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  pollQuestion: {
    color: '#0f172a',
  },
  pollDescription: {
    color: themeColors.textBody,
    marginTop: 6,
  },
  pollMeta: {
    color: themeColors.textBody,
    marginTop: 8,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  listTileWrapper: {
    width: '48%',
  },
  listTile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    minHeight: 140,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  listTitle: {
    color: '#0f172a',
    marginTop: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewText: {
    color: '#0f172a',
    flex: 1,
  },
  previewEmpty: {
    color: themeColors.textBody,
  },
  emptyText: {
    color: themeColors.textBody,
  },
});
