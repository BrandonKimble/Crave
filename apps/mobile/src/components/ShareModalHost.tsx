import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { setClipboardString } from '../utils/clipboard';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import { userListsService } from '../services/user-lists';
import { messagingService, type ConversationPeer } from '../services/messaging';
import { announceFailureIfOnline, showAppModal } from './app-modal-store';
import {
  buildShareLinkPath,
  dismissShareModal,
  SHARE_BASE_URL,
  resolveShareLinkMode,
  shareModalStore,
  type ShareModalConfig,
} from './share-modal-store';
import { useSingletonSurfaceHost } from './singleton-surface-store';
import { isInteractableAuthor } from '../services/author-identity';
import { resolveUserDisplayName } from '../utils/user-display-name';

/**
 * THE universal share modal (W3, page-registry §9b). One OverlayModalSheet
 * instance, mounted once at the app root (next to AppModalHost). Anatomy:
 *   1. "Send to" — closeness-ranked people (multi-select avatars) → the
 *      messaging share fan-out (POST /messaging/share).
 *   2. Optional message field + Send (visible once someone is selected).
 *   3. Copy link — public URL via the desire-url-codec serializer; lists
 *      enable their shareSlug on demand; comment has no public URL (hidden).
 *   4. OS share sheet with the same link.
 * v1 is crude-real: the beautiful share-package preview (§9b layout) is the
 * owner design pass.
 */

// F3700: this was a ninth hand-rolled chain, in the `??` dialect the F1960 ban
// could not see — so it skipped the isDeleted branch (a deleted peer rendered as
// a nameless live one) and invented a ninth fallback word, 'Crave user', for the
// same sentence the rest of the app writes as 'Crave member'.
const peerDisplayName = (peer: ConversationPeer): string => resolveUserDisplayName(peer);

