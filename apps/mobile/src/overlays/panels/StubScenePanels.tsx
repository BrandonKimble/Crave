import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { X as LucideX } from 'lucide-react-native';

import { Text } from '../../components';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAccountActionsRuntime } from './runtime/use-account-actions-runtime';
import { usersService } from '../../services/users';
import { UserProfilePanelBody } from './UserProfilePanel';
import { FollowListPanelBody } from './FollowListPanel';
import { NotificationsPanelBody } from './NotificationsPanel';
import { EditProfilePanelBody } from './EditProfilePanel';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';

// ─── Stub-pass scenes (plans/page-registry.md §1) ────────────────────────────────────────────
// Placeholder mounted bodies + persistent headers for the 7 registered-but-unbuilt child
// scenes. NO real content and NO entry points yet — these exist so the scene keys are fully
// wired through the scene-stack registries (metadata, policy, descriptors, skeletons, headers)
// ahead of their real builds.

type StubSceneKey =
  | 'userProfile'
  | 'listDetail'
  | 'followList'
  | 'notifications'
  | 'settings'
  | 'editProfile'
  | 'shareConfig';

const STUB_SCENE_TITLES: Record<StubSceneKey, string> = {
  userProfile: 'Profile',
  listDetail: 'List',
  followList: 'Followers',
  notifications: 'Notifications',
  settings: 'Settings',
  editProfile: 'Edit profile',
  shareConfig: 'Share',
};

const createStubMountedSceneBody = (
  sceneKey: StubSceneKey
): React.ComponentType<MountedSceneBodyProps> => {
  const StubMountedSceneBody = React.memo((_props: MountedSceneBodyProps) => (
    <View style={styles.body} testID={`stub-scene-${sceneKey}`}>
      <Text variant="body" style={styles.bodyText}>
        {STUB_SCENE_TITLES[sceneKey]} — coming soon
      </Text>
    </View>
  ));
  StubMountedSceneBody.displayName = `StubMountedSceneBody(${sceneKey})`;
  return StubMountedSceneBody;
};

// ─── Drill-in practice bodies (S-B) — RETIRED 2026-07-10: userProfile + followList are REAL
// pages now (UserProfilePanel/FollowListPanel — live follow BE). The DrillInRow primitive
// stays for the settings rows below.

const DrillInRow = ({
  label,
  testID,
  onPress,
}: {
  label: string;
  testID: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
    style={styles.drillInRow}
  >
    <Text variant="body" weight="semibold" style={styles.bodyText}>
      {label}
    </Text>
  </Pressable>
);

// The settings SCENE owns the rows the old placeholder action-list modal held (§5.7): edit
// profile is a real child push; sign-out / replay-onboarding ride the extracted account
// actions runtime. "Sample public profile" is the drill-in practice entry into the
// userProfile ⇄ followList loop until EntityLink (S-D) wires the real ones.
const SettingsSceneBody = React.memo((_props: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  const { handleSignOut, handleReplayOnboarding, handleDeleteAccount } = useAccountActionsRuntime();
  const handleOpenMyPublicProfile = React.useCallback(() => {
    // The userProfile page is REAL now — push the signed-in user's actual profile.
    void usersService
      .getMe()
      .then((me) => {
        pushRoute('userProfile', { userId: me.userId });
      })
      .catch(() => {
        // Offline/failed: still push — the page's failure body owns the state (§5.6).
        pushRoute('userProfile', { userId: 'unknown' });
      });
  }, [pushRoute]);
  return (
    <View style={styles.body} testID="stub-scene-settings">
      <DrillInRow
        label="Edit profile"
        testID="settings-edit-profile"
        onPress={() => pushRoute('editProfile')}
      />
      <DrillInRow
        label="My public profile"
        testID="settings-sample-profile"
        onPress={handleOpenMyPublicProfile}
      />
      <DrillInRow
        label="Replay onboarding"
        testID="settings-replay-onboarding"
        onPress={() => void handleReplayOnboarding()}
      />
      <DrillInRow
        label="Sign out"
        testID="settings-sign-out"
        onPress={() => void handleSignOut()}
      />
      <DrillInRow
        label="Delete account"
        testID="settings-delete-account"
        onPress={handleDeleteAccount}
      />
    </View>
  );
});
SettingsSceneBody.displayName = 'SettingsSceneBody';

const createStubPersistentHeaderTitle = (sceneKey: StubSceneKey): React.ComponentType => {
  // Static text → synchronous first-frame render (same contract as SaveListPanel's title).
  const StubPersistentHeaderTitle = React.memo(() => (
    <View style={styles.headerTextGroup}>
      <Text
        variant="title"
        weight="semibold"
        style={styles.headerTitle}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {STUB_SCENE_TITLES[sceneKey]}
      </Text>
    </View>
  ));
  StubPersistentHeaderTitle.displayName = `StubPersistentHeaderTitle(${sceneKey})`;
  return StubPersistentHeaderTitle;
};

const createStubPersistentHeaderAction = (sceneKey: StubSceneKey): React.ComponentType => {
  // Generic child-scene close — the same closeActiveRoute action the pollDetail/pollCreation
  // persistent headers use (app-wide route controller).
  const StubPersistentHeaderAction = React.memo(() => {
    const { closeActiveRoute } = useAppOverlayRouteController();
    return (
      <Pressable
        onPress={closeActiveRoute}
        accessibilityRole="button"
        accessibilityLabel={`Close ${STUB_SCENE_TITLES[sceneKey].toLowerCase()}`}
        style={overlaySheetStyles.closeButton}
        hitSlop={8}
      >
        <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
          <LucideX size={20} color="#000000" strokeWidth={2.5} />
        </View>
      </Pressable>
    );
  });
  StubPersistentHeaderAction.displayName = `StubPersistentHeaderAction(${sceneKey})`;
  return StubPersistentHeaderAction;
};

const createStubScene = (sceneKey: StubSceneKey): React.ComponentType<MountedSceneBodyProps> => {
  // Module-scope registration (house pattern — this module is imported by the mounted-body
  // registry, so the registrations run before any stub scene can present).
  registerPersistentHeaderDescriptor(sceneKey, {
    Title: createStubPersistentHeaderTitle(sceneKey),
    Action: createStubPersistentHeaderAction(sceneKey),
  });
  return createStubMountedSceneBody(sceneKey);
};

const registerStubHeader = (sceneKey: StubSceneKey): void => {
  registerPersistentHeaderDescriptor(sceneKey, {
    Title: createStubPersistentHeaderTitle(sceneKey),
    Action: createStubPersistentHeaderAction(sceneKey),
  });
};

registerStubHeader('userProfile');
registerStubHeader('followList');
registerStubHeader('settings');
export const UserProfileMountedSceneBody = UserProfilePanelBody;
export const FollowListMountedSceneBody = FollowListPanelBody;
export const SettingsMountedSceneBody = SettingsSceneBody;
export const ListDetailMountedSceneBody = createStubScene('listDetail');
registerStubHeader('notifications');
export const NotificationsMountedSceneBody = NotificationsPanelBody;
registerStubHeader('editProfile');
export const EditProfileMountedSceneBody = EditProfilePanelBody;
export const ShareConfigMountedSceneBody = createStubScene('shareConfig');

const styles = StyleSheet.create({
  body: {
    paddingVertical: 32,
  },
  bodyText: {
    color: '#0f172a',
  },
  drillInRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
