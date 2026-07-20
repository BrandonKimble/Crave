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
import type { LLMPost } from '../../external-integrations/llm/llm.types';

/**
 * §12.1 persist-first specs: every FETCHED document persists BEFORE the
 * relevance-gate admission judgment — a gate-rejected post is still stored
 * (the fetch was paid; the verdict is re-derivable). The gate only decides
 * what proceeds toward extraction.
 */

function makePost(id: string): LLMPost {
  return {
    id,
    title: `title-${id}`,
    content: `content-${id}`,
    comments: [],
  } as unknown as LLMPost;
}

function build(options: { keepIds?: string[] } = {}) {
  const callOrder: string[] = [];
  const collectionEvidenceService = {
    persistSourceDocuments: jest.fn((params: { posts: LLMPost[] }) => {
      callOrder.push('persist');
      return Promise.resolve(
        new Map(
          params.posts.map((post) => [`post:${post.id}`, `doc-${post.id}`]),
        ),
      );
    }),
    findExtractionCoveredSourceIds: jest.fn(
      (params: { sourceIds: string[] }) => {
        callOrder.push('coverage');
        // All covered → the pipeline short-circuits after the gate, keeping
        // this spec independent of chunking/LLM machinery.
        return Promise.resolve(new Set(params.sourceIds));
      },
    ),
  };
  const relevanceGate = {
    filterPosts: jest.fn((_platform: string, posts: LLMPost[]) => {
      callOrder.push('gate');
      const keepIds = options.keepIds ?? posts.map((post) => post.id);
      const kept = posts.filter((post) => keepIds.includes(post.id));
      return Promise.resolve({
        kept,
        dropped: posts.length - kept.length,
        fromCache: 0,
        judged: posts.length,
      });
    }),
  };
  const llmService = { getSystemPrompt: jest.fn(() => 'prompt-v1') };
  const service = new ExtractionPipelineService(
    { setContext: jest.fn().mockReturnThis() } as never,
    {} as never,
    {} as never,
    llmService as never,
    collectionEvidenceService as never,
    {} as never,
    {} as never,
    relevanceGate as never,
  );
  (service as unknown as { logger: unknown }).logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { service, collectionEvidenceService, relevanceGate, callOrder };
}

describe('§12.1 persist-first admission', () => {
  it('persists EVERY fetched post before the gate judges; rejected posts are still stored', async () => {
    const h = build({ keepIds: ['keeper'] });
    await h.service.processPosts({
      pipeline: 'keyword',
      community: 'austinfood',
      llmPosts: [makePost('keeper'), makePost('rejected')],
    } as never);

    // Order: persist strictly BEFORE the admission judgment.
    expect(h.callOrder[0]).toBe('persist');
    expect(h.callOrder[1]).toBe('gate');

    // The persisted set is the FULL fetched set, including the reject.
    const persisted =
      h.collectionEvidenceService.persistSourceDocuments.mock.calls[0][0];
    expect(persisted.posts.map((post: LLMPost) => post.id)).toEqual([
      'keeper',
      'rejected',
    ]);

    // Only the ADMITTED post proceeds toward extraction coverage.
    const coverage =
      h.collectionEvidenceService.findExtractionCoveredSourceIds.mock
        .calls[0][0];
    expect(coverage.sourceIds).toEqual(['keeper']);
  });

  it('poll threads are exempt from the gate but still persist first', async () => {
    const h = build();
    await h.service.processPosts({
      pipeline: 'poll-thread',
      community: 'poll_surface:place-1',
      llmPosts: [makePost('thread')],
    } as never);
    expect(h.relevanceGate.filterPosts).not.toHaveBeenCalled();
    expect(
      h.collectionEvidenceService.persistSourceDocuments,
    ).toHaveBeenCalled();
  });
});
