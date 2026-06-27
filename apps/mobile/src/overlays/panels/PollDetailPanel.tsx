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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { io } from 'socket.io-client';
import { Heart, MessageCircle, Reply as ReplyIcon, Sparkles, X as LucideX } from 'lucide-react-native';

import { showAppModal, Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import {
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import { useNavHideIntent } from '../../navigation/runtime/nav-hide-intent-store';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
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
import { useRestaurantRouteProducer } from '../useRestaurantRouteProducer';
import { createRestaurantRoutePanelDraft } from '../restaurantRoutePanelContract';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type UsePollDetailPanelSpecOptions = {
  visible: boolean;
  pollId: string | null;
  poll?: Poll | null;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onClose: () => void;
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
  onEntityPress: (entity: EntitySpan) => void;
};

const CommentBody = React.memo(({ comment, mentionUser, onEntityPress }: CommentBodyProps) => {
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
        // Restaurant highlights are tappable → that restaurant's profile; food /
        // attribute highlights are styled but not navigable (no single subject).
        const tappable = segment.entity.type === 'restaurant' && Boolean(segment.entity.entityId);
        return (
          <Text
            key={index}
            style={[styles.entitySpan, tappable && styles.entitySpanLink]}
            onPress={tappable ? () => onEntityPress(segment.entity!) : undefined}
            suppressHighlighting={!tappable}
          >
            {segment.text}
          </Text>
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
  submitting: boolean;
  onLike: (comment: PollComment) => void;
  onStartReply: (comment: PollComment) => void;
  onStartEdit: (comment: PollComment) => void;
  onDelete: (comment: PollComment) => void;
  onSubmitEdit: (text: string) => void;
  onCancelCompose: () => void;
  onEntityPress: (entity: EntitySpan) => void;
  onToggleCollapse: (commentId: string) => void;
};

const PollCommentRow = React.memo(
  ({
    item,
    isOwn,
    canReply,
    isReplying,
    isEditing,
    submitting,
    onLike,
    onStartReply,
    onStartEdit,
    onDelete,
    onSubmitEdit,
    onCancelCompose,
    onEntityPress,
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
            <CommentBody comment={comment} mentionUser={mentionUser} onEntityPress={onEntityPress} />
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
                <Pressable onPress={() => onDelete(comment)} hitSlop={8} accessibilityRole="button">
                  <Text variant="caption" weight="semibold" style={styles.commentActionDestructive}>
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
  submitting: boolean;
  onLike: (comment: PollComment) => void;
  onStartReply: (comment: PollComment) => void;
  onStartEdit: (comment: PollComment) => void;
  onDelete: (comment: PollComment) => void;
  onSubmitEdit: (text: string) => void;
  onCancelCompose: () => void;
  onEntityPress: (entity: EntitySpan) => void;
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
        submitting={props.submitting}
        onLike={props.onLike}
        onStartReply={props.onStartReply}
        onStartEdit={props.onStartEdit}
        onDelete={props.onDelete}
        onSubmitEdit={props.onSubmitEdit}
        onCancelCompose={props.onCancelCompose}
        onEntityPress={props.onEntityPress}
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

export const usePollDetailPanelSpec = ({
  visible,
  pollId,
  poll: pollSeed,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onClose,
}: UsePollDetailPanelSpecOptions): SearchRoutePublishedSceneParts => {
  const insets = useSafeAreaInsets();
  // Push the bottom tab bar down (the search-submit transition) while the poll thread
  // is open, so the thread reads as a focused full-bleed detail view (§D).
  useNavHideIntent('pollDetail', visible);
  const { isSignedIn } = useAuthController();
  const { data: viewerProfile } = useQuery({
    ...createProfileQueryOptions(),
    enabled: isSignedIn,
  });
  const viewerUserId = viewerProfile?.userId ?? null;
  const { openRestaurantRoute } = useRestaurantRouteProducer();

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
      showAppModal({
        title: 'Unable to post',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
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
        showAppModal({
          title: 'Unable to save',
          message: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        setMutatingComment(false);
      }
    },
    [editTarget, mutatingComment, refresh]
  );

  // Tapping a restaurant highlight opens that restaurant's profile. The restaurant
  // route is now a valid child of the polls lane, so open it with the owner/opener
  // resolved naturally from the active route (pollDetail) — closing it returns to
  // this poll. It self-hydrates from restaurantId.
  const handleEntityPress = React.useCallback(
    (entity: EntitySpan) => {
      if (entity.type !== 'restaurant' || !entity.entityId) return;
      openRestaurantRoute({
        restaurantId: entity.entityId,
        panel: createRestaurantRoutePanelDraft({
          data: null,
          onToggleFavorite: () => undefined,
        }),
      });
    },
    [openRestaurantRoute]
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
                .catch((error) =>
                  showAppModal({
                    title: 'Unable to delete',
                    message: error instanceof Error ? error.message : 'Please try again.',
                  })
                )
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
        submitting={mutatingComment}
        onLike={handleLike}
        onStartReply={handleStartReply}
        onStartEdit={handleStartEdit}
        onDelete={handleDelete}
        onSubmitEdit={handleSubmitEdit}
        onCancelCompose={handleCancelCompose}
        onEntityPress={handleEntityPress}
        onToggleCollapse={handleToggleCollapse}
      />
    ),
    [
      canReply,
      collapsedComments,
      editTarget,
      handleCancelCompose,
      handleDelete,
      handleEntityPress,
      handleLike,
      handleStartEdit,
      handleStartReply,
      handleSubmitEdit,
      handleToggleCollapse,
      mutatingComment,
      replyTarget,
      viewerUserId,
    ]
  );
  const keyExtractor = React.useCallback((item: ThreadNode) => item.comment.commentId, []);

  const headerTitle = poll?.question ?? 'Poll';

  const headerComponent = (
    <OverlaySheetHeaderChrome
      title={
        <Text variant="title" weight="semibold" style={styles.sheetTitle} numberOfLines={1}>
          Poll
        </Text>
      }
      actionButton={
        <Pressable
          onPressIn={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close poll"
          style={overlaySheetStyles.closeButton}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
            <LucideX size={20} color="#000000" strokeWidth={2.5} />
          </View>
        </Pressable>
      }
    />
  );

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
  // (useNavHideIntent above), freeing the bottom. `useAnimatedKeyboard` raises it above
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

  const emptyComponent = loading ? null : (
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
      headerComponent,
      overlayComponent: null,
    },
    sceneBodyContent: {
      surfaceKind: 'list',
      data: threadTree,
      // Collapse state lives outside `data`, so the list re-renders rows when it changes.
      extraData: collapsedComments,
      renderItem,
      keyExtractor,
      estimatedItemSize: 96,
      ListHeaderComponent: listHeaderComponent,
      ListEmptyComponent: emptyComponent,
      ListChromeComponent: composeChin,
    },
    sceneBodyTransport: {
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
