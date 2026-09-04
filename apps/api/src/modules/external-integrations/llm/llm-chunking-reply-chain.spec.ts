import { LLMChunkingService } from './llm-chunking.service';
import type { LLMComment, LLMModelInput, LLMPost } from './llm.types';

// Local (not imported) so this spec compiles against the pre-rederivation
// chunker too — that is how its RED run was taken.
const isContextOnlyComment = (c: { context_only?: boolean }) =>
  c.context_only === true;
const emittingSourceIdsOf = (input: LLMModelInput) => ({
  postIds: input.posts
    .filter((p) => p.extract_from_post !== false)
    .map((p) => p.id),
  commentIds: input.posts.flatMap((p) =>
    p.comments.filter((c) => !isContextOnlyComment(c)).map((c) => c.id),
  ),
});

/**
 * REPLY-CHAIN WINDOWS (rederivation 2026-09-04). The docs-per-chunk cap used
 * to stop at whole top-level threads ("thread coherence is never split"),
 * so on the v23 Austin shadow 539 of 1,762 chunks were single mega-threads
 * averaging 60 docs (max 143) — the attention-decay defect the cap was
 * built for, unfixed exactly where it bit hardest. The unit the prompt
 * needs coherent is the reply chain, so a large thread now splits into
 * windows of <= cap EMITTING comments, each carrying its ancestor chain as
 * context-only documents.
 */

function buildService(): LLMChunkingService {
  const service = new LLMChunkingService({
    setContext: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    }),
  } as never);
  service.onModuleInit();
  return service;
}

const comment = (
  id: string,
  parentId: string | null,
  overrides: Partial<LLMComment> = {},
): LLMComment => ({
  id,
  parent_id: parentId,
  content: `text of ${id}`,
  author: 'u',
  score: 1,
  created_at: null,
  url: '',
  ...overrides,
});

const post = (
  comments: LLMComment[],
  overrides: Partial<LLMPost> = {},
): LLMPost =>
  ({
    id: 't3_p1',
    title: 'Best brisket?',
    content: 'Looking for brisket recs',
    subreddit: 'austinfood',
    author: 'op',
    url: '',
    score: 100,
    created_at: null,
    comments,
    ...overrides,
  }) as LLMPost;

/** One top-level comment (score 50) whose child subtrees have sizes
 *  [30, 30, 25, 20, 15, 12, 10] — 1 + 142 = 143 comments, the measured
 *  worst case. Each child subtree is a reply plus (size - 1) leaves. */
function build143Thread(): LLMPost {
  const comments: LLMComment[] = [comment('c_root', 't3_p1', { score: 50 })];
  const sizes = [30, 30, 25, 20, 15, 12, 10];
  sizes.forEach((size, i) => {
    const replyId = `r${i}`;
    comments.push(comment(replyId, 'c_root'));
    for (let leaf = 1; leaf < size; leaf += 1) {
      comments.push(comment(`${replyId}_l${leaf}`, replyId));
    }
  });
  expect(comments).toHaveLength(143);
  return post(comments);
}

function chunkWindows(input: LLMModelInput) {
  const { chunks, metadata } = buildService().createContextualChunks(input);
  return chunks.map((chunk, index) => ({
    meta: metadata[index],
    post: chunk.posts[0],
    emitting: chunk.posts[0].comments.filter((c) => !isContextOnlyComment(c)),
    context: chunk.posts[0].comments.filter((c) => isContextOnlyComment(c)),
  }));
}

