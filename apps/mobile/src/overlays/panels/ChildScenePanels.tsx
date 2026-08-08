import React from 'react';
import { useShellLiveness } from '../ShellVisibilityBoundary';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '../../components';
import { announceFailureIfOnline } from '../../components/app-modal-store';
import { PRIVACY_URL, TERMS_URL } from '../../constants/legalLinks';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import { areOverlayRoutesEqual } from '../../navigation/runtime/app-overlay-route-stack-algebra';
import type {
  OverlayRouteEntry,
  OverlayRouteParamsMap,
} from '../../navigation/runtime/app-overlay-route-types';
import type { RouteOverlayNavigationSnapshot } from '../../navigation/runtime/route-overlay-navigation-snapshot-contract';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAccountActionsRuntime } from './runtime/use-account-actions-runtime';
import { useManageSubscriptionAction } from './runtime/use-manage-subscription-action';
import { useAuth } from '@clerk/clerk-expo';
import { createProfileQueryOptions } from './profileSceneQueryOptions';
import { usersService, type FollowListUser } from '../../services/users';
import { UserProfilePanelBody } from './UserProfilePanel';
import { FollowListPanelBody } from './FollowListPanel';
import { NotificationsPanelBody } from './NotificationsPanel';
import { EditProfilePanelBody } from './EditProfilePanel';
import { ListDetailPanelBody } from './ListDetailPanel';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { PageBodyShell } from '../PageBodyShell';
import { ChromeTitleText, toSingleLineText } from '../ChromeTitleText';
import type { PageStaticBodySpec } from '../page-body-contract';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import SquircleSpinner from '../../components/SquircleSpinner';
import { resolveUserDisplayName, resolveUserHandleLabel } from '../../utils/user-display-name';

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

// ─── THE PAGE'S NAME IS A FUNCTION OF THE PAGE'S PARAMS (F925) ───────────────────────
// This table used to be `Record<ChildSceneKey, string>` with `followList: 'Followers'`
// hardcoded — while the followList BODY derived the real mode from its own params and
// rendered a `contextLabel` caption that existed ONLY to compensate for the header
// being wrong half the time (a user tapping "Following" got a page titled
// "Followers"). Truth in two places, already diverged. The title is now derived from
// the same route entry the body reads, once, and the compensating caption is gone.
//
// Static-titled scenes declare a constant resolver — the shape is uniform, so a future
// param-dependent title has nowhere else to grow.
type ChildSceneTitleResolver = (entry: OverlayRouteEntry | null) => string;

const staticTitle =
  (title: string): ChildSceneTitleResolver =>
  () =>
    title;

const CHILD_SCENE_TITLES: Record<ChildSceneKey, ChildSceneTitleResolver> = {
  userProfile: staticTitle('Profile'),
  listDetail: staticTitle('List'),
  notifications: staticTitle('Notifications'),
  settings: staticTitle('Settings'),
  editProfile: staticTitle('Edit profile'),
  followList: (entry) => {
    const params = (entry?.key === 'followList' ? entry.params : null) as
      | OverlayRouteParamsMap['followList']
      | null;
    // Same defaulting rule as FollowListPanelBody's `mode`, and the only place either
    // of them spells it.
    return params?.mode === 'following' ? 'Following' : 'Followers';
  },
};

/** The topmost route entry for a scene key. THE HEADER always describes the top of the
 *  stack (unlike leg bodies, where topmost-per-key is the warned anti-pattern) — the
 *  same reading `useTopMostListDetailEntryForHeader` does for listDetail, generalised
 *  so every child header can derive its title from its own params. */
