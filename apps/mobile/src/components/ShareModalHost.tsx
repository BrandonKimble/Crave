import React from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { Text } from './ui/Text';
import { colors as themeColors } from '../constants/theme';
import OverlayModalSheet from '../overlays/OverlayModalSheet';
import { favoriteListsService } from '../services/favorite-lists';
import { messagingService, type ConversationPeer } from '../services/messaging';
import { announceFailureIfOnline, showAppModal } from './app-modal-store';
import {
  buildShareLinkPath,
  dismissShareModal,
  SHARE_BASE_URL,
  shareKindHasPublicLink,
  useShareModalConfig,
  type ShareModalConfig,
} from './share-modal-store';

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

const peerDisplayName = (peer: ConversationPeer): string =>
  peer.displayName ?? peer.username ?? 'Crave user';

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
    onPress={() => onToggle(peer.userId)}
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

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

  // Lists without a known slug enable share on demand (owner path — the same
  // service the W3F long-press Share action used).
  const resolveLinkUrl = React.useCallback(async (): Promise<string> => {
    if (config.kind === 'list' && !config.listShareSlug) {
      const enabled = await favoriteListsService.enableShare(config.id);
      const path = buildShareLinkPath({ ...config, listShareSlug: enabled.shareSlug });
      if (path == null) {
        throw new Error('no share path');
      }
      return `${SHARE_BASE_URL}${path}`;
    }
    const path = buildShareLinkPath(config);
    if (path == null) {
      throw new Error('no share path');
    }
    return `${SHARE_BASE_URL}${path}`;
  }, [config]);

  const handleCopyLink = React.useCallback(() => {
    setCopying(true);
    resolveLinkUrl()
      .then((url) => {
        Clipboard.setString(url);
        setCopied(true);
      })
      .catch(() => {
        announceFailureIfOnline();
      })
      .finally(() => {
        setCopying(false);
      });
  }, [resolveLinkUrl]);

  const handleSystemShare = React.useCallback(() => {
    resolveLinkUrl()
      .then((url) =>
        Share.share({ message: config.title ? `${config.title} · ${url}` : url }).catch(
          () => undefined
        )
      )
      .catch(() => {
        announceFailureIfOnline();
      });
  }, [config.title, resolveLinkUrl]);

  const handleSend = React.useCallback(() => {
    if (selectedIds.size === 0 || sending) {
      return;
    }
    setSending(true);
    const nameById = new Map(targets.map((t) => [t.userId, peerDisplayName(t)]));
    messagingService
      .shareFanOut({
        recipientUserIds: [...selectedIds],
        sharedEntityKind: config.kind,
        sharedEntityId: config.id,
        body: message.trim() ? message.trim() : undefined,
      })
      .then(({ results }) => {
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
  }, [config.id, config.kind, message, selectedIds, sending, targets]);

  const hasLink = shareKindHasPublicLink(config.kind);
  const showSendSection = targetsQuery.isPending || targets.length > 0;

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
              {targets.map((peer) => (
                <TargetAvatar
                  key={peer.userId}
                  peer={peer}
                  selected={selectedIds.has(peer.userId)}
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
  const config = useShareModalConfig();
  const visible = config != null;
  // Keep the last config through the exit animation (same pattern as AppModalHost).
  const lastConfigRef = React.useRef(config);
  if (config != null) {
    lastConfigRef.current = config;
  }
  const renderedConfig = config ?? lastConfigRef.current;

  const handleRequestClose = React.useCallback((): void => {
    if (config != null) {
      dismissShareModal(config);
    }
  }, [config]);

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