describe('reply-chain windows (cap 30)', () => {
  afterEach(() => {
    delete process.env.LLM_CHUNK_MAX_DOCS;
  });

  it('a 143-comment single thread yields windows of <= 30 emitting docs, every comment emitting in exactly one window', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const source = build143Thread();
    const windows = chunkWindows({ posts: [source] });

    expect(windows.length).toBeGreaterThan(1);
    const emittedIn = new Map<string, number>();
    for (const window of windows) {
      expect(window.emitting.length).toBeLessThanOrEqual(30);
      expect(window.meta.commentCount).toBe(window.emitting.length);
      expect(
        (window.meta as { contextCommentCount?: number }).contextCommentCount,
      ).toBe(window.context.length);
      for (const c of window.emitting) {
        emittedIn.set(c.id, (emittedIn.get(c.id) ?? 0) + 1);
      }
    }
    for (const c of source.comments) {
      expect(emittedIn.get(c.id)).toBe(1);
    }
    expect(emittedIn.size).toBe(143);
  });

  it('every window carries its full ancestor chain as context_only, and an ancestor never emits where it is context', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const source = build143Thread();
    const byId = new Map(source.comments.map((c) => [c.id, c]));
    const windows = chunkWindows({ posts: [source] });

    for (const window of windows) {
      const ids = new Set(window.post.comments.map((c) => c.id));
      const emittingIds = new Set(window.emitting.map((c) => c.id));
      for (const c of window.emitting) {
        // Walk to the top: every ancestor rides in this window.
        let cursor = byId.get(c.parent_id ?? '');
        while (cursor) {
          expect(ids.has(cursor.id)).toBe(true);
          cursor = byId.get(cursor.parent_id ?? '');
        }
      }
      for (const c of window.context) {
        expect(emittingIds.has(c.id)).toBe(false);
        expect(c.context_only).toBe(true);
      }
      // Post body: extracted in the first window only, context after.
      expect(window.post.extract_from_post).toBe(window === windows[0]);
    }
    // The root is context in every window it does not emit in.
    const rootWindows = windows.filter((w) =>
      w.emitting.some((c) => c.id === 'c_root'),
    );
    expect(rootWindows).toHaveLength(1);
    for (const window of windows) {
      if (window === rootWindows[0]) continue;
      expect(window.context.map((c) => c.id)).toContain('c_root');
    }
  });

  it('preserves order: ancestors before descendants, and top-level threads by score', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const source = build143Thread();
    // A second, higher-scored small thread must come first.
    source.comments.push(comment('hot', 't3_p1', { score: 500 }));
    source.comments.push(comment('hot_reply', 'hot'));
    const windows = chunkWindows({ posts: [source] });
    const byId = new Map(source.comments.map((c) => [c.id, c]));

    expect(windows[0].post.comments[0].id).toBe('hot');
    expect(windows[0].post.comments[1].id).toBe('hot_reply');
    for (const window of windows) {
      const position = new Map(
        window.post.comments.map((c, index) => [c.id, index]),
      );
      for (const c of window.post.comments) {
        const parent = byId.get(c.parent_id ?? '');
        if (parent) {
          expect(position.get(parent.id)).toBeLessThan(position.get(c.id)!);
        }
      }
    }
  });

  it('a linear chain is the only irreducible unit: it ships whole even past the cap', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const chain: LLMComment[] = [];
    let parent: string | null = 't3_p1';
    for (let i = 0; i < 40; i += 1) {
      chain.push(comment(`k${i}`, parent));
      parent = `k${i}`;
    }
    const windows = chunkWindows({ posts: [post(chain)] });
    expect(windows).toHaveLength(1);
    expect(windows[0].emitting).toHaveLength(40);
    expect(windows[0].context).toHaveLength(0);
  });

  it('a caller-flagged context_only comment never emits and still rides as context for its descendants', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const source = post(
      [
        comment('covered_root', 't3_p1', { context_only: true }),
        comment('new_reply', 'covered_root'),
      ],
      { extract_from_post: false },
    );
    const windows = chunkWindows({ posts: [source] });
    expect(windows).toHaveLength(1);
    expect(windows[0].emitting.map((c) => c.id)).toEqual(['new_reply']);
    expect(windows[0].context.map((c) => c.id)).toEqual(['covered_root']);
    expect(windows[0].post.extract_from_post).toBe(false);
    expect(emittingSourceIdsOf({ posts: [windows[0].post] })).toEqual({
      postIds: [],
      commentIds: ['new_reply'],
    });
  });

  it('packs small threads greedily under the cap in score order (unchanged law)', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const comments: LLMComment[] = [];
    for (let t = 0; t < 10; t += 1) {
      comments.push(comment(`t${t}`, 't3_p1', { score: 100 - t }));
      for (let r = 1; r < 10; r += 1)
        comments.push(comment(`t${t}_${r}`, `t${t}`));
    }
    const windows = chunkWindows({ posts: [post(comments)] });
    expect(windows.map((w) => w.emitting.length)).toEqual([30, 30, 30, 10]);
    expect(windows.every((w) => w.context.length === 0)).toBe(true);
    expect(windows[0].meta.rootCommentIds).toEqual(['t0', 't1', 't2']);
  });
});
