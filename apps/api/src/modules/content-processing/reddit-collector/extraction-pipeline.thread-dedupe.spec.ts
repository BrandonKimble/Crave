// p-limit is ESM-only; jest's CJS transform chokes on it when the pipeline
// service's import chain pulls in llm-concurrent-processing. Stub it — this
// spec never runs concurrent LLM work.
jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      Promise.resolve(fn(...args)),
}));

import { ExtractionPipelineService } from './extraction-pipeline.service';
import { LLMChunkingService } from '../../external-integrations/llm/llm-chunking.service';
import type {
  LLMComment,
  LLMPost,
} from '../../external-integrations/llm/llm.types';

/** Pre-LLM dedupe gate (thread-level 2026-07-11; reply-chain 2026-09-04):
 *  partially-covered posts are trimmed to the uncovered comments plus their
 *  ancestor chains (covered ancestors ride as context_only, covered siblings
 *  drop); the post title/body ride along as context with extract_from_post
 *  reflecting whether the post body itself still needs extraction. */

const makeComment = (
  id: string,
  parentId: string | null,
  overrides: Partial<LLMComment> = {},
): LLMComment => ({
  id,
  content: `comment ${id}`,
  author: 'user',
  score: 10,
  created_at: '2026-07-01T00:00:00Z',
  parent_id: parentId,
  url: `https://reddit.com/${id}`,
  ...overrides,
});

const makePost = (
  id: string,
  comments: LLMComment[],
  overrides: Partial<LLMPost> = {},
): LLMPost => ({
  id,
  title: `post ${id}`,
  content: `body ${id}`,
  subreddit: 'austinfood',
  author: 'op',
  url: `https://reddit.com/${id}`,
  score: 100,
  created_at: '2026-07-01T00:00:00Z',
  comments,
  ...overrides,
});

// The rebuild is pure per-post logic with no instance state — exercise it
// directly on the prototype (constructing the service drags in the full
// Nest dependency graph for nothing).
const rebuild = (post: LLMPost, covered: Set<string>): LLMPost | null =>
  (
    ExtractionPipelineService.prototype as unknown as {
      rebuildPostForUncoveredThreads(
        post: LLMPost,
        coveredSourceIds: Set<string>,
      ): LLMPost | null;
    }
  ).rebuildPostForUncoveredThreads(post, covered);

describe('thread-level dedupe rebuild', () => {
  // Post p1 with two top-level threads: c1 (child c1a) and c2 (child c2a).
  const buildPost = () =>
    makePost('t3_p1', [
      makeComment('c1', 't3_p1'),
      makeComment('c1a', 'c1'),
      makeComment('c2', 't3_p1'),
      makeComment('c2a', 'c2'),
    ]);

  it('drops a fully covered post entirely', () => {
    const covered = new Set(['t3_p1', 'c1', 'c1a', 'c2', 'c2a']);
    expect(rebuild(buildPost(), covered)).toBeNull();
  });

  it('passes a brand-new post through unchanged', () => {
    const post = buildPost();
    const result = rebuild(post, new Set());
    expect(result).toBe(post);
    expect(result!.extract_from_post).toBeUndefined();
  });

  it('keeps the new comment plus its ancestor chain as context_only; post body as context NOT re-extracted when post is covered', () => {
    const post = buildPost();
    // Everything covered except a new reply c2b in thread c2.
    post.comments.push(makeComment('c2b', 'c2a'));
    const covered = new Set(['t3_p1', 'c1', 'c1a', 'c2', 'c2a']);
    const result = rebuild(post, covered)!;
    expect(result).not.toBeNull();
    // Post title/body ride along as context...
    expect(result.title).toBe('post t3_p1');
    expect(result.content).toBe('body t3_p1');
    // ...but the covered post body must NOT be re-extracted.
    expect(result.extract_from_post).toBe(false);
    // Only chain c2 -> c2a -> c2b survives — sibling thread c1 dropped, and
    // the covered ancestors emit nothing (they are context for c2b).
    expect(result.comments.map((c) => c.id)).toEqual(['c2', 'c2a', 'c2b']);
    expect(result.comments.map((c) => c.context_only === true)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('a new nested reply deep in a thread keeps its ancestor chain (context_only) and drops covered siblings', () => {
    const post = makePost('t3_p2', [
      makeComment('r1', 't3_p2'),
      makeComment('r1a', 'r1'),
      makeComment('r1b', 'r1'), // covered sibling branch — dropped
      makeComment('r1a1', 'r1a'),
      makeComment('r1a1x', 'r1a1'), // NEW deep reply
      makeComment('r2', 't3_p2'),
    ]);
    const covered = new Set(['t3_p2', 'r1', 'r1a', 'r1b', 'r1a1', 'r2']);
    const result = rebuild(post, covered)!;
    expect(result.extract_from_post).toBe(false);
    expect(result.comments.map((c) => c.id)).toEqual([
      'r1',
      'r1a',
      'r1a1',
      'r1a1x',
    ]);
    expect(
      result.comments.filter((c) => c.context_only === true).map((c) => c.id),
    ).toEqual(['r1', 'r1a', 'r1a1']);
  });

  it('re-extracts the post body when the post id itself is uncovered', () => {
    const post = buildPost();
    const covered = new Set(['c1', 'c1a']); // post + thread c2 uncovered
    const result = rebuild(post, covered)!;
    expect(result.extract_from_post).toBe(true);
    expect(result.comments.map((c) => c.id).sort()).toEqual(['c2', 'c2a']);
  });
});

describe('chunker honors a pre-set extract_from_post=false', () => {
  const buildChunker = () => {
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const service = new LLMChunkingService(
      logger as unknown as ConstructorParameters<typeof LLMChunkingService>[0],
    );
    service.onModuleInit();
    return service;
  };

  it('group-0 chunk carries extract_from_post=false when the pipeline pre-decided', () => {
    const chunker = buildChunker();
    const post = makePost(
      't3_p1',
      [makeComment('c2', 't3_p1'), makeComment('c2a', 'c2')],
      { extract_from_post: false },
    );
    const { chunks } = chunker.createContextualChunks({ posts: [post] });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.posts[0].extract_from_post).toBe(false);
    }
  });

  it('default (no hint) still extracts from the post in group 0', () => {
    const chunker = buildChunker();
    const post = makePost('t3_p1', [makeComment('c1', 't3_p1')]);
    const { chunks } = chunker.createContextualChunks({ posts: [post] });
    expect(chunks[0].posts[0].extract_from_post).toBe(true);
  });
});
