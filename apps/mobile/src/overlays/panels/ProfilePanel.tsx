import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useBottomSheetSceneStackBodyRenderActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useSearchOverlayProfilerRender } from '../SearchOverlayProfilerContext';
import { FrostCutout } from '../SceneBodyFoundationSurface';
import { ChromeTitleText } from '../ChromeTitleText';
import { CutoutSkeletonShape, SceneLoadingSurface } from '../../components/skeletons';
import { useProfilePanelBodyModelRuntime } from './runtime/profile-panel-body-model-runtime';
import { PageBodyShell } from '../PageBodyShell';
import type { PageStaticBodySpec } from '../page-body-contract';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import { resolveSceneLoadingMaterial } from '../../navigation/runtime/scene-foundation-spec';
import { ProfileSectionsBody, type ProfileSectionKey } from './ProfileSectionsBody';
import type { ProfileSceneHeaderProps } from './runtime/profile-panel-runtime-contract';

// ─── Profile TAB — the ROOT own-profile page ───────────────────────────────────────────────────
// Unified with the userProfile CHILD page (UserProfilePanel): the FOUR-section body
// (Polls / Comments / Lists / Photos) is the SHARED ProfileSectionsBody, rendered here with
// isOwnProfile. The root keeps only its own chrome — the identity header (avatar / name / inbox +
// settings) and the metrics FrostCutout (frost-through stats) — while the sections, list curation
// (pin / share / delete) and the "Add photos" entry all come from the one shared machine.

// Non-null by construction: 'profile' has a foundation row.
const PROFILE_LOADING_MATERIAL = resolveSceneLoadingMaterial('profile')!;

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
  onOpenFollowList: (mode: 'followers' | 'following') => void;
};

