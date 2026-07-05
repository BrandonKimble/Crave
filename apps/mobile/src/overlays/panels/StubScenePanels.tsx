import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { X as LucideX } from 'lucide-react-native';

import { Text } from '../../components';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';

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

const createStubMountedSceneBody = (sceneKey: StubSceneKey): React.ComponentType => {
  const StubMountedSceneBody = React.memo(() => (
    <View style={styles.body} testID={`stub-scene-${sceneKey}`}>
      <Text variant="body" style={styles.bodyText}>
        {STUB_SCENE_TITLES[sceneKey]} — coming soon
      </Text>
    </View>
  ));
  StubMountedSceneBody.displayName = `StubMountedSceneBody(${sceneKey})`;
  return StubMountedSceneBody;
};

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

const createStubScene = (sceneKey: StubSceneKey): React.ComponentType => {
  // Module-scope registration (house pattern — this module is imported by the mounted-body
  // registry, so the registrations run before any stub scene can present).
  registerPersistentHeaderDescriptor(sceneKey, {
    Title: createStubPersistentHeaderTitle(sceneKey),
    Action: createStubPersistentHeaderAction(sceneKey),
  });
  return createStubMountedSceneBody(sceneKey);
};

export const UserProfileMountedSceneBody = createStubScene('userProfile');
export const ListDetailMountedSceneBody = createStubScene('listDetail');
export const FollowListMountedSceneBody = createStubScene('followList');
export const NotificationsMountedSceneBody = createStubScene('notifications');
export const SettingsMountedSceneBody = createStubScene('settings');
export const EditProfileMountedSceneBody = createStubScene('editProfile');
export const ShareConfigMountedSceneBody = createStubScene('shareConfig');

const styles = StyleSheet.create({
  body: {
    paddingVertical: 32,
  },
  bodyText: {
    color: '#0f172a',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
