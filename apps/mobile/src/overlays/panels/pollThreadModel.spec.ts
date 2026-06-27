import { buildThreadTree, type ThreadNode } from './pollThreadModel';
import type { PollComment } from '../../services/polls';

// Minimal comment factory — buildThreadTree reads commentId/parentCommentId/loggedAt, plus
// `user` for the flattened-@mention parent handle.
const c = (id: string, parentId: string | null, loggedAt = '2026-01-01T00:00:00Z'): PollComment =>
  ({
    commentId: id,
    parentCommentId: parentId,
    loggedAt,
    user: { userId: id, username: id, displayName: id },
  } as unknown as PollComment);

describe('buildThreadTree', () => {
  // Flatten a tree into [id, depth] render order (children after each node) for assertions.
  const flatten = (nodes: ThreadNode[]): [string, number][] =>
    nodes.flatMap((n) => [[n.comment.commentId, n.depth] as [string, number], ...flatten(n.children)]);

  it('nests replies as children with increasing depth (collapse-independent)', () => {
    const tree = buildThreadTree([c('a', null), c('b', 'a'), c('c', 'b')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].comment.commentId).toBe('a');
    expect(tree[0].children[0].comment.commentId).toBe('b');
    expect(tree[0].children[0].children[0].comment.commentId).toBe('c');
    expect(flatten(tree)).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('descendantCount counts the whole subtree at every level', () => {
    const tree = buildThreadTree([c('a', null), c('b', 'a'), c('c', 'b'), c('d', 'a')]);
    expect(tree[0].descendantCount).toBe(3); // b, c, d
    const b = tree[0].children.find((n) => n.comment.commentId === 'b');
    expect(b?.descendantCount).toBe(1); // c
    const d = tree[0].children.find((n) => n.comment.commentId === 'd');
    expect(d?.descendantCount).toBe(0);
  });

  it('keeps top-level server order but sorts replies oldest-first', () => {
    const tree = buildThreadTree([
      c('a', null),
      c('late', 'a', '2026-01-03T00:00:00Z'),
      c('early', 'a', '2026-01-02T00:00:00Z'),
    ]);
    expect(tree[0].children.map((n) => n.comment.commentId)).toEqual(['early', 'late']);
  });

  it('promotes replies whose parent is missing (deleted) to top level', () => {
    const tree = buildThreadTree([c('a', null), c('orphan', 'gone')]);
    expect(tree.map((n) => [n.comment.commentId, n.depth])).toEqual([
      ['a', 0],
      ['orphan', 0],
    ]);
  });

  it('flattens past the indent cap and @mentions the parent author', () => {
    const tree = buildThreadTree([
      c('a', null),
      c('b', 'a'),
      c('c', 'b'),
      c('d', 'c'),
      c('e', 'd'),
      c('f', 'e'),
      c('g', 'f'),
    ]);
    const byId = Object.fromEntries(
      flatten(tree).map(([id]) => id).map((id) => {
        const find = (nodes: ThreadNode[]): ThreadNode | undefined => {
          for (const n of nodes) {
            if (n.comment.commentId === id) return n;
            const hit = find(n.children);
            if (hit) return hit;
          }
          return undefined;
        };
        return [id, find(tree)!];
      })
    );
    expect(byId.f.depth).toBe(5);
    expect(byId.f.mentionUser).toBeNull();
    expect(byId.g.depth).toBe(6);
    expect(byId.g.mentionUser?.username).toBe('f');
  });
});
