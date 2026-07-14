import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Link as LucideLink, MoreHorizontal, Plus, Share2 } from 'lucide-react-native';

import OverlayModalSheet from '../overlays/OverlayModalSheet';
import type { FavoriteListPerson } from '../services/favorite-lists';
import { Text } from './ui/Text';
import { MonogramAvatar } from './MonogramAvatar';
import {
  closeCollaboratorModal,
  getCollaboratorModalPayload,
  subscribeCollaboratorModal,
  type CollaboratorModalPayload,
} from './collaborator-modal-store';

// ─── Shared person atoms (the collaborator chip on ListDetail uses these too) ────────────────
export const personDisplayName = (person: FavoriteListPerson): string =>
  person.displayName?.trim() || person.username?.trim() || 'Crave member';

export const PersonAvatar = ({ person, size }: { person: FavoriteListPerson; size: number }) => (
  <MonogramAvatar
    seed={person.userId}
    title={personDisplayName(person)}
    size={size}
    textVariant="caption"
    style={styles.avatarCircle}
  />
);

const CollaboratorPersonRow = ({
  person,
  badge,
  canKick,
  canLeave,
  onOpenProfile,
  onKick,
  onLeave,
}: {
  person: FavoriteListPerson;
  badge: string | null;
  canKick: boolean;
  canLeave: boolean;
  onOpenProfile: (userId: string) => void;
  onKick: (userId: string) => void;
  onLeave: () => void;
}) => {
  // Owner kick affordance = ellipsis-reveal (§8.1: "swipe-left or ellipsis-reveal delete";
  // v1 ships the ellipsis path — no swipeable dependency on the modal surface).
  const [revealKick, setRevealKick] = React.useState(false);
  return (
    <View style={styles.personRow} testID={`collaborator-row-${person.userId}`}>
      <Pressable
        onPress={() => onOpenProfile(person.userId)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${personDisplayName(person)}'s profile`}
        style={styles.personRowMain}
      >
        <PersonAvatar person={person} size={36} />
        <View style={styles.personRowText}>
          <Text variant="body" weight="semibold" numberOfLines={1} style={styles.personName}>
            {personDisplayName(person)}
          </Text>
          {badge ? (
            <Text variant="caption" style={styles.personBadge}>
              {badge}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {canLeave ? (
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Leave this list"
          testID="collaborator-leave"
          style={styles.leaveButton}
        >
          <Text variant="caption" weight="semibold" style={styles.leaveText}>
            Leave
          </Text>
        </Pressable>
      ) : null}
      {canKick ? (
        revealKick ? (
          <Pressable
            onPress={() => onKick(person.userId)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${personDisplayName(person)}`}
            testID={`collaborator-kick-${person.userId}`}
            style={styles.kickButton}
          >
            <Text variant="caption" weight="semibold" style={styles.kickText}>
              Remove
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setRevealKick(true)}
            accessibilityRole="button"
            accessibilityLabel="Collaborator actions"
            hitSlop={8}
            testID={`collaborator-ellipsis-${person.userId}`}
            style={styles.personEllipsis}
          >
            <MoreHorizontal size={18} color="#64748b" strokeWidth={2} />
          </Pressable>
        )
      ) : null}
    </View>
  );
};

// ─── The ONE collaborator modal (§8.1, scrollable OverlayModalSheet) ─────────────────────────
const CollaboratorModalSheet = ({
  visible,
  payload,
}: {
  visible: boolean;
  payload: CollaboratorModalPayload;
}) => {
  const {
    roster,
    viewerRole,
    myUserId,
    inviteState,
    onCopyInvite,
    onShareList,
    onOpenProfile,
    onKick,
    onLeave,
    onRequestClose,
  } = payload;
  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={onRequestClose}
      scrollable
      paddingTop={26}
      paddingHorizontal={24}
      minBottomPadding={18}
    >
      <Text variant="subtitle" weight="semibold" style={styles.modalTitle}>
        Collaborators
      </Text>
      {/* Row 1 — Add collaborator. v1 = copy the invite link (the universal share modal
          replaces this in W3); recipients open the link and join as collaborators. */}
      <Pressable
        onPress={onCopyInvite}
        accessibilityRole="button"
        accessibilityLabel="Add collaborator"
        testID="collaborator-add"
        style={styles.personRow}
      >
        <View style={styles.personRowMain}>
          <View style={[styles.avatarCircle, styles.plusCircleLarge]}>
            <Plus size={18} color="#0f172a" strokeWidth={2.5} />
          </View>
          <View style={styles.personRowText}>
            <Text variant="body" weight="semibold" style={styles.personName}>
              Add collaborator
            </Text>
            <Text variant="caption" style={styles.personBadge}>
              {inviteState === 'copied'
                ? 'Invite link copied'
                : inviteState === 'unavailable'
                  ? 'Ask the owner to turn on sharing'
                  : 'Copy an invite link — anyone with it can join'}
            </Text>
          </View>
        </View>
        {inviteState === 'copied' ? (
          <Check size={18} color="#16a34a" strokeWidth={2} />
        ) : (
          <LucideLink size={18} color="#64748b" strokeWidth={2} />
        )}
      </Pressable>
      {/* Row 2 — Share list (W3 universal share modal, NO join intent). */}
      <Pressable
        onPress={onShareList}
        accessibilityRole="button"
        accessibilityLabel="Share list"
        testID="collaborator-share-list"
        style={styles.personRow}
      >
        <View style={styles.personRowMain}>
          <View style={[styles.avatarCircle, styles.plusCircleLarge]}>
            <Share2 size={16} color="#0f172a" strokeWidth={2} />
          </View>
          <View style={styles.personRowText}>
            <Text variant="body" weight="semibold" style={styles.personName}>
              Share list
            </Text>
            <Text variant="caption" style={styles.personBadge}>
              Send in Crave or copy a view-only link
            </Text>
          </View>
        </View>
        <Share2 size={18} color="#64748b" strokeWidth={2} />
      </Pressable>
      <CollaboratorPersonRow
        person={roster.owner}
        badge="Owner"
        canKick={false}
        canLeave={false}
        onOpenProfile={onOpenProfile}
        onKick={onKick}
        onLeave={onLeave}
      />
      {roster.collaborators.map((person) => (
        <CollaboratorPersonRow
          key={person.userId}
          person={person}
          badge="Collaborator"
          canKick={viewerRole === 'owner'}
          canLeave={viewerRole === 'collaborator' && person.userId === myUserId}
          onOpenProfile={onOpenProfile}
          onKick={onKick}
          onLeave={onLeave}
        />
      ))}
    </OverlayModalSheet>
  );
};

/**
 * Root host for the imperative collaborator modal (see collaborator-modal-store.ts).
 * Mounted ONCE beside AppModalHost/OptionSelectorHost/ScoreInfoHost so the sheet is
 * viewport-anchored on every surface — a panel-local mount inside a scrollable body
 * anchors to the content box and lands offscreen on a long list (leg-12 sim RED).
 * Keeps the last payload through the exit animation so the content doesn't blank
 * mid-slide-out (the ScoreInfoHost pattern).
 */
export const CollaboratorModalHost: React.FC = () => {
  const payload = React.useSyncExternalStore(
    subscribeCollaboratorModal,
    getCollaboratorModalPayload,
    () => null
  );
  const lastPayloadRef = React.useRef(payload);
  if (payload != null) {
    lastPayloadRef.current = payload;
  }
  const renderedPayload = payload ?? lastPayloadRef.current;
  if (renderedPayload == null) {
    return null;
  }
  return <CollaboratorModalSheet visible={payload != null} payload={renderedPayload} />;
};

// Re-export so the owning surface's dismissal effect and the host share one closer.
export { closeCollaboratorModal };

const styles = StyleSheet.create({
  avatarCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  plusCircleLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  modalTitle: {
    textAlign: 'center',
    color: '#0f172a',
    fontSize: 18,
    marginBottom: 14,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  personRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personRowText: {
    flex: 1,
    gap: 2,
  },
  personName: {
    color: '#0f172a',
  },
  personBadge: {
    color: '#64748b',
  },
  personEllipsis: {
    padding: 6,
  },
  leaveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  leaveText: {
    color: '#0f172a',
  },
  kickButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  kickText: {
    color: '#dc2626',
  },
});
