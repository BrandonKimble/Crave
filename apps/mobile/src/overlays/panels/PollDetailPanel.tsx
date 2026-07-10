import React from 'react';
import {
  Dimensions,
  Image,
  InteractionManager,
  Keyboard,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { io } from 'socket.io-client';
import {
  Heart,
  MessageCircle,
  Reply as ReplyIcon,
  Sparkles,
  X as LucideX,
} from 'lucide-react-native';

import { announceFailureIfOnline, showAppModal, Text } from '../../components';
import { SceneLoadingSurface } from '../../components/skeletons';
import { colors as themeColors } from '../../constants/theme';
import { EntityLink } from '../../components/ui/EntityLink';
import type { EntityRefType } from '../../navigation/runtime/entity-ref-action-policy';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import {
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import type { SearchRoutePublishedSceneParts } from '../searchOverlayRouteHostContract';
import { normalizeSearchRouteSceneStackShellSpec } from '../searchOverlayRouteHostContract';
import { useQuery } from '@tanstack/react-query';
import { useAuthController } from '../../hooks/use-auth-controller';
import {
  deletePollComment,
  editPollComment,
  fetchPoll,
  fetchPollLeaderboard,
  listPollComments,
  postPollComment,
  togglePollCommentLike,
  type EntitySpan,
  type Poll,
  type PollComment,
  type PollCommentSort,
  type PollCommentUser,
  type PollCreator,
  type PollLeaderboardEntry,
} from '../../services/polls';
import { PollCandidateBars } from './PollCandidateBars';
import {
  MAX_THREAD_INDENT,
  THREAD_INDENT_STEP,
  buildThreadTree,
  type ThreadItem,
  type ThreadNode,
} from './pollThreadModel';
import { createProfileQueryOptions } from './profileSceneQueryOptions';
import { API_BASE_URL } from '../../services/api';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type UsePollDetailPanelSpecOptions = {
  visible: boolean;
  pollId: string | null;
  poll?: Poll | null;
  // Return-to-origin foundation P4 (design §Restore step 5). The comment a cross-surface reveal
  // launched from, carried back into the route params ONLY when the pop-to-restore dismiss
  // re-pushes this poll. The panel resolves it to its row POST-fetch and scrolls there + flashes
  // it. Undefined/null on an organic open (top-of-thread, no anchor).
  commentAnchorId?: string | null;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
};

// Resolve a comment anchor id → the index of the TOP-LEVEL thread node whose subtree contains
// it. The FlashList `data` is the array of top-level ThreadNodes (each renders its whole reply
// subtree), so a nested reply anchor must scroll to the ROOT of its subtree — that brings the
// thread containing the comment into view; the per-row flash then pinpoints the exact comment.
// Returns -1 when the comment is absent (deleted / reordered out / never present) so the caller
// can DEGRADE to top-of-thread. Walks each subtree depth-first — threads are shallow (indent
// capped at MAX_THREAD_INDENT) so this stays cheap.
const resolveAnchorNodeIndex = (tree: ThreadNode[], commentId: string): number => {
  const subtreeContains = (node: ThreadNode): boolean => {
    if (node.comment.commentId === commentId) {
      return true;
    }
    return node.children.some(subtreeContains);
  };
  return tree.findIndex(subtreeContains);
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const resolveUserName = (user: PollCommentUser): string =>
  user.displayName ?? user.username ?? 'Member';

const resolveCreatorName = (creator: PollCreator | undefined): string =>
  creator?.origin === 'user' ? (creator.displayName ?? creator.username ?? 'Member') : 'Crave';

// ─── Entity-highlighted comment body ─────────────────────────────────────────

type BodySegment = { text: string; entity: EntitySpan | null };

const buildBodySegments = (body: string, spans: EntitySpan[] | null): BodySegment[] => {
  if (!spans || spans.length === 0) {
    return [{ text: body, entity: null }];
  }
  const sorted = [...spans]
    .filter((s) => s && s.start >= 0 && s.end <= body.length && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) continue; // skip overlaps
    if (span.start > cursor) {
      segments.push({ text: body.slice(cursor, span.start), entity: null });
    }
    segments.push({ text: body.slice(span.start, span.end), entity: span });
    cursor = span.end;
  }
  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), entity: null });
  }
  return segments;
};

type CommentBodyProps = {
  comment: PollComment;
  // When the reply was flattened past the indent cap, prepend an @mention of the parent's
  // author so the reply target stays legible despite losing the visual nesting.
  mentionUser: PollCommentUser | null;
};

const CommentBody = React.memo(({ comment, mentionUser }: CommentBodyProps) => {
  const segments = React.useMemo(
    () => buildBodySegments(comment.body, comment.entitySpans),
    [comment.body, comment.entitySpans]
  );
  return (
    <Text variant="body" style={styles.commentBody}>
      {mentionUser ? (
        <Text style={styles.mentionPrefix}>{`@${resolveUserName(mentionUser)} `}</Text>
      ) : null}
      {segments.map((segment, index) => {
        if (!segment.entity) return segment.text;
        // S-D.1: every gazetteer-resolved span renders through THE EntityLink — the tap's
        // meaning (restaurant world / skip-LLM entity desire / child push) is resolved by
        // resolveEntityRefAction, not a per-surface fork. An unresolved span (no entityId)
        // renders the span styling with no press affordance, exactly as before.
        return (
          <EntityLink
            key={index}
            entityRef={{
              entityId: segment.entity.entityId ?? '',
              entityType: segment.entity.type as EntityRefType,
              label: segment.entity.name || segment.entity.text,
            }}
          >
            {segment.text}
          </EntityLink>
        );
      })}
    </Text>
  );
});
CommentBody.displayName = 'CommentBody';

const CommentAvatar = ({ user }: { user: PollCommentUser }) => {
  if (user.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={styles.commentAvatar} />;
  }
  const initial = resolveUserName(user).trim().charAt(0).toUpperCase() || 'M';
  return (
    <View style={styles.commentAvatarFallback}>
      <Text variant="caption" weight="semibold" style={styles.commentAvatarInitial}>
        {initial}
      </Text>
    </View>
  );
};

// ─── Thread tree ─────────────────────────────────────────────────────────────