// Followers/Following are TAPPABLE (→ followList child push, same as UserProfilePanel's
// StatCells); the poll counts are plain readouts.
const PROFILE_STATS: ReadonlyArray<{
  label: string;
  followMode?: 'followers' | 'following';
}> = [
  { label: 'Polls created' },
  { label: 'Polls contributed' },
  { label: 'Followers', followMode: 'followers' },
  { label: 'Following', followMode: 'following' },
];

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
    onOpenFollowList,
  }: ProfileIdentityChromeProps) => {
    const statValues = [pollsCreatedCount, pollsContributedCount, followersCount, followingCount];
    return (
      <>
        <View style={styles.header}>
          <View style={styles.avatarWrapper}>
            {!identityResolved ? (
              // Profile still loading — pulse a circle so the seeded header doesn't flash the
              // 'C' initials fallback before the real avatar/initials resolve.
              <CutoutSkeletonShape width={64} height={64} borderRadius={32} />
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
                <CutoutSkeletonShape width={160} height={20} style={styles.identitySkeletonName} />
                <CutoutSkeletonShape width={100} height={12} style={styles.identitySkeletonUsername} />
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
          {PROFILE_STATS.map(({ label, followMode }, index) => {
            const statContent = (
              <>
                {!identityResolved ? (
                  <CutoutSkeletonShape width={28} height={18} style={styles.identitySkeletonStat} />
                ) : (
                  <Text variant="subtitle" weight="bold" style={styles.statValue}>
                    {statValues[index]}
                  </Text>
                )}
                <Text variant="caption" style={styles.statLabel}>
                  {label}
                </Text>
              </>
            );
            return followMode != null ? (
              <Pressable
                key={label}
                style={styles.statBlock}
                onPress={() => onOpenFollowList(followMode)}
                accessibilityRole="button"
                accessibilityLabel={label}
                testID={`profile-${followMode}`}
              >
                {statContent}
              </Pressable>
            ) : (
              <View key={label} style={styles.statBlock}>
                {statContent}
              </View>
            );
          })}
        </FrostCutout>
      </>
    );
  }
);

ProfileIdentityChrome.displayName = 'ProfileIdentityChrome';

const ProfileSceneListHeader = React.memo((props: ProfileSceneHeaderProps) => (
  <View style={styles.sceneListHeader}>
    <ProfileIdentityChrome {...props} />
  </View>
));

ProfileSceneListHeader.displayName = 'ProfileSceneListHeader';

type ProfileSceneBodyProps = {
  headerProps: ProfileSceneHeaderProps;
  userId: string | null;
  activeSection: ProfileSectionKey;
  onSelectSection: (section: ProfileSectionKey) => void;
  sectionsEnabled: boolean;
  sceneReady: boolean;
};

const ProfileSceneBody = React.memo(
  ({
    headerProps,
    userId,
    activeSection,
    onSelectSection,
    sectionsEnabled,
    sceneReady,
  }: ProfileSceneBodyProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const header = <ProfileSceneListHeader {...headerProps} />;
    const profiledHeader = onProfilerRender ? (
      <React.Profiler id="ProfileSceneBody:header" onRender={onProfilerRender}>
        {header}
      </React.Profiler>
    ) : (
      header
    );
    // The shared four-section machine only mounts once the scene has expanded AND the own profile
    // resolved (userId in hand) — until then the section area is the frosted skeleton, matching the
    // seeded hard-swap window (identity chrome shows its own skeletons in parallel).
    const sectionsContent =
      sceneReady && userId != null ? (
        <ProfileSectionsBody
          userId={userId}
          isOwnProfile
          enabled={sectionsEnabled}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
        />
      ) : (
        // The sections band's pending face — the ONE in-place material, from the one
        // derivation home (never a call-site rowType/frost choice).
        <SceneLoadingSurface {...PROFILE_LOADING_MATERIAL} />
      );
    const profiledSections = onProfilerRender ? (
      <React.Profiler id="ProfileSceneBody:sections" onRender={onProfilerRender}>
        {sectionsContent}
      </React.Profiler>
    ) : (
      sectionsContent
    );

    return (
      <View style={styles.contentContainer}>
        {profiledHeader}
        {profiledSections}
      </View>
    );
  }
);

ProfileSceneBody.displayName = 'ProfileSceneBody';

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
        userId={profilePanelBodyModelRuntime.userId}
        activeSection={profilePanelBodyModelRuntime.activeSection}
        onSelectSection={profilePanelBodyModelRuntime.onSelectSection}
        sectionsEnabled={profilePanelBodyModelRuntime.sectionsEnabled}
        sceneReady={sceneReady}
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

// THE PAGE L2: ONE tree, always visible — the old dual-tree (a full-body transition
// skeleton OVER a display:none prewarmed body) was skeleton owner #1 of the audit's
// three-sequential-owners handoff, and the visible swap between them WAS the owner's
// "skeleton changes midway". Now the identity chrome renders immediately (its blocks
// are L0 same-node hole shapes until identityResolved) and the sections band keeps the
// one in-place material until the machine lands (sceneReady still gates the section
// machine's mount + the data-lane subscription — activation is a STATE input, never a
// tree swap).
const ProfilePageContent = React.memo(() => {
  const { shouldSubscribeDataLane, hasActivatedExpandedContent, isActive } =
    useBottomSheetSceneStackBodyRenderActivity();
  return (
    <ProfileDataSurface
      shouldSubscribeDataLane={shouldSubscribeDataLane}
      sceneReady={hasActivatedExpandedContent}
      isActive={isActive}
    />
  );
});
ProfilePageContent.displayName = 'ProfilePageContent';

// THE DECLARATION (L2): profile is a static PageBodySpec — no page-level query edge
// (own profile always exists; band-level readiness is same-node state above). A
// page-level skeleton owner has nowhere to exist.
const PROFILE_PAGE_BODY: PageStaticBodySpec = {
  kind: 'static',
  scene: 'profile',
  Content: ProfilePageContent,
};

export const ProfileMountedSceneBody = React.memo(() => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  const mountedBody = <PageBodyShell spec={PROFILE_PAGE_BODY} />;
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
  <ChromeTitleText>Profile</ChromeTitleText>
));

ProfilePersistentHeaderTitle.displayName = 'ProfilePersistentHeaderTitle';

// Leg 6 (§4 HeaderNavAction): the profile X is DELETED — parents are non-dismissable (the
// host-owned plus sits in the seat; profile's catch-all create is OWNER-OPEN, a dev-bark stub
// in the header host until the owner rules on the create-sheet contents).
// Module-scope registration (house pattern — origin-scene-live-state-registry).
registerPersistentHeaderDescriptor('profile', {
  Title: ProfilePersistentHeaderTitle,
});

const styles = StyleSheet.create({
  contentContainer: {
    gap: 20,
  },
  sceneListHeader: {
    gap: 20,
    marginBottom: 20,
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
});