const TargetAvatar = ({
  peer,
  selected,
  onToggle,
}: {
  peer: ConversationPeer;
  selected: boolean;
  onToggle: (userId: string) => void;
}) => (
  <Pressable
    // A ghost cannot receive a share: there is nobody to deliver it to.
    onPress={() => peer.userId && onToggle(peer.userId)}
    disabled={!isInteractableAuthor(peer)}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={`Send to ${peerDisplayName(peer)}`}
    testID={`share-target-${peer.userId}`}
    style={styles.targetCell}
  >
    <View style={[styles.avatarRing, selected && styles.avatarRingSelected]}>
      {peer.avatarUrl ? (
        <Image source={{ uri: peer.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text variant="body" weight="semibold" style={styles.avatarInitial}>
            {peerDisplayName(peer).slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      {selected ? (
        <View style={styles.avatarCheck}>
          <Feather name="check" size={12} color="#ffffff" />
        </View>
      ) : null}
    </View>
    <Text variant="caption" numberOfLines={1} style={styles.targetName}>
      {peerDisplayName(peer)}
    </Text>
  </Pressable>
);

const ShareRow = ({
  icon,
  label,
  sublabel,
  onPress,
  disabled,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
    style={[styles.actionRow, disabled && styles.actionRowDisabled]}
  >
    <View style={styles.actionIcon}>
      <Feather name={icon} size={18} color="#0f172a" />
    </View>
    <View style={styles.actionText}>
      <Text variant="body" weight="semibold" style={styles.actionLabel}>
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption" style={styles.actionSublabel}>
          {sublabel}
        </Text>
      ) : null}
    </View>
  </Pressable>
);

const ShareModalContent = ({ config }: { config: ShareModalConfig }) => {
  // THE link verdict, evaluated once (F887). Everything below reads this discriminant
  // instead of re-deriving the three-clause predicate from raw config fields.
  const linkMode = resolveShareLinkMode(config);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  // Per-open share id: stable across retries of THIS share (server dedupes
  // `share:{id}` per conversation), rotated after a completed fan-out so a
  // deliberate later re-share of the same entity is never dedupe-collapsed.
  const mintShareId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const clientShareIdRef = React.useRef<string>(mintShareId());

  const targetsQuery = useQuery({
    queryKey: ['shareTargets'],
    queryFn: () => messagingService.shareTargets(),
    staleTime: 60_000,
  });
  const targets = targetsQuery.data?.targets ?? [];

  const toggleTarget = React.useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  // F887 (2026-08-03): the three-clause link-ownership predicate is no longer re-derived
  // here (or below) — `resolveShareLinkMode` in the store is the ONE evaluation, and it is
  // the same one that decided whether these rows render at all.
  //
  // Lists without a known slug enable share on demand (owner path — the same
  // service the W3F long-press Share action used).
  const resolveLinkUrl = React.useCallback(async (): Promise<string> => {
    const linkConfig =
      linkMode === 'needs-enable'
        ? {
            ...config,
            listShareSlug: (await userListsService.enableShare(config.id)).shareSlug,
          }
        : config;
    const path = buildShareLinkPath(linkConfig);
    if (path == null) {
      // Unreachable by construction: the rows only render for a config whose mode is not
      // 'none', and both remaining modes produce a path. Loud rather than silent if the
      // codec and the mode verdict ever disagree.
      throw new Error('share link mode promised a path the url codec did not produce');
    }
    return `${SHARE_BASE_URL}${path}`;
  }, [config, linkMode]);

  // enableShare on a slug-less list mints a LIVE link — anyone holding it can
  // view until sharing is turned off. Visibility is untouched (visibility
  // canon: the link is the access, Public/Private is only discovery). Never
  // mint silently on a "Copy link" tap: owner confirms first; any link action
  // on an already-linkable config runs straight through.
  const confirmEnableShareThen = React.useCallback(
    (run: () => void) => {
      if (linkMode === 'needs-enable') {
        showAppModal({
          title: 'Share this list?',
          message:
            'This creates a share link — anyone who has it can view the list until you turn sharing off. Your Public/Private setting stays as it is. Share?',
          actions: [
            { label: 'Cancel', style: 'cancel' },
            { label: 'Share', style: 'default', onPress: run },
          ],
        });
        return;
      }
      run();
    },
    [linkMode]
  );

  const handleCopyLink = React.useCallback(() => {
    confirmEnableShareThen(() => {
      setCopying(true);
      resolveLinkUrl()
        .then((url) => {
          setClipboardString(url);
          setCopied(true);
        })
        .catch(() => {
          announceFailureIfOnline();
        })
        .finally(() => {
          setCopying(false);
        });
    });
  }, [confirmEnableShareThen, resolveLinkUrl]);

  const handleSystemShare = React.useCallback(() => {
    confirmEnableShareThen(() => {
      resolveLinkUrl()
        .then((url) =>
          Share.share({ message: config.title ? `${config.title} · ${url}` : url }).catch(
            () => undefined
          )
        )
        .catch(() => {
          announceFailureIfOnline();
        });
    });
  }, [config.title, confirmEnableShareThen, resolveLinkUrl]);

  /**
   * The CAPABILITY slug this share must carry, or undefined when the shared thing needs
   * none (F834). A public restaurant / dish / poll / profile is reachable by id; a
   * non-curated list is not — its slug IS the access. When the list has no slug yet, this
   * mints one, which is why every caller must go through `confirmEnableShareThen` first:
   * minting a link is the owner's decision, never a side effect of tapping Send.
   */
  const resolveShareCapabilitySlug = React.useCallback(async (): Promise<string | undefined> => {
    if (config.kind !== 'list' || config.listSource === 'curated') {
      return undefined;
    }
    if (config.listShareSlug) {
      return config.listShareSlug;
    }
    if (linkMode !== 'needs-enable') {
      return undefined;
    }
    return (await userListsService.enableShare(config.id)).shareSlug;
  }, [config, linkMode]);

  const sendShare = React.useCallback(
    (sharedEntitySlug: string | undefined) => {
      const nameById = new Map(targets.map((t) => [t.userId, peerDisplayName(t)]));
      messagingService
        .shareFanOut({
          recipientUserIds: [...selectedIds],
          sharedEntityKind: config.kind,
          sharedEntityId: config.id,
          // F834 (2026-08-03): THREAD THE CAPABILITY. Without this a DM'd private list
          // arrives as a preview whose tap carries no slug, and "slug is the capability"
          // means that read fails. `shareSlug` is null for kinds that need no capability
          // (a public restaurant / dish / poll is reachable by id) and for a list the
          // viewer cannot mint one for — in which case the send is refused above rather
          // than delivering a dead preview.
          sharedEntitySlug,
          body: message.trim() ? message.trim() : undefined,
          clientShareId: clientShareIdRef.current,
        })
        .then(({ results }) => {
          // This share is done — a future re-share must be a NEW dedupe scope.
          clientShareIdRef.current = mintShareId();
          dismissShareModal();
          // Per-recipient honesty: surface exactly who it could not reach.
          const failed = results.filter((r) => r.error != null);
          if (failed.length > 0) {
            const names = failed
              .map((r) => nameById.get(r.recipientUserId) ?? 'a recipient')
              .join(', ');
            showAppModal({
              title: 'Some shares didn’t send',
              message: `Couldn’t send to ${names}.`,
              actions: [{ label: 'OK', style: 'default' }],
            });
          }
        })
        .catch(() => {
          announceFailureIfOnline();
        })
        .finally(() => {
          setSending(false);
        });
    },
    [config.id, config.kind, message, selectedIds, targets]
  );

  const handleSend = React.useCallback(() => {
    if (selectedIds.size === 0 || sending) {
      return;
    }
    // F834: the slug is resolved (and, with consent, minted) BEFORE the fan-out — a DM'd
    // private list must arrive with the capability that makes it readable.
    confirmEnableShareThen(() => {
      setSending(true);
      void resolveShareCapabilitySlug()
        .then(sendShare)
        .catch(() => {
          setSending(false);
          announceFailureIfOnline();
        });
    });
  }, [confirmEnableShareThen, resolveShareCapabilitySlug, selectedIds, sendShare, sending]);

  // Hidden (not failing) rows: comment has no public URL; a non-owned list
  // with no known slug can't mint one (enableShare is owner-only).
  const hasLink = linkMode !== 'none';
  // Curated lists: the messaging share-package resolver speaks favorites list ids
  // only, so send-in-app is HIDDEN (never a failing fake) — link rows carry the /cl
  // public URL instead. Wiring curated ids into the resolver is a follow-up.
  const showSendSection =
    config.listSource !== 'curated' && (targetsQuery.isPending || targets.length > 0);

  return (
    <View testID="share-modal">
      <Text variant="subtitle" weight="semibold" style={styles.title}>
        Share
      </Text>
      {config.title ? (
        <Text variant="caption" numberOfLines={1} style={styles.subtitle}>
          {config.title}
        </Text>
      ) : null}

      {showSendSection ? (
        <View style={styles.sendSection}>
          <Text variant="caption" weight="semibold" style={styles.sectionLabel}>
            Send to
          </Text>
          {targetsQuery.isPending ? (
            <View style={styles.targetsLoading}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.targetsRow}
            >
              {targets.filter(isInteractableAuthor).map((peer) => (
                <TargetAvatar
                  key={peer.userId ?? ''}
                  peer={peer}
                  selected={selectedIds.has(peer.userId ?? '')}
                  onToggle={toggleTarget}
                />
              ))}
            </ScrollView>
          )}
          {selectedIds.size > 0 ? (
            <View style={styles.composeRow}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Add a message (optional)"
                placeholderTextColor={themeColors.textMuted}
                autoCapitalize="sentences"
                style={styles.messageInput}
                testID="share-modal-message"
              />
              <Pressable
                onPress={handleSend}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Send"
                testID="share-modal-send"
                style={[styles.sendButton, sending && styles.actionRowDisabled]}
              >
                {sending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Feather name="arrow-up" size={18} color="#ffffff" />
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasLink ? (
        <>
          <ShareRow
            icon={copied ? 'check' : 'link'}
            label="Copy link"
            sublabel={copied ? 'Link copied' : undefined}
            onPress={handleCopyLink}
            disabled={copying}
            testID="share-modal-copy-link"
          />
          <ShareRow
            icon="share"
            label="Share via…"
            onPress={handleSystemShare}
            testID="share-modal-system-share"
          />
        </>
      ) : null}
    </View>
  );
};

export const ShareModalHost: React.FC = () => {
  const {
    visible,
    rendered: renderedConfig,
    requestClose: handleRequestClose,
  } = useSingletonSurfaceHost(shareModalStore);

  return (
    <OverlayModalSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      zIndex={190}
      maxBackdropOpacity={0.45}
      paddingTop={26}
      paddingHorizontal={24}
      minBottomPadding={18}
    >
      {renderedConfig ? (
        // Key by config identity: a fresh share always starts with a clean
        // selection / message / copied state.
        <ShareModalContent
          key={`${renderedConfig.kind}:${renderedConfig.id}`}
          config={renderedConfig}
        />
      ) : null}
    </OverlayModalSheet>
  );
};

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    color: themeColors.textPrimary,
    fontSize: 18,
  },
  subtitle: {
    marginTop: 4,
    textAlign: 'center',
    color: themeColors.textMuted,
  },
  sendSection: {
    marginTop: 18,
  },
  sectionLabel: {
    color: themeColors.textMuted,
    marginBottom: 10,
  },
  targetsLoading: {
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetsRow: {
    gap: 14,
    paddingRight: 8,
  },
  targetCell: {
    width: 64,
    alignItems: 'center',
  },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingSelected: {
    borderColor: themeColors.primary,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: themeColors.textPrimary,
  },
  avatarCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: themeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  targetName: {
    marginTop: 4,
    color: themeColors.textPrimary,
    maxWidth: 64,
  },
  composeRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  messageInput: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    color: themeColors.textPrimary,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: themeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionRowDisabled: {
    opacity: 0.6,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
  },
  actionLabel: {
    color: themeColors.textPrimary,
  },
  actionSublabel: {
    color: '#16a34a',
  },
});

export default ShareModalHost;
