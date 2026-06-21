import React from 'react';
import { Alert, Dimensions, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, MessageCircle, Sparkles, X as LucideX } from 'lucide-react-native';

import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { OVERLAY_HORIZONTAL_PADDING, overlaySheetStyles } from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
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
import { createProfileQueryOptions } from './profileSceneQueryOptions';

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

const CommentBody = React.memo(({ comment }: { comment: PollComment }) => {
  const segments = React.useMemo(
    () => buildBodySegments(comment.body, comment.entitySpans),
    [comment.body, comment.entitySpans]
  );
  return (
    <Text variant="body" style={styles.commentBody}>
      {segments.map((segment, index) =>
        segment.entity ? (
          <Text key={index} style={styles.entitySpan}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
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

const MAX_THREAD_INDENT = 4; // cap visual nesting so deep chains don't run off-screen
const THREAD_INDENT_STEP = 18;

type ThreadItem = { comment: PollComment; depth: number };

// Flatten the backend's flat comment list into render order: top-level comments
// keep the server's sort, replies nest under their parent (oldest-first for
// readability). Replies whose parent was deleted (and so isn't present) are
// promoted to top-level rather than dropped.
const buildThreadItems = (comments: PollComment[]): ThreadItem[] => {
  const present = new Set(comments.map((c) => c.commentId));
  const childrenByParent = new Map<string | null, PollComment[]>();
  for (const comment of comments) {
    const parent =
      comment.parentCommentId && present.has(comment.parentCommentId)
        ? comment.parentCommentId
        : null;
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(comment);
    else childrenByParent.set(parent, [comment]);
  }
  const items: ThreadItem[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    const children = childrenByParent.get(parentId);
    if (!children) return;
    const ordered =
      depth === 0
        ? children
        : [...children].sort(
            (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
          );
    for (const child of ordered) {
      items.push({ comment: child, depth });
      walk(child.commentId, depth + 1);
    }
  };
  walk(null, 0);
  return items;
};

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
  onSubmitReply: (text: string) => void;
  onSubmitEdit: (text: string) => void;
  onCancelCompose: () => void;
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
    onSubmitReply,
    onSubmitEdit,
    onCancelCompose,
  }: PollCommentRowProps) => {
    const { comment, depth } = item;
    const liked = comment.currentUserLiked;
    const indent = Math.min(depth, MAX_THREAD_INDENT) * THREAD_INDENT_STEP;
    return (
      <View
        style={[styles.commentRow, depth > 0 && styles.commentRowNested, { marginLeft: indent }]}
      >
        <CommentAvatar user={comment.user} />
        <View style={styles.commentContent}>
          <View style={styles.commentMetaRow}>
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
          </View>
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
            <CommentBody comment={comment} />
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
                  accessibilityRole="button"
                >
                  <Text variant="caption" weight="semibold" style={styles.commentAction}>
                    Reply
                  </Text>
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
          {isReplying ? (
            <InlineComposer
              placeholder={`Reply to ${resolveUserName(comment.user)}…`}
              submitLabel="Reply"
              submitting={submitting}
              onSubmit={onSubmitReply}
              onCancel={onCancelCompose}
            />
          ) : null}
        </View>
      </View>
    );
  }
);
PollCommentRow.displayName = 'PollCommentRow';

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
      Alert.alert('Sign in to comment', 'Join the discussion to weigh in on this poll.');
      return;
    }
    setPosting(true);
    try {
      await postPollComment(pollId, { body });
      setDraft('');
      await refresh();
    } catch (error) {
      Alert.alert('Unable to post', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPosting(false);
    }
  }, [draft, isSignedIn, pollId, posting, refresh]);

  const handleLike = React.useCallback(
    async (comment: PollComment) => {
      if (!isSignedIn) {
        Alert.alert('Sign in to endorse', 'Join the discussion to weigh in on this poll.');
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

  const threadItems = React.useMemo(() => buildThreadItems(comments), [comments]);
  const canReply = isActive && isSignedIn;

  const handleStartReply = React.useCallback(
    (comment: PollComment) => {
      if (!isSignedIn) {
        Alert.alert('Sign in to reply', 'Join the discussion to weigh in on this poll.');
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

  const handleSubmitReply = React.useCallback(
    async (text: string) => {
      const parentCommentId = replyTarget;
      if (!pollId || !parentCommentId || mutatingComment) return;
      setMutatingComment(true);
      try {
        await postPollComment(pollId, { body: text, parentCommentId });
        setReplyTarget(null);
        await refresh();
      } catch (error) {
        Alert.alert(
          'Unable to reply',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        setMutatingComment(false);
      }
    },
    [mutatingComment, pollId, refresh, replyTarget]
  );

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
        Alert.alert('Unable to save', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setMutatingComment(false);
      }
    },
    [editTarget, mutatingComment, refresh]
  );

  const handleDelete = React.useCallback(
    (comment: PollComment) => {
      Alert.alert('Delete comment?', 'This removes your comment from the discussion.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setMutatingComment(true);
            deletePollComment(comment.commentId)
              .then(() => refresh())
              .catch((error) =>
                Alert.alert(
                  'Unable to delete',
                  error instanceof Error ? error.message : 'Please try again.'
                )
              )
              .finally(() => setMutatingComment(false));
          },
        },
      ]);
    },
    [refresh]
  );

  const renderItem = React.useCallback(
    ({ item }: { item: ThreadItem }) => (
      <PollCommentRow
        item={item}
        isOwn={viewerUserId != null && item.comment.user.userId === viewerUserId}
        canReply={canReply}
        isReplying={replyTarget === item.comment.commentId}
        isEditing={editTarget === item.comment.commentId}
        submitting={mutatingComment}
        onLike={handleLike}
        onStartReply={handleStartReply}
        onStartEdit={handleStartEdit}
        onDelete={handleDelete}
        onSubmitReply={handleSubmitReply}
        onSubmitEdit={handleSubmitEdit}
        onCancelCompose={handleCancelCompose}
      />
    ),
    [
      canReply,
      editTarget,
      handleCancelCompose,
      handleDelete,
      handleLike,
      handleStartEdit,
      handleStartReply,
      handleSubmitEdit,
      handleSubmitReply,
      mutatingComment,
      replyTarget,
      viewerUserId,
    ]
  );
  const keyExtractor = React.useCallback((item: ThreadItem) => item.comment.commentId, []);

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

      <View style={styles.composeRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add to the discussion…"
          placeholderTextColor={themeColors.textMuted}
          style={styles.composeInput}
          multiline
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
    </View>
  );

  const emptyComponent = loading ? null : (
    <View style={styles.emptyComments}>
      <MessageCircle size={20} color={themeColors.textMuted} strokeWidth={1.8} />
      <Text variant="caption" style={styles.emptyCommentsText}>
        Be the first to weigh in.
      </Text>
    </View>
  );

  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const expanded = resolveExpandedTop(searchBarTop, insets.top);
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
      backgroundComponent: <FrostedGlassBackground />,
      headerComponent,
      overlayComponent: null,
    },
    sceneBodyContent: {
      surfaceKind: 'list',
      data: threadItems,
      renderItem,
      keyExtractor,
      estimatedItemSize: 96,
      ListHeaderComponent: listHeaderComponent,
      ListEmptyComponent: emptyComponent,
    },
    sceneBodyTransport: {
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        paddingTop: 12,
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      bounces: true,
      alwaysBounceVertical: false,
    },
  };
};

const styles = StyleSheet.create({
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
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 20,
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
  entitySpan: {
    color: ACCENT,
    fontWeight: '600',
  },
  commentRowNested: {
    borderTopWidth: 0,
    paddingTop: 8,
    paddingVertical: 8,
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
