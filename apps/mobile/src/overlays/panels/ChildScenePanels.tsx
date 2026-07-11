import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { X as LucideX } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '../../components';
import { announceFailureIfOnline } from '../../components/app-modal-store';
import { MANAGE_SUBSCRIPTIONS_URL, PRIVACY_URL, TERMS_URL } from '../../constants/legalLinks';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAccountActionsRuntime } from './runtime/use-account-actions-runtime';
import { createProfileQueryOptions } from './profileSceneQueryOptions';
import { usersService, type FollowListUser } from '../../services/users';
import { UserProfilePanelBody } from './UserProfilePanel';
import { FollowListPanelBody } from './FollowListPanel';
import { NotificationsPanelBody } from './NotificationsPanel';
import { EditProfilePanelBody } from './EditProfilePanel';
import { ListDetailPanelBody } from './ListDetailPanel';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { MonogramAvatar } from '../../components/MonogramAvatar';

// ─── Child-scene panel hub ───────────────────────────────────────────────────────────────────
// The Settings scene body lives here, plus the re-export + persistent-header registration seam
// for the child scenes whose real bodies live in their own Panel files (UserProfilePanel,
// FollowListPanel, NotificationsPanel, EditProfilePanel, ListDetailPanel). Header registration
// runs at module scope — this module is imported by the mounted-body registry, so the
// registrations land before any child scene can present.

type ChildSceneKey =
  | 'userProfile'
  | 'listDetail'
  | 'followList'
  | 'notifications'
  | 'settings'
  | 'editProfile';

const CHILD_SCENE_TITLES: Record<ChildSceneKey, string> = {
  userProfile: 'Profile',
  listDetail: 'List',
  followList: 'Followers',
  notifications: 'Notifications',
  settings: 'Settings',
  editProfile: 'Edit profile',
};