// Thread flattening + collapse logic lives in ./pollThreadModel (pure, unit-tested
// in pollThreadModel.spec.ts).

// ─── Inline composer (reply / edit) ──────────────────────────────────────────
// Holds its own draft so keystrokes don't re-render the whole thread.

type InlineComposerProps = {
  placeholder: string;
  initialValue?: string;
  submitLabel: string;
  submitting: boolean;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
};

const InlineComposer = ({
  placeholder,
  initialValue = '',
  submitLabel,
  submitting,
  autoFocus = true,
  onSubmit,
  onCancel,
}: InlineComposerProps) => {
  const [text, setText] = React.useState(initialValue);
  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !submitting;
  return (
    <View style={styles.inlineComposer}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={themeColors.textMuted}
        style={styles.inlineComposerInput}
        autoFocus={autoFocus}
        multiline
      />
      <View style={styles.inlineComposerActions}>
        <Pressable onPress={onCancel} hitSlop={6} accessibilityRole="button">
          <Text variant="caption" weight="semibold" style={styles.inlineComposerCancel}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={() => canSubmit && onSubmit(trimmed)}
          disabled={!canSubmit}
          style={[styles.inlineComposerSubmit, !canSubmit && styles.composeButtonDisabled]}
          accessibilityRole="button"
        >
          <Text variant="caption" weight="semibold" style={styles.composeButtonText}>
            {submitting ? '…' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

type PollCommentRowProps = {
  item: ThreadItem;
  isOwn: boolean;
  canReply: boolean;
  isReplying: boolean;
  isEditing: boolean;
  // P4 return-to-origin anchor flash — true for the exact comment a pop-to-restore dismiss
  // returned us to, for the brief flash window after the scroll-to lands.
  isAnchorHighlighted: boolean;
  submitting: boolean;
  onLike: (comment: PollComment) => void;
  onStartReply: (comment: PollComment) => void;
  onStartEdit: (comment: PollComment) => void;
  onDelete: (comment: PollComment) => void;
  onSubmitEdit: (text: string) => void;
  onCancelCompose: () => void;
  onToggleCollapse: (commentId: string) => void;
};

const PollCommentRow = React.memo(
  ({
    item,
    isOwn,
    canReply,
    isReplying,
    isEditing,
    isAnchorHighlighted,
    submitting,
    onLike,
    onStartReply,
    onStartEdit,
    onDelete,
    onSubmitEdit,
    onCancelCompose,
    onToggleCollapse,
  }: PollCommentRowProps) => {
    const { comment, depth, isCollapsed, hiddenCount, mentionUser } = item;
    const liked = comment.currentUserLiked;
    const indentLevels = Math.min(depth, MAX_THREAD_INDENT);
    return (
      <View
        style={[
          styles.commentRow,
          depth > 0 && styles.commentRowNested,
          isReplying && styles.commentRowReplying,
          isAnchorHighlighted && styles.commentRowAnchorHighlight,
        ]}
      >
        {indentLevels > 0 ? (
          <View style={styles.threadRails} pointerEvents="none">
            {Array.from({ length: indentLevels }).map((_, railIndex) => (
              <View key={railIndex} style={styles.threadRail} />
            ))}
          </View>
        ) : null}
        <CommentAvatar user={comment.user} />
        <View style={styles.commentContent}>
          <Pressable
            testID={hiddenCount > 0 ? 'poll-comment-meta-collapsible' : undefined}
            onPress={hiddenCount > 0 ? () => onToggleCollapse(comment.commentId) : undefined}
            disabled={hiddenCount === 0}
            style={styles.commentMetaRow}
            accessibilityRole={hiddenCount > 0 ? 'button' : undefined}
            accessibilityLabel={
              hiddenCount > 0
                ? isCollapsed
                  ? `Show ${hiddenCount} ${hiddenCount === 1 ? 'reply' : 'replies'}`
                  : `Hide ${hiddenCount} ${hiddenCount === 1 ? 'reply' : 'replies'}`
                : undefined
            }
          >
            <Text
              variant="caption"
              weight="semibold"
              style={styles.commentAuthor}
              numberOfLines={1}
            >
              {resolveUserName(comment.user)}
            </Text>
            <Text variant="caption" style={styles.commentTime}>
              {formatRelativeTime(comment.loggedAt)}
              {comment.editedAt ? ' · edited' : ''}
            </Text>
            {isCollapsed && hiddenCount > 0 ? (
              <Text variant="caption" weight="semibold" style={styles.collapsedHint}>
                +{hiddenCount} {hiddenCount === 1 ? 'reply' : 'replies'}
              </Text>
            ) : null}
          </Pressable>
          {/* The comment body always stays mounted; collapsing animates the REPLY subtree
              (rendered by the parent PollThreadNode), not this comment. */}
          <>
            {isEditing ? (
              <InlineComposer
                placeholder="Edit your comment…"
                initialValue={comment.body}
                submitLabel="Save"
                submitting={submitting}
                onSubmit={onSubmitEdit}
                onCancel={onCancelCompose}
              />
            ) : (
              <CommentBody comment={comment} mentionUser={mentionUser} />
            )}
            {!isEditing ? (
              <View style={styles.commentActions}>
                <Pressable
                  onPress={() => onLike(comment)}
                  style={styles.likeButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={liked ? 'Remove endorsement' : 'Endorse comment'}
                >
                  <Heart
                    size={14}
                    color={liked ? ACCENT : themeColors.textMuted}
                    fill={liked ? ACCENT : 'transparent'}
                    strokeWidth={2}
                  />
                  <Text
                    variant="caption"
                    weight={liked ? 'semibold' : 'regular'}
                    style={[styles.likeCount, liked && styles.likeCountActive]}
                  >
                    {comment.score}
                  </Text>
                </Pressable>
                {canReply ? (
                  <Pressable
                    onPress={() => onStartReply(comment)}
                    hitSlop={8}
                    style={styles.replyButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Reply to ${resolveUserName(comment.user)}`}
                  >
                    <ReplyIcon size={14} color={themeColors.textMuted} strokeWidth={2} />
                  </Pressable>
                ) : null}
                {isOwn ? (
                  <Pressable
                    onPress={() => onStartEdit(comment)}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text variant="caption" weight="semibold" style={styles.commentAction}>
                      Edit
                    </Text>
                  </Pressable>
                ) : null}
                {isOwn ? (
                  <Pressable
                    onPress={() => onDelete(comment)}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text
                      variant="caption"
                      weight="semibold"
                      style={styles.commentActionDestructive}
                    >
                      Delete
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        </View>
      </View>
    );
  }
);
PollCommentRow.displayName = 'PollCommentRow';

const THREAD_COLLAPSE_DURATION_MS = 200;

// Keep-mounted accordion: the reply subtree stays in the tree and animates its measured
// height + opacity closed (NOT a layout-animation primitive — those jitter on nested
// remeasure). overflow:hidden clips the content as height shrinks; the inner View reports
// its natural height via onLayout so re-expand always lands on the right size.
const CollapsibleSubtree: React.FC<{ collapsed: boolean; children: React.ReactNode }> = ({
  collapsed,
  children,
}) => {
  const measuredHeight = useSharedValue(0);
  const measuredReady = useSharedValue(false);
  const progress = useSharedValue(collapsed ? 0 : 1); // 1 = fully open

  React.useEffect(() => {
    progress.value = withTiming(collapsed ? 0 : 1, { duration: THREAD_COLLAPSE_DURATION_MS });
  }, [collapsed, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (!measuredReady.value) {
      // Before the first measure: natural height when open (no clip flash); fully closed
      // when initially collapsed. Threads load expanded, so the open path is the common one.
      return p > 0.001 ? { opacity: p } : { height: 0, opacity: 0 };
    }
    return { height: measuredHeight.value * p, opacity: p };
  });

  const handleContentLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      if (next <= 0) return;
      measuredHeight.value = next;
      measuredReady.value = true;
    },
    [measuredHeight, measuredReady]
  );

  return (
    <Reanimated.View style={[styles.collapsibleSubtree, animatedStyle]}>
      <View onLayout={handleContentLayout}>{children}</View>
    </Reanimated.View>
  );
};

type PollThreadNodeProps = {
  node: ThreadNode;
  collapsedComments: ReadonlySet<string>;
  viewerUserId: string | null;
  canReply: boolean;
  replyTarget: string | null;
  editTarget: string | null;
  // P4 return-to-origin anchor flash — the exact comment the dismiss returned us to (or null).
  highlightedCommentId: string | null;
  submitting: boolean;
  onLike: (comment: PollComment) => void;
  onStartReply: (comment: PollComment) => void;
  onStartEdit: (comment: PollComment) => void;
  onDelete: (comment: PollComment) => void;
  onSubmitEdit: (text: string) => void;
  onCancelCompose: () => void;
  onToggleCollapse: (commentId: string) => void;
};

// One top-level comment + its whole subtree = one self-contained accordion item the
// FlashList virtualizes. Recurses into replies; each level's collapse animates its own
// children, so nested collapse state is preserved while hidden.
const PollThreadNode = React.memo((props: PollThreadNodeProps) => {
  const { node, collapsedComments } = props;
  const { comment } = node;
  const isCollapsed = collapsedComments.has(comment.commentId);
  const rowItem = React.useMemo<ThreadItem>(
    () => ({
      comment,
      depth: node.depth,
      isCollapsed,
      hiddenCount: node.descendantCount,
      mentionUser: node.mentionUser,
    }),
    [comment, isCollapsed, node.depth, node.descendantCount, node.mentionUser]
  );
  return (
    <View>
      <PollCommentRow
        item={rowItem}
        isOwn={props.viewerUserId != null && comment.user.userId === props.viewerUserId}
        canReply={props.canReply}
        isReplying={props.replyTarget === comment.commentId}
        isEditing={props.editTarget === comment.commentId}
        isAnchorHighlighted={props.highlightedCommentId === comment.commentId}
        submitting={props.submitting}
        onLike={props.onLike}
        onStartReply={props.onStartReply}
        onStartEdit={props.onStartEdit}
        onDelete={props.onDelete}
        onSubmitEdit={props.onSubmitEdit}
        onCancelCompose={props.onCancelCompose}
        onToggleCollapse={props.onToggleCollapse}
      />
      {node.children.length > 0 ? (
        <CollapsibleSubtree collapsed={isCollapsed}>
          {node.children.map((child) => (
            <PollThreadNode key={child.comment.commentId} {...props} node={child} />
          ))}
        </CollapsibleSubtree>
      ) : null}
    </View>
  );
});
PollThreadNode.displayName = 'PollThreadNode';

// ─── Panel spec ──────────────────────────────────────────────────────────────

// The header (static 'Poll' title + close action) no longer rides this spec — it is extracted to
// the persistent-header descriptor below (P3). The descriptor's close re-sources the same
// closeActiveRoute via the route controller.
export const usePollDetailPanelSpec = ({
  visible,
  pollId,
  poll: pollSeed,
  commentAnchorId = null,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
}: UsePollDetailPanelSpecOptions): SearchRoutePublishedSceneParts => {
  const insets = useSafeAreaInsets();
  // The bottom tab bar leaves via the DERIVED nav-out rule (nav-out-derivation-store):
  // pollDetail is a child scene, so the nav-push motion fires by construction (§D).
  const { isSignedIn } = useAuthController();
  const { data: viewerProfile } = useQuery({
    ...createProfileQueryOptions(),
    enabled: isSignedIn,
  });
  const viewerUserId = viewerProfile?.userId ?? null;

  const [poll, setPoll] = React.useState<Poll | null>(pollSeed ?? null);
  const [comments, setComments] = React.useState<PollComment[]>([]);
  const [leaderboard, setLeaderboard] = React.useState<PollLeaderboardEntry[]>([]);
  const [sort, setSort] = React.useState<PollCommentSort>('top');
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  // Only one comment can be in reply/edit mode at a time (tracked by commentId).
  const [replyTarget, setReplyTarget] = React.useState<string | null>(null);
  const [editTarget, setEditTarget] = React.useState<string | null>(null);
  const [mutatingComment, setMutatingComment] = React.useState(false);
  // Accordion collapse: tapping a comment's header animates its REPLY subtree closed
  // (the comment body stays). Kept-mounted so nested collapse state survives + no remount.
  const [collapsedComments, setCollapsedComments] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );
  const handleToggleCollapse = React.useCallback((commentId: string) => {
    setCollapsedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

  // ─── P4 return-to-origin: scroll-to + flash-highlight the anchor comment ─────
  // The FlashList ref drives the post-fetch scrollToIndex; the panel owns it so it stays the
  // SOLE scroll writer for that frame (no MVCP fighting it — MVCP is disabled on the thread via
  // flashListProps below, per the documented MVCP-wrong-row failure class). highlightedCommentId
  // = the comment we flashed, cleared after a brief window so the flash is a one-shot pulse.
  const threadListRef = React.useRef<FlashListRef<ThreadNode> | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = React.useState<string | null>(null);
  // One-shot guard: resolve+scroll+flash exactly once per (open + anchor), never re-firing on a
  // later organic refetch/socket update (which would yank the user back to the anchor mid-read).
  const consumedAnchorRef = React.useRef<string | null>(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRetryRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the header instantly from the feed card's snapshot.
  React.useEffect(() => {
    if (pollSeed) setPoll(pollSeed);
  }, [pollSeed]);

  // Reset when the sheet closes so a reopen starts clean.
  React.useEffect(() => {
    if (!visible) {
      setComments([]);
      setLeaderboard([]);
      setDraft('');
      setSort('top');
      setReplyTarget(null);
      setEditTarget(null);
      setCollapsedComments(new Set());
      // P4 — clear the anchor flash + re-arm the one-shot guard so the NEXT open (which may carry
      // a fresh anchor, or none) resolves cleanly. Timers are torn down by their own effect.
      setHighlightedCommentId(null);
      consumedAnchorRef.current = null;
    }
  }, [visible]);

  const refresh = React.useCallback(async () => {
    if (!pollId) return;
    const [nextComments, nextLeaderboard] = await Promise.all([
      listPollComments(pollId, sort),
      fetchPollLeaderboard(pollId),
    ]);
    setComments(nextComments);
    setLeaderboard(nextLeaderboard);
  }, [pollId, sort]);

  // Keep refresh reachable from the socket effect without re-subscribing on every
  // sort/poll change.
  const refreshRef = React.useRef(refresh);
  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Live updates: the API broadcasts `poll:update` on the /polls namespace for
  // every comment/endorsement/like mutation (PollsGateway). Refresh this poll's
  // thread + leaderboard when an update for THIS poll arrives — deferred past any
  // in-flight gesture so the sheet handoff stays smooth.
  React.useEffect(() => {
    if (!visible || !pollId) return;
    const baseUrl = typeof API_BASE_URL === 'string' ? API_BASE_URL : '';
    if (!baseUrl) return;
    const base = baseUrl.replace(/\/api(?:\/v\d+)?$/, '');
    const socket = io(`${base}/polls`, { transports: ['websocket'] });
    let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const handleUpdate = (payload: { pollId?: string }) => {
      if (payload?.pollId !== pollId || task) return; // global broadcast — only ours; coalesce bursts
      task = InteractionManager.runAfterInteractions(() => {
        task = null;
        void refreshRef.current();
      });
    };
    socket.on('poll:update', handleUpdate);
    return () => {
      socket.off('poll:update', handleUpdate);
      socket.disconnect();
      task?.cancel();
    };
  }, [visible, pollId]);

  React.useEffect(() => {
    if (!visible || !pollId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      listPollComments(pollId, sort),
      fetchPollLeaderboard(pollId),
      pollSeed ? Promise.resolve(pollSeed) : fetchPoll(pollId),
    ])
      .then(([nextComments, nextLeaderboard, nextPoll]) => {
        if (!active) return;
        setComments(nextComments);
        setLeaderboard(nextLeaderboard);
        if (nextPoll) setPoll(nextPoll);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, pollId, sort, pollSeed]);

  const handlePost = React.useCallback(async () => {
    const body = draft.trim();
    if (!body || posting || !pollId) return;
    if (!isSignedIn) {
      showAppModal({
        title: 'Sign in to comment',
        message: 'Join the discussion to weigh in on this poll.',
      });
      return;
    }
    setPosting(true);
    try {
      // The chin doubles as the reply composer: when a reply target is pinned, post under it.
      await postPollComment(pollId, { body, parentCommentId: replyTarget ?? undefined });
      setDraft('');
      setReplyTarget(null);
      await refresh();
    } catch (error) {
      announceFailureIfOnline();
    } finally {
      setPosting(false);
    }
  }, [draft, isSignedIn, pollId, posting, refresh, replyTarget]);

  const handleLike = React.useCallback(
    async (comment: PollComment) => {
      if (!isSignedIn) {
        showAppModal({
          title: 'Sign in to endorse',
          message: 'Join the discussion to weigh in on this poll.',
        });
        return;
      }
      const willLike = !comment.currentUserLiked;
      setComments((prev) =>
        prev.map((row) =>
          row.commentId === comment.commentId
            ? {
                ...row,
                currentUserLiked: willLike,
                score: Math.max(0, row.score + (willLike ? 1 : -1)),
              }
            : row
        )
      );
      try {
        const result = await togglePollCommentLike(comment.commentId);
        setComments((prev) =>
          prev.map((row) =>
            row.commentId === comment.commentId
              ? { ...row, currentUserLiked: result.liked, score: result.score }
              : row
          )
        );
      } catch {
        void refresh(); // reconcile on failure
      }
    },
    [isSignedIn, refresh]
  );

  const isActive = poll?.state === 'active';
  const candidates = React.useMemo(
    () =>
      leaderboard.map((entry) => ({
        rank: entry.rank,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        name: entry.name,
        distinctEndorsers: entry.distinctEndorsers,
        currentUserEndorsed: entry.currentUserEndorsed,
      })),
    [leaderboard]
  );

  // Keep the panel's authoritative leaderboard in sync with the standings the
  // endorse toggle settles against (it can reorder), so the board doesn't snap
  // back to the pre-endorse order on the next render.
  const handleCandidatesSettled = React.useCallback((settled: typeof candidates) => {
    setLeaderboard((prev) => {
      const byId = new Map(prev.map((entry) => [entry.subjectId, entry]));
      return settled.map((candidate, index) => {
        const base = byId.get(candidate.subjectId);
        return base
          ? {
              ...base,
              rank: candidate.rank,
              distinctEndorsers: candidate.distinctEndorsers,
              currentUserEndorsed: candidate.currentUserEndorsed,
            }
          : ({ ...candidate, rank: index + 1 } as PollLeaderboardEntry);
      });
    });
  }, []);

  // Collapse-independent tree: only rebuilds when the comment data changes. Collapse state
  // lives in `collapsedComments` and is applied at render time by each PollThreadNode, so
  // toggling collapse never re-tiles the FlashList data (no scroll jump from data churn).
  const threadTree = React.useMemo(() => buildThreadTree(comments), [comments]);

  // ─── P4 return-to-origin: anchor resolve → scroll-to-index → flash (POST-FETCH) ─────────────
  // Gated on the panel's own content-readiness signal — visible AND the thread fetch has SETTLED
  // (`!loading`) AND the built tree has rows. This is the post-fetch equivalent of P3's
  // "first non-skeleton commit" gate: we MUST run against the CURRENT comments (so the index is
  // real) and NEVER on the bare re-mount frame (the #1 jump-to-top cause — a deep scrollToIndex
  // before the list has extent clamps to 0).
  //
  // TWO deliberately-split effects:
  //   • LAUNCH (this effect) re-runs as the thread loads (threadTree dep) but burns the one-shot
  //     guard (consumedAnchorRef) ONLY on a real resolve (index >= 0). A partial/paginated load
  //     that doesn't yet contain the anchor retries on the next load instead of burning the
  //     guard; once resolved, every later run (incl. live `poll:update` thread churn) is a
  //     guarded no-op. It has NO cleanup.
  //   • TEARDOWN (the effect just below) owns the in-flight scroll/flash timers and is keyed ONLY
  //     on the anchor + visibility — NOT the thread. So a `poll:update` landing inside the 1.6s
  //     flash window can never tear the restore down (which previously stranded the highlight
  //     forever: the threadTree-keyed cleanup cancelled the pending clear, then the guarded
  //     re-run never re-armed it).
  //
  // Degrade-gracefully contract: a missing/reordered/deleted anchor (resolveAnchorNodeIndex → -1)
  // does NOTHING (the thread stays at top), never throws. Generalizes to a list-card anchor for
  // bookmarks/profile — same shape: resolve a stable domain id → index against the CURRENT data,
  // scrollToIndex(viewPosition), flash. Only the id→index resolver differs.
  const contentReady = visible && !loading && threadTree.length > 0;
  React.useEffect(() => {
    if (!contentReady || commentAnchorId == null) {
      return;
    }
    if (consumedAnchorRef.current === commentAnchorId) {
      return; // already resolved this anchor for this open
    }
    const index = resolveAnchorNodeIndex(threadTree, commentAnchorId);
    if (index < 0) {
      // Anchor not in the CURRENT thread (deleted/reordered out, or not yet loaded for a future
      // paginated thread). Do NOT burn the guard — a later thread load re-runs this and retries.
      return;
    }
    consumedAnchorRef.current = commentAnchorId; // burn the one-shot guard only on a real resolve

    // scrollToIndex with a small RETRY BUDGET. FlashList 2.x's scrollToIndex resolves once the
    // scroll completes and self-handles not-yet-measured rows, but the row's measured offset can
    // still be provisional on the very first post-fetch frame (header + bars + dynamic comment
    // heights settle over a frame or two). So we re-issue on a bounded schedule (mirrors P3's
    // belt-and-suspenders rAF re-pin) so the target lands at viewPosition once heights are final.
    const MAX_ATTEMPTS = 5;
    const RETRY_SPACING_MS = 80;
    let attempt = 0;
    const scrollToAnchor = (): void => {
      const list = threadListRef.current;
      if (!list?.scrollToIndex) {
        return;
      }
      // viewPosition ~0.3 → the anchor row sits ~a third down the viewport (context above + the
      // comment + its replies below it visible). Not animated: this is a restore, not a gesture.
      void list.scrollToIndex({ index, viewPosition: 0.3, animated: false });
      attempt += 1;
      if (attempt < MAX_ATTEMPTS) {
        anchorRetryRef.current = setTimeout(scrollToAnchor, RETRY_SPACING_MS);
      }
    };
    // Defer the first attempt off the commit so the list has laid out its initial draw batch.
    anchorRetryRef.current = setTimeout(scrollToAnchor, 0);

    // FLASH-HIGHLIGHT the exact comment (default tasteful pulse, tunable later like the cutout).
    setHighlightedCommentId(commentAnchorId);
    highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 1600);
    // No cleanup here on purpose — the timers are owned by the teardown effect below so live
    // thread churn (threadTree dep) never tears down an in-flight restore.
  }, [commentAnchorId, contentReady, threadTree]);

  // Teardown for the anchor restore's timers — keyed ONLY on the anchor + visibility (NOT the
  // thread), so it fires on anchor-change / dismiss / unmount but is immune to `poll:update`
  // thread churn. This is the half that makes the LAUNCH effect's one-shot guarantee real.
  React.useEffect(() => {
    return () => {
      if (anchorRetryRef.current) {
        clearTimeout(anchorRetryRef.current);
        anchorRetryRef.current = null;
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [commentAnchorId, visible]);

  const canReply = isActive && isSignedIn;

  const handleStartReply = React.useCallback(
    (comment: PollComment) => {
      if (!isSignedIn) {
        showAppModal({
          title: 'Sign in to reply',
          message: 'Join the discussion to weigh in on this poll.',
        });
        return;
      }
      setEditTarget(null);
      setReplyTarget(comment.commentId);
    },
    [isSignedIn]
  );

  const handleStartEdit = React.useCallback((comment: PollComment) => {
    setReplyTarget(null);
    setEditTarget(comment.commentId);
  }, []);

  const handleCancelCompose = React.useCallback(() => {
    setReplyTarget(null);
    setEditTarget(null);
  }, []);

  const handleSubmitEdit = React.useCallback(
    async (text: string) => {
      const commentId = editTarget;
      if (!commentId || mutatingComment) return;
      setMutatingComment(true);
      try {
        await editPollComment(commentId, { body: text });
        setEditTarget(null);
        await refresh();
      } catch (error) {
        announceFailureIfOnline();
      } finally {
        setMutatingComment(false);
      }
    },
    [editTarget, mutatingComment, refresh]
  );

  const handleDelete = React.useCallback(
    (comment: PollComment) => {
      showAppModal({
        title: 'Delete comment?',
        message: 'This removes your comment from the discussion.',
        actions: [
          { label: 'Cancel', style: 'cancel' },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              setMutatingComment(true);
              deletePollComment(comment.commentId)
                .then(() => refresh())
                .catch(() => announceFailureIfOnline())
                .finally(() => setMutatingComment(false));
            },
          },
        ],
      });
    },
    [refresh]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: ThreadNode }) => (
      <PollThreadNode
        node={item}
        collapsedComments={collapsedComments}
        viewerUserId={viewerUserId}
        canReply={canReply}
        replyTarget={replyTarget}
        editTarget={editTarget}
        highlightedCommentId={highlightedCommentId}
        submitting={mutatingComment}
        onLike={handleLike}
        onStartReply={handleStartReply}
        onStartEdit={handleStartEdit}
        onDelete={handleDelete}
        onSubmitEdit={handleSubmitEdit}
        onCancelCompose={handleCancelCompose}
        onToggleCollapse={handleToggleCollapse}
      />
    ),
    [
      canReply,
      collapsedComments,
      editTarget,
      handleCancelCompose,
      handleDelete,
      handleLike,
      handleStartEdit,
      handleStartReply,
      handleSubmitEdit,
      handleToggleCollapse,
      highlightedCommentId,
      mutatingComment,
      replyTarget,
      viewerUserId,
    ]
  );
  const keyExtractor = React.useCallback((item: ThreadNode) => item.comment.commentId, []);

  const headerTitle = poll?.question ?? 'Poll';

  const listHeaderComponent = (
    <View>
      <View style={styles.pollHeader}>
        <View style={styles.creatorRow}>
          {poll?.creator?.origin === 'user' && poll.creator.avatarUrl ? (
            <Image source={{ uri: poll.creator.avatarUrl }} style={styles.creatorAvatar} />
          ) : poll?.creator?.origin === 'user' ? (
            <View style={styles.creatorAvatarFallback}>
              <Text variant="caption" weight="semibold" style={styles.creatorAvatarInitial}>
                {resolveCreatorName(poll?.creator).charAt(0).toUpperCase() || 'M'}
              </Text>
            </View>
          ) : (
            <View style={styles.creatorAvatarApp}>
              <Sparkles size={13} color={ACCENT} strokeWidth={2.2} />
            </View>
          )}
          <Text variant="caption" weight="semibold" style={styles.creatorName} numberOfLines={1}>
            {resolveCreatorName(poll?.creator)}
          </Text>
          {isActive ? (
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text variant="caption" weight="semibold" style={styles.liveText}>
                live
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="title" weight="semibold" style={styles.question}>
          {headerTitle}
        </Text>
      </View>

      {candidates.length > 0 ? (
        <View style={styles.barsBlock}>
          <PollCandidateBars
            pollId={pollId ?? ''}
            candidates={candidates}
            interactive={Boolean(isActive)}
            onCandidatesChange={handleCandidatesSettled}
          />
        </View>
      ) : (
        <View style={styles.emptyStandings}>
          <Text variant="caption" style={styles.emptyStandingsText}>
            No standings yet — start the discussion below to put a spot on the board.
          </Text>
        </View>
      )}

      <View style={styles.discussionHeader}>
        <Text variant="subtitle" weight="semibold" style={styles.discussionTitle}>
          Discussion
        </Text>
        <View style={styles.sortToggle}>
          <Pressable onPress={() => setSort('top')} hitSlop={6}>
            <Text
              variant="caption"
              weight={sort === 'top' ? 'semibold' : 'regular'}
              style={[styles.sortOption, sort === 'top' && styles.sortOptionActive]}
            >
              Top
            </Text>
          </Pressable>
          <Text variant="caption" style={styles.sortDivider}>
            ·
          </Text>
          <Pressable onPress={() => setSort('new')} hitSlop={6}>
            <Text
              variant="caption"
              weight={sort === 'new' ? 'semibold' : 'regular'}
              style={[styles.sortOption, sort === 'new' && styles.sortOptionActive]}
            >
              New
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // §D: the composer is a "chin" pinned to the BOTTOM of the sheet body frame (chat/
  // Reddit style) — rendered as ListChromeComponent so it rides WITH the sheet (pinned
  // while expanded, moves down on drag-to-dismiss; the body frame translates with the
  // sheet) rather than the full-screen overlay layer. The tab bar is pushed down
  // (the derived nav-out rule), freeing the bottom. `useAnimatedKeyboard` raises it above
  // the keyboard when focused.
  const keyboard = useAnimatedKeyboard();
  // The body frame fills the full sheet height (= screen height) but the sheet is translated
  // DOWN by the expanded snap offset, so the frame's bottom sits `expanded` BELOW the visible
  // screen bottom. Pin the chin `expanded + insets.bottom` up from the frame bottom and it
  // rests just above the home indicator at the visible bottom — and because it lives in the
  // body frame it rides down WITH the sheet on a drag-to-dismiss (the Instagram chin).
  const expandedSnapTop = resolveExpandedTop(searchBarTop, insets.top);
  const composeChinAnimatedStyle = useAnimatedStyle(() => ({
    // useAnimatedKeyboard.height is measured from the screen bottom (it spans the home
    // indicator inset the chin already clears), so lift by height − inset to sit flush on
    // the keyboard instead of leaving an inset-sized gap above it.
    transform: [{ translateY: -Math.max(0, keyboard.height.value - insets.bottom) }],
  }));
  // §D.3 reply-target float: tapping Reply pins a COPY of the target comment directly above
  // the chin input (no virtualized-row animation) and raises the keyboard, so the chin itself
  // becomes the reply composer (handlePost posts under replyTarget).
  const replyTargetComment = React.useMemo(
    () => (replyTarget ? (comments.find((c) => c.commentId === replyTarget) ?? null) : null),
    [comments, replyTarget]
  );
  const composeInputRef = React.useRef<TextInput>(null);
  React.useEffect(() => {
    if (replyTarget) {
      composeInputRef.current?.focus();
    }
  }, [replyTarget]);
  // Active reply composer = modal: a touch/swipe outside it (which dismisses the keyboard —
  // via keyboardShouldPersistTaps on tap, keyboardDismissMode on drag) returns the chin to
  // its inactive state by unpinning the reply target. The draft text is kept. Only armed
  // while a reply is pinned, so it never fights an ordinary keyboard dismissal.
  React.useEffect(() => {
    if (!replyTarget) {
      return;
    }
    const subscription = Keyboard.addListener('keyboardDidHide', () => setReplyTarget(null));
    return () => subscription.remove();
  }, [replyTarget]);
  const composeChin = (
    <Reanimated.View
      style={[
        styles.composeChin,
        { bottom: expandedSnapTop + insets.bottom },
        composeChinAnimatedStyle,
      ]}
    >
      {replyTargetComment ? (
        <View style={styles.replyPinned}>
          <View style={styles.replyPinnedText}>
            <Text
              variant="caption"
              weight="semibold"
              style={styles.replyPinnedLabel}
              numberOfLines={1}
            >
              Replying to {resolveUserName(replyTargetComment.user)}
            </Text>
            <Text variant="caption" style={styles.replyPinnedBody} numberOfLines={1}>
              {replyTargetComment.body}
            </Text>
          </View>
          <Pressable
            onPress={() => setReplyTarget(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            style={styles.replyPinnedCancel}
          >
            <Text style={styles.replyPinnedCancelText}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composeRow}>
        <TextInput
          ref={composeInputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={
            replyTargetComment
              ? `Reply to ${resolveUserName(replyTargetComment.user)}…`
              : 'Add to the discussion…'
          }
          placeholderTextColor={themeColors.textMuted}
          style={styles.composeInput}
          multiline
          testID="poll-detail-composer-input"
        />
        <Pressable
          onPress={() => void handlePost()}
          disabled={posting || draft.trim().length === 0}
          style={[
            styles.composeButton,
            (posting || draft.trim().length === 0) && styles.composeButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
        >
          <Text variant="caption" weight="semibold" style={styles.composeButtonText}>
            {posting ? '…' : 'Post'}
          </Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );

  const emptyComponent = loading ? (
    // PollDetail keeps an opaque white sheetSurface plate under the body (for poll-header
    // readability), so the comment skeleton can't frost-through to the hoisted map here — give it
    // a self-contained frosted backing so its holes still read as frosted windows. insetX={0}: the
    // list's contentContainerStyle already insets the body by OVERLAY_HORIZONTAL_PADDING, so the
    // holes must NOT re-inset (else they double-pad).
    <SceneLoadingSurface rowType="comment" frostBacking insetX={0} />
  ) : (
    <View style={styles.emptyComments}>
      <MessageCircle size={20} color={themeColors.textMuted} strokeWidth={1.8} />
      <Text variant="caption" style={styles.emptyCommentsText}>
        Be the first to weigh in.
      </Text>
    </View>
  );

  // Reserve room for the pinned compose chin so the last comment clears it. The list
  // content ends at the body-frame bottom (which overhangs the screen by `expanded`), so
  // the padding must cover that overhang + the home-indicator inset + the chin's height.
  const contentBottomPadding = expandedSnapTop + insets.bottom + 64;
  const expanded = expandedSnapTop;
  const hidden = SCREEN_HEIGHT + 80;
  const snapPoints = React.useMemo(
    () =>
      snapPointsOverride ?? {
        expanded,
        middle: expanded,
        collapsed: expanded,
        hidden,
      },
    [expanded, hidden, snapPointsOverride]
  );

  // P4 — extraData must change identity when EITHER collapse state OR the anchor flash toggles,
  // so FlashList re-renders the affected rows (collapse hint + the flashed background).
  const listExtraData = React.useMemo(
    () => ({ collapsedComments, highlightedCommentId }),
    [collapsedComments, highlightedCommentId]
  );

  // P4 — DISABLE FlashList's maintainVisibleContentPosition on this thread. MVCP is ON by
  // default in FlashList 2.x (chat-style anchoring) and on a list whose data arrives async +
  // gets a programmatic scrollToIndex it FIGHTS the restore — anchoring an old/placeholder row
  // and landing the scroll on the wrong row (the documented MVCP-wrong-row failure class in
  // CLAUDE.md). The anchor restore (above) is the sole scroll writer for that frame; MVCP must
  // not contend. (The poll-detail thread is not an append/chat feed, so nothing else wants MVCP.)
  const threadFlashListProps = React.useMemo(
    () => ({ maintainVisibleContentPosition: { disabled: true } }),
    []
  );

  return {
    shellSpec: normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'pollDetail',
      snapPoints,
      style: overlaySheetStyles.container,
    }),
    sceneChrome: {
      underlayComponent: null,
      // White, full-bleed sheet (no frosted glass) for the poll-detail scene.
      backgroundComponent: <View style={styles.sheetSurface} />,
      // P3: the poll-detail header is the persistent-header descriptor (registered below) — the
      // per-scene header lane stays NULL (shape-preserving; other chrome surfaces stay).
      headerComponent: null,
      overlayComponent: null,
    },
    sceneBodyContent: {
      surfaceKind: 'list',
      data: threadTree,
      // Collapse state + the P4 anchor flash live outside `data`, so the list re-renders rows
      // when either changes (combined into listExtraData so its identity flips on a flash).
      extraData: listExtraData,
      renderItem,
      keyExtractor,
      estimatedItemSize: 96,
      ListHeaderComponent: listHeaderComponent,
      ListEmptyComponent: emptyComponent,
      ListChromeComponent: composeChin,
    },
    sceneBodyTransport: {
      // P4 — hand the thread's FlashList ref to the panel so the post-fetch anchor restore can
      // scrollToIndex on it as the sole scroll writer for that frame.
      listRef: threadListRef,
      // P4 — disable MVCP so the anchor scrollToIndex isn't fought by chat-style anchoring.
      flashListProps: threadFlashListProps,
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        paddingTop: 12,
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      // Swiping the thread dismisses the keyboard, which (with the keyboardDidHide effect)
      // returns the active reply composer to the inactive chin — the "touch/swipe outside
      // the composer dismisses it" behaviour, without a scroll-blocking overlay.
      keyboardDismissMode: 'on-drag',
      // Over-scroll is enforced no-bounce structurally by BottomSheetScrollContainer so the thread
      // pins at its top and the continuous down-swipe hands off cleanly to the sheet-collapse. (An
      // old per-scene `bounces:true` here was exactly the bug that motivated making it structural.)
    },
  };
};

// ─── Persistent header descriptor (P3, page-switch-master-plan.md §6-P3) ────────────────────
// The poll-detail header is extracted OUT of the panel spec into the hoisted persistent chrome
// (PersistentSheetHeaderHost): the static 'Poll' title + the close button. Close re-sources the
// exact action the inline header used — routeOverlayRouteCommandRuntime.closeActiveRoute — via
// the app-wide route controller hook. The grab-handle tap is the shared promote-to-middle handler
// (PersistentSheetHeaderHost) — not per-scene; dismiss is the close (X) button here only.

const PollDetailPersistentHeaderTitle = React.memo(() => (
  <Text variant="title" weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
    Poll
  </Text>
));
PollDetailPersistentHeaderTitle.displayName = 'PollDetailPersistentHeaderTitle';

const PollDetailPersistentHeaderAction = React.memo(() => {
  const { closeActiveRoute } = useAppOverlayRouteController();
  return (
    <Pressable
      onPress={closeActiveRoute}
      accessibilityRole="button"
      accessibilityLabel="Close poll"
      style={overlaySheetStyles.closeButton}
      hitSlop={8}
    >
      <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
        <LucideX size={20} color="#000000" strokeWidth={2.5} />
      </View>
    </Pressable>
  );
});
PollDetailPersistentHeaderAction.displayName = 'PollDetailPersistentHeaderAction';

registerPersistentHeaderDescriptor('pollDetail', {
  Title: PollDetailPersistentHeaderTitle,
  Action: PollDetailPersistentHeaderAction,
});

const styles = StyleSheet.create({
  // The white body layer sits BELOW the header band so the header plate's grab-handle + close
  // cutouts see through to the shared frosty foundation (not white). The header plate's 3px
  // overlap covers the seam at the top. (Frost foundation → this white layer → thread content.)
  sheetSurface: {
    position: 'absolute',
    top: OVERLAY_TAB_HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  sheetTitle: {
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  pollHeader: {
    marginBottom: 16,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  creatorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BORDER,
  },
  creatorAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorAvatarInitial: {
    color: ACCENT,
    fontSize: 11,
  },
  creatorAvatarApp: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorName: {
    color: themeColors.textBody,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  liveText: {
    color: ACCENT,
  },
  question: {
    color: themeColors.textPrimary,
    lineHeight: 27,
  },
  barsBlock: {
    marginBottom: 20,
  },
  emptyStandings: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  emptyStandingsText: {
    color: themeColors.textBody,
    lineHeight: 18,
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  discussionTitle: {
    color: themeColors.textPrimary,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortOption: {
    color: themeColors.textMuted,
  },
  sortOptionActive: {
    color: themeColors.textPrimary,
  },
  sortDivider: {
    color: themeColors.textMuted,
  },
  composeChin: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  replyPinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  replyPinnedText: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    paddingLeft: 8,
  },
  replyPinnedLabel: {
    color: ACCENT,
  },
  replyPinnedBody: {
    color: themeColors.textMuted,
    marginTop: 1,
  },
  replyPinnedCancel: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyPinnedCancelText: {
    color: themeColors.textMuted,
    fontSize: 13,
    lineHeight: 16,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composeInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
    color: themeColors.textPrimary,
  },
  composeButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeButtonDisabled: {
    opacity: 0.5,
  },
  composeButtonText: {
    color: '#ffffff',
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  collapsibleSubtree: {
    // Clip the reply subtree as it animates its height closed (accordion).
    overflow: 'hidden',
  },
  threadRails: {
    flexDirection: 'row',
  },
  threadRail: {
    width: THREAD_INDENT_STEP,
    borderLeftWidth: 1.5,
    borderLeftColor: BORDER,
  },
  collapsedHint: {
    color: ACCENT,
    marginLeft: 2,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BORDER,
  },
  commentAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitial: {
    color: ACCENT,
    fontSize: 12,
  },
  commentContent: {
    flex: 1,
    minWidth: 0,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  commentAuthor: {
    color: themeColors.textPrimary,
    flexShrink: 1,
  },
  commentTime: {
    color: themeColors.textMuted,
  },
  commentBody: {
    color: themeColors.textPrimary,
    lineHeight: 20,
  },
  mentionPrefix: {
    color: ACCENT,
    fontWeight: '600',
  },
  entitySpan: {
    color: ACCENT,
    fontWeight: '600',
  },
  entitySpanLink: {
    textDecorationLine: 'underline',
  },
  commentRowNested: {
    borderTopWidth: 0,
    paddingTop: 8,
    paddingVertical: 8,
  },
  // Highlight the comment being replied to while its copy is pinned above the chin.
  commentRowReplying: {
    backgroundColor: 'rgba(255, 51, 104, 0.06)',
    marginHorizontal: -OVERLAY_HORIZONTAL_PADDING,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  // P4 return-to-origin: a brief, tasteful accent flash on the comment a pop-to-restore dismiss
  // returned us to — slightly stronger than the reply tint so it reads as "here it is". Default
  // treatment, tunable later (owner tunes the highlight like the cutout). The bleed-to-edge
  // matches commentRowReplying so the flash spans the full row width.
  commentRowAnchorHighlight: {
    backgroundColor: 'rgba(255, 51, 104, 0.12)',
    marginHorizontal: -OVERLAY_HORIZONTAL_PADDING,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  likeCount: {
    color: themeColors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  likeCountActive: {
    color: ACCENT,
  },
  commentAction: {
    color: themeColors.textMuted,
  },
  replyButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentActionDestructive: {
    color: themeColors.textMuted,
  },
  inlineComposer: {
    marginTop: 8,
  },
  inlineComposerInput: {
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
    color: themeColors.textPrimary,
  },
  inlineComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  inlineComposerCancel: {
    color: themeColors.textMuted,
  },
  inlineComposerSubmit: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyComments: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  emptyCommentsText: {
    color: themeColors.textMuted,
  },
});