const useTopMostChildEntryForHeader = (sceneKey: ChildSceneKey): OverlayRouteEntry | null => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const selector = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot): OverlayRouteEntry | null => {
      for (let index = snapshot.overlayRouteStack.length - 1; index >= 0; index -= 1) {
        const entry = snapshot.overlayRouteStack[index];
        if (entry?.key === sceneKey) {
          return entry;
        }
      }
      return null;
    },
    [sceneKey]
  );
  return useRouteAuthoritySelector({
    subscribe: (listener, attributionLabel) =>
      routeSceneRuntime.routeOverlayNavigationAuthority.subscribeTarget({
        selector,
        syncNavigationSnapshot: () => listener(),
        isEqual: (left, right) => areOverlayRoutesEqual(left, right),
        attributionLabel: attributionLabel ?? `childHeaderTitle:${sceneKey}`,
      }),
    getSnapshot: () => routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot(),
    selector,
    isEqual: (left, right) => areOverlayRoutesEqual(left, right),
    attributionOwner: 'useTopMostChildEntryForHeader',
    attributionOperation: sceneKey,
  });
};

const DrillInRow = ({
  label,
  testID,
  onPress,
  destructive = false,
  disabled = false,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  destructive?: boolean;
  /** For a row whose destination is not KNOWN yet (see ManageSubscriptionRow):
   *  waiting is honest, guessing is not. */
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    testID={testID}
    style={styles.drillInRow}
  >
    <Text
      variant="body"
      weight="semibold"
      style={
        disabled
          ? styles.disabledRowText
          : destructive
            ? styles.destructiveRowText
            : styles.bodyText
      }
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
    // F3700: this chain restored the exact `'?'` fallback F934(a)'s docstring
    // names as UserProfilePanel's ELIMINATED copy — in the `??` dialect, two
    // lines from an import of the resolver that already answers this.
    title={resolveUserDisplayName(user)}
    size={36}
    textVariant="caption"
  />
);

// §8.6 privacy: my block list, inline under Privacy — each row carries the Unblock
// affordance (GET /users/me/blocks + the existing DELETE :userId/block).
const BlockedUsersSection = () => {
  const queryClient = useQueryClient();
  const [pendingUnblockId, setPendingUnblockId] = React.useState<string | null>(null);
  // A#9 (residency): settings is resident — the hidden section must stay quiet.
  const blocksLive = useShellLiveness();
  const blocksQuery = useQuery({
    queryKey: ['my-blocks'],
    queryFn: () => usersService.listMyBlocks(),
    subscribed: blocksLive,
    staleTime: 30 * 1000,
  });
  const handleUnblock = React.useCallback(
    (user: FollowListUser) => {
      // The blocked account may since have been deleted — the block is
      // RETAINED (it protects whoever placed it), so this list renders ghosts.
      // Unblocking one is still meaningful bookkeeping, but it needs an id.
      if (!user.userId) return;
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
        // Settings root renders instantly (§7.7); the one async slice keeps a quiet inline
        // squircle row (leg 6: raw ActivityIndicator banned — skeletons for bodies, squircle
        // for inline/button loading).
        <View style={styles.blockedStateRow}>
          <SquircleSpinner size={18} color="#94a3b8" />
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
                {resolveUserDisplayName(user, 'User')}
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
              accessibilityLabel={`Unblock ${resolveUserHandleLabel(user, 'user')}`}
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

// Subscription status line — server-truth access block (usersService.getMe().access).
const SubscriptionStatusLine = () => {
  // A#9 (residency): quiet while the hosting shell is hidden.
  const subscriptionLive = useShellLiveness();
  const { userId } = useAuth();
  const profileQuery = useQuery({
    ...createProfileQueryOptions(userId),
    subscribed: subscriptionLive,
  });
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

// RAIL-AWARE "Manage subscription": where this row LANDS depends on who bills the user
// (access.billingRail — server-derived from the live subscription row). See
// runtime/use-manage-subscription-action.ts for the dispatch and why a single hardcoded
// Apple URL was a dead end for the web rail.
const ManageSubscriptionRow = () => {
  const subscriptionLive = useShellLiveness();
  const { userId } = useAuth();
  const profileQuery = useQuery({
    ...createProfileQueryOptions(userId),
    subscribed: subscriptionLive,
  });
  const handleManageSubscription = useManageSubscriptionAction(
    profileQuery.data?.access?.billingRail
  );
  // "NOT LOADED YET" IS NOT "NO SUBSCRIPTION" (F9804). `billingRail` is
  // undefined for both, and the dispatch routes undefined to the paywall — so
  // tapping this row during the first second after opening settings showed a
  // Stripe subscriber the plans screen. The two facts are distinguishable
  // (the query knows), so the row waits instead of guessing: disabled while
  // the profile is in flight, live the moment an answer exists — including
  // the answer "null, no rail", which legitimately means the paywall.
  const railKnown = profileQuery.data?.access !== undefined;
  return (
    <DrillInRow
      label="Manage subscription"
      testID="settings-manage-subscription"
      onPress={handleManageSubscription}
      disabled={!railKnown}
    />
  );
};

// The settings CONTENT slot (THE PAGE L2 static body — no page-level query; the
// blocked-users squircle row is the sanctioned inline-SECTION class, not page loading).
const SettingsContent = React.memo(() => {
  const { pushRoute } = useAppOverlayRouteController();
  const { handleSignOut, handleReplayOnboarding, handleDeleteAccount } = useAccountActionsRuntime();
  // "My public profile" is gone: the profile TAB (root page) now IS that page — same shared
  // four-section experience — so there is nothing to drill into from settings. Edit profile stays.
  const appVersion = Constants.expoConfig?.version ?? null;
  return (
    <View style={styles.body} testID="stub-scene-settings">
      <SectionHeader label="Account" />
      <DrillInRow
        label="Edit profile"
        testID="settings-edit-profile"
        onPress={() => pushRoute('editProfile')}
      />

      <SectionHeader label="Notifications" />
      {/* Honest stub: the backend has device registration + the feed, but NO per-type
          opt-in preference store yet (W4.1 names poll_release as its first row). */}
      <ComingSoonRow label="Notification preferences" testID="settings-notification-prefs" />

      <SectionHeader label="Privacy" />
      <BlockedUsersSection />

      <SectionHeader label="Subscription" />
      <SubscriptionStatusLine />
      <ManageSubscriptionRow />

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
SettingsContent.displayName = 'SettingsContent';

// THE DECLARATION (L2): settings is a static PageBodySpec — always present by
// construction; a page-level skeleton for settings is unrepresentable.
const SETTINGS_PAGE_BODY: PageStaticBodySpec = {
  kind: 'static',
  scene: 'settings',
  Content: SettingsContent,
};

const SettingsSceneBody = React.memo((_props: MountedSceneBodyProps) => (
  <PageBodyShell spec={SETTINGS_PAGE_BODY} />
));
SettingsSceneBody.displayName = 'SettingsSceneBody';

const createChildPersistentHeaderTitle = (sceneKey: ChildSceneKey): React.ComponentType => {
  // Params-derived text, resolved synchronously from the route entry that is ALREADY
  // committed when the header renders → still a first-frame render, no skeleton.
  const ChildPersistentHeaderTitle = React.memo(() => {
    const entry = useTopMostChildEntryForHeader(sceneKey);
    return (
      <View style={styles.headerTextGroup}>
        <ChromeTitleText>{toSingleLineText(CHILD_SCENE_TITLES[sceneKey](entry))}</ChromeTitleText>
      </View>
    );
  });
  ChildPersistentHeaderTitle.displayName = `ChildPersistentHeaderTitle(${sceneKey})`;
  return ChildPersistentHeaderTitle;
};

// Leg 6 (§4 HeaderNavAction): the per-scene close-X factory is DELETED — the persistent header
// host owns the ONE plus↔X action control; child scenes get the X (and its close press) by
// role derivation, no per-scene registration.
const registerChildHeader = (sceneKey: ChildSceneKey): void => {
  registerPersistentHeaderDescriptor(sceneKey, {
    Title: createChildPersistentHeaderTitle(sceneKey),
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
});