const DrillInRow = ({
  label,
  testID,
  onPress,
  destructive = false,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  destructive?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
    style={styles.drillInRow}
  >
    <Text
      variant="body"
      weight="semibold"
      style={destructive ? styles.destructiveRowText : styles.bodyText}
    >
      {label}
    </Text>
  </Pressable>
);

// ─── Settings tree (W4 — page-registry §7.7/§9a + registry-implementation-plan W4.1) ────────
// Build-as-needed discipline: rows whose backend exists are LIVE; rows whose feature
// doesn't exist yet are HONEST disabled "coming soon" rows (never fake settings).

const SectionHeader = ({ label }: { label: string }) => (
  <Text variant="caption" weight="semibold" style={styles.sectionHeader}>
    {label}
  </Text>
);

// Honest placeholder: the feature has no backend yet — visibly disabled, not fake.
const ComingSoonRow = ({ label, testID }: { label: string; testID: string }) => (
  <View style={styles.drillInRow} testID={testID} accessibilityState={{ disabled: true }}>
    <Text variant="body" weight="semibold" style={styles.disabledRowText}>
      {label}
    </Text>
    <Text variant="caption" style={styles.comingSoonBadge}>
      Coming soon
    </Text>
  </View>
);

const BlockedRowAvatar = ({ user }: { user: FollowListUser }) => (
  <MonogramAvatar
    seed={user.userId}
    avatarUrl={user.avatarUrl}
    title={user.displayName ?? user.username ?? '?'}
    size={36}
    textVariant="caption"
  />
);

// §8.6 privacy: my block list, inline under Privacy — each row carries the Unblock
// affordance (GET /users/me/blocks + the existing DELETE :userId/block).
const BlockedUsersSection = () => {
  const queryClient = useQueryClient();
  const [pendingUnblockId, setPendingUnblockId] = React.useState<string | null>(null);
  const blocksQuery = useQuery({
    queryKey: ['my-blocks'],
    queryFn: () => usersService.listMyBlocks(),
    staleTime: 30 * 1000,
  });
  const handleUnblock = React.useCallback(
    (user: FollowListUser) => {
      setPendingUnblockId(user.userId);
      usersService
        .unblockUser(user.userId)
        .then(() => queryClient.invalidateQueries({ queryKey: ['my-blocks'] }))
        .catch(() => announceFailureIfOnline())
        .finally(() => setPendingUnblockId(null));
    },
    [queryClient]
  );
  const users = blocksQuery.data ?? [];
  return (
    <View testID="settings-blocked-users">
      {blocksQuery.isPending ? (
        // Settings root renders instantly (§7.7 — no skeleton); the one async slice keeps
        // its footprint to a quiet inline spinner row.
        <View style={styles.blockedStateRow}>
          <ActivityIndicator size="small" color="#94a3b8" />
        </View>
      ) : blocksQuery.isError ? (
        <View style={styles.blockedStateRow}>
          <Text variant="caption" style={styles.blockedEmptyText}>
            Couldn't load blocked users.
          </Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.blockedStateRow}>
          <Text variant="caption" style={styles.blockedEmptyText} testID="settings-blocks-empty">
            You haven't blocked anyone.
          </Text>
        </View>
      ) : (
        users.map((user) => (
          <View
            key={user.userId}
            style={styles.blockedRow}
            testID={`settings-block-${user.userId}`}
          >
            <BlockedRowAvatar user={user} />
            <View style={styles.blockedRowText}>
              <Text variant="body" weight="semibold" numberOfLines={1} style={styles.bodyText}>
                {user.displayName ?? user.username ?? 'User'}
              </Text>
              {user.username ? (
                <Text variant="caption" numberOfLines={1} style={styles.blockedRowSubtitle}>
                  @{user.username}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => handleUnblock(user)}
              disabled={pendingUnblockId === user.userId}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${user.username ?? 'user'}`}
              style={styles.unblockButton}
              testID={`settings-unblock-${user.userId}`}
            >
              <Text variant="caption" weight="semibold" style={styles.unblockButtonText}>
                {pendingUnblockId === user.userId ? 'Unblocking…' : 'Unblock'}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
};

// Subscription status line — server-truth access block (usersService.getMe().access);
// manage/cancel rides the MANAGE_IN_APP_STORE path (App Store subs are managed in iOS).
const SubscriptionStatusLine = () => {
  const profileQuery = useQuery(createProfileQueryOptions());
  const access = profileQuery.data?.access;
  if (access == null) {
    return null;
  }
  const renewalDate = access.paidUntil ? new Date(access.paidUntil).toLocaleDateString() : null;
  const statusText = access.active
    ? renewalDate
      ? `Active — renews or expires ${renewalDate}`
      : 'Active'
    : 'Inactive';
  return (
    <View style={styles.blockedStateRow} testID="settings-subscription-status">
      <Text variant="caption" style={styles.blockedEmptyText}>
        {statusText}
      </Text>
    </View>
  );
};

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
  const appVersion = Constants.expoConfig?.version ?? null;
  return (
    <View style={styles.body} testID="stub-scene-settings">
      <SectionHeader label="Account" />
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

      <SectionHeader label="Notifications" />
      {/* Honest stub: the backend has device registration + the feed, but NO per-type
          opt-in preference store yet (W4.1 names poll_release as its first row). */}
      <ComingSoonRow label="Notification preferences" testID="settings-notification-prefs" />

      <SectionHeader label="Privacy" />
      <BlockedUsersSection />

      <SectionHeader label="Subscription" />
      <SubscriptionStatusLine />
      <DrillInRow
        label="Manage subscription"
        testID="settings-manage-subscription"
        onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL)}
      />

      <SectionHeader label="Appearance" />
      {/* §7.7: dark/light mode is a named future placeholder. */}
      <ComingSoonRow label="Light & dark mode" testID="settings-appearance" />

      <SectionHeader label="Legal" />
      <DrillInRow
        label="Terms of service"
        testID="settings-terms"
        onPress={() => void Linking.openURL(TERMS_URL)}
      />
      <DrillInRow
        label="Privacy policy"
        testID="settings-privacy-policy"
        onPress={() => void Linking.openURL(PRIVACY_URL)}
      />

      <SectionHeader label="Account actions" />
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
        destructive
      />

      {appVersion ? (
        <Text variant="caption" style={styles.versionFooter} testID="settings-app-version">
          Crave v{appVersion}
        </Text>
      ) : null}
    </View>
  );
});
SettingsSceneBody.displayName = 'SettingsSceneBody';

const createChildPersistentHeaderTitle = (sceneKey: ChildSceneKey): React.ComponentType => {
  // Static text → synchronous first-frame render (same contract as SaveListPanel's title).
  const ChildPersistentHeaderTitle = React.memo(() => (
    <View style={styles.headerTextGroup}>
      <Text
        variant="title"
        weight="semibold"
        style={styles.headerTitle}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {CHILD_SCENE_TITLES[sceneKey]}
      </Text>
    </View>
  ));
  ChildPersistentHeaderTitle.displayName = `ChildPersistentHeaderTitle(${sceneKey})`;
  return ChildPersistentHeaderTitle;
};

const createChildPersistentHeaderAction = (sceneKey: ChildSceneKey): React.ComponentType => {
  // Generic child-scene close — the same closeActiveRoute action the pollDetail/pollCreation
  // persistent headers use (app-wide route controller).
  const ChildPersistentHeaderAction = React.memo(() => {
    const { closeActiveRoute } = useAppOverlayRouteController();
    return (
      <Pressable
        onPress={closeActiveRoute}
        accessibilityRole="button"
        accessibilityLabel={`Close ${CHILD_SCENE_TITLES[sceneKey].toLowerCase()}`}
        style={overlaySheetStyles.closeButton}
        hitSlop={8}
      >
        <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
          <LucideX size={20} color="#000000" strokeWidth={2.5} />
        </View>
      </Pressable>
    );
  });
  ChildPersistentHeaderAction.displayName = `ChildPersistentHeaderAction(${sceneKey})`;
  return ChildPersistentHeaderAction;
};

const registerChildHeader = (sceneKey: ChildSceneKey): void => {
  registerPersistentHeaderDescriptor(sceneKey, {
    Title: createChildPersistentHeaderTitle(sceneKey),
    Action: createChildPersistentHeaderAction(sceneKey),
  });
};

registerChildHeader('userProfile');
registerChildHeader('followList');
registerChildHeader('settings');
export const UserProfileMountedSceneBody = UserProfilePanelBody;
export const FollowListMountedSceneBody = FollowListPanelBody;
export const SettingsMountedSceneBody = SettingsSceneBody;
// listDetail is REAL now (W1 slice 4) — body + persistent header live in ListDetailPanel.
export const ListDetailMountedSceneBody = ListDetailPanelBody;
registerChildHeader('notifications');
export const NotificationsMountedSceneBody = NotificationsPanelBody;
registerChildHeader('editProfile');
export const EditProfileMountedSceneBody = EditProfilePanelBody;

const styles = StyleSheet.create({
  body: {
    paddingBottom: 32,
  },
  bodyText: {
    color: '#0f172a',
  },
  drillInRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 24,
    marginBottom: 4,
  },
  disabledRowText: {
    color: '#94a3b8',
  },
  destructiveRowText: {
    color: '#dc2626',
  },
  comingSoonBadge: {
    color: '#94a3b8',
  },
  blockedStateRow: {
    paddingVertical: 12,
  },
  blockedEmptyText: {
    color: '#64748b',
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  blockedRowText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  blockedRowSubtitle: {
    color: '#64748b',
  },
  unblockButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  unblockButtonText: {
    color: '#0f172a',
  },
  versionFooter: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 32,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
