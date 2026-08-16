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
import type {
  LLMComment,
  LLMPost,
} from '../../external-integrations/llm/llm.types';

/**
 * F9201 / F-CONV-1 mutation-proof. F4905 made LLMPost/LLMComment.created_at
 * nullable so an undated item is UNKNOWN, not fabricated. The enrichment
 * layer still had `?? new Date().toISOString()` fallbacks that were dead
 * before the field was nullable and became LIVE after — restamping every
 * undated post/comment with collection-time NOW, which yields maximal
 * recency mass in public-crave-score (power(0.5, (now-src)/halfLife) ≈ 1.0).
 *
 * The DB column source_created_at is NOT NULL, so the interim fix floors an
 * unknown date to a fixed ANCIENT sentinel (epoch 0) -> ~0 recency weight,
 * the opposite of the maximal-recency harm.
 *
 * REVERTING the fix (restoring `?? new Date().toISOString()` at
 * buildSourceEnrichmentMaps / enrichHydratedMention) reds every assertion
 * below: an undated item's resolved source_created_at would land ≈ now.
 */

const ANCIENT_SENTINEL = '1970-01-01T00:00:00.000Z';

type EnrichmentMaps = {
  metadataById: Map<string, { created_at: string }>;
};

const buildMaps = (llmPosts: LLMPost[]): EnrichmentMaps =>
  (
    ExtractionPipelineService.prototype as unknown as {
      buildSourceEnrichmentMaps(posts: LLMPost[]): EnrichmentMaps;
    }
  ).buildSourceEnrichmentMaps(llmPosts);

const enrich = (mention: Record<string, unknown>, enrichment: unknown) =>
  (
    ExtractionPipelineService.prototype as unknown as {
      enrichHydratedMention(
        m: unknown,
        e: unknown,
        map: Map<unknown, unknown>,
      ): { source_created_at: string };
    }
  ).enrichHydratedMention(mention, enrichment, new Map());

const undatedComment = (id: string): LLMComment => ({
  id,
  content: `comment ${id}`,
  author: 'user',
  score: 10,
  created_at: null, // undated: creation time unknown (F4905)
  parent_id: null,
  url: `https://reddit.com/${id}`,
});

const undatedPost = (id: string, comments: LLMComment[]): LLMPost => ({
  id,
  title: `post ${id}`,
  content: `body ${id}`,
  subreddit: 'austinfood',
  author: 'op',
  url: `https://reddit.com/${id}`,
  score: 100,
  created_at: null, // undated: creation time unknown (F4905)
  comments,
});

const isNearNow = (iso: string): boolean =>
  Math.abs(Date.now() - new Date(iso).getTime()) < 60_000;

describe('undated source enrichment (F9201/F4905 de-weighting floor)', () => {
  it('floors an undated post/comment to the ancient sentinel, never NOW, in the enrichment maps', () => {
    const maps = buildMaps([undatedPost('p1', [undatedComment('c1')])]);

    const post = maps.metadataById.get('p1')!;
    const comment = maps.metadataById.get('c1')!;

    expect(post.created_at).toBe(ANCIENT_SENTINEL);
    expect(comment.created_at).toBe(ANCIENT_SENTINEL);
    expect(isNearNow(post.created_at)).toBe(false);
    expect(isNearNow(comment.created_at)).toBe(false);
  });

  it('resolves source_created_at to the ancient sentinel through the full hydration round-trip', () => {
    const maps = buildMaps([undatedPost('p1', [undatedComment('c1')])]);

    const resolved = enrich(
      {
        source_id: 'c1',
        place: 'Franklin',
        general_praise: true,
        temp_id: 't1',
      },
      maps,
    );

    expect(resolved.source_created_at).toBe(ANCIENT_SENTINEL);
    expect(isNearNow(resolved.source_created_at)).toBe(false);
  });

  it('final fallback (no metadata created_at, no mention source_created_at) still lands on the sentinel, not NOW', () => {
    // Directly exercise enrichHydratedMention's terminal `?? sentinel` branch:
    // a metadata entry that somehow lacks created_at and a mention with no
    // source_created_at must NOT be stamped NOW.
    const enrichment = {
      metadataById: new Map([
        ['s1', { type: 'post', ups: 1, url: 'u', subreddit: 'austinfood' }],
      ]),
      contentById: new Map(),
      postContextBySource: new Map(),
    };

    const resolved = enrich(
      {
        source_id: 's1',
        place: 'Franklin',
        general_praise: true,
        temp_id: 't1',
      },
      enrichment,
    );

    expect(resolved.source_created_at).toBe(ANCIENT_SENTINEL);
    expect(isNearNow(resolved.source_created_at)).toBe(false);
  });
});
