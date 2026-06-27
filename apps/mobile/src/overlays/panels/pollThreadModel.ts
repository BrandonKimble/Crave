import type { PollComment, PollCommentUser } from '../../services/polls';

// Pure thread-flattening logic for the poll-detail discussion. Kept free of React
// Native so it can be unit-tested in the hermetic logic project (pollThreadModel.spec.ts).

export const MAX_THREAD_INDENT = 5; // cap visual nesting (Round-4) so deep chains stay on-screen
export const THREAD_INDENT_STEP = 16;

export type ThreadItem = {
  comment: PollComment;
  depth: number;
  isCollapsed: boolean;
  hiddenCount: number; // descendants hidden under a collapsed node (0 otherwise)
  // Past the indent cap the reply is FLATTENED onto the cap level (its true depth would run
  // off-screen), so it no longer visually sits under its parent. Carry the parent's author
  // so the row can prepend an @mention and keep the reply target legible (IG/YouTube style).
  mentionUser: PollCommentUser | null;
};

// Collapse-INDEPENDENT nested tree: keeps every node so the UI can mount the whole subtree
// once and ANIMATE collapse (height/opacity) instead of unmounting — the "keep the data,
// present it hidden" accordion. Each top-level node + its subtree is a self-contained
// accordion item the FlashList virtualizes; collapse state lives in React, not in the tree,
// so the tree only changes when the comment data changes.
export type ThreadNode = {
  comment: PollComment;
  depth: number;
  mentionUser: PollCommentUser | null;
  descendantCount: number; // total replies nested under this node, all levels
  children: ThreadNode[];
};

export const buildThreadTree = (comments: PollComment[]): ThreadNode[] => {
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
  // Top-level keeps the server sort; replies sort oldest-first for readability. Replies
  // whose parent was deleted (absent) are promoted to top-level rather than dropped.
  const build = (
    parentId: string | null,
    depth: number,
    parent: PollComment | null
  ): ThreadNode[] => {
    const children = childrenByParent.get(parentId);
    if (!children) return [];
    const ordered =
      depth === 0
        ? children
        : [...children].sort(
            (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
          );
    return ordered.map((child) => {
      const childNodes = build(child.commentId, depth + 1, child);
      const descendantCount = childNodes.reduce((sum, node) => sum + 1 + node.descendantCount, 0);
      return {
        comment: child,
        depth,
        // Flattened past the cap (true depth > MAX_THREAD_INDENT) → @mention the parent.
        mentionUser: depth > MAX_THREAD_INDENT && parent ? parent.user : null,
        descendantCount,
        children: childNodes,
      };
    });
  };
  return build(null, 0, null);
};
