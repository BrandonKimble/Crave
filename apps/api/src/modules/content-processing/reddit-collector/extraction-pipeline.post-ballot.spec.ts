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
 * CONSENSUS = OPINIONS, NOT APPLAUSE (owner ruling 2026-08-16).
 *
 * A comment's upvotes co-sign that comment's specific claim; a post's
 * upvotes applaud the THREAD. So a post-body claim carries exactly its
 * creator's one ballot, however viral the post. Measured before the ruling:
 * post-body claims were 10% of mentions but 82% of stored upvote mass
 * (median 31 vs 1) — one hot thread outweighed thirty independent
 * recommenders. REVERTING the floor in enrichHydratedMention (restoring
 * `metadata.ups ?? …` unconditionally for posts) reds the first assertion:
 * the post claim would carry 2125 again.
 */

const buildMaps = (llmPosts: LLMPost[]): unknown =>
  (
    ExtractionPipelineService.prototype as unknown as {
      buildSourceEnrichmentMaps(posts: LLMPost[]): unknown;
    }
  ).buildSourceEnrichmentMaps(llmPosts);

const enrich = (mention: Record<string, unknown>, enrichment: unknown) =>
  (
    ExtractionPipelineService.prototype as unknown as {
      enrichHydratedMention(
        m: unknown,
        e: unknown,
        map: Map<unknown, unknown>,
      ): { source_ups: number };
    }
  ).enrichHydratedMention(mention, enrichment, new Map());

const comment = (id: string, score: number): LLMComment => ({
  id,
  content: `comment ${id}`,
  author: 'user',
  score,
  created_at: '2026-08-01T00:00:00.000Z',
  parent_id: null,
  url: `https://reddit.com/${id}`,
});

const post = (id: string, score: number, comments: LLMComment[]): LLMPost => ({
  id,
  title: `post ${id}`,
  content: `body ${id}`,
  subreddit: 'austinfood',
  author: 'op',
  url: `https://reddit.com/${id}`,
  score,
  created_at: '2026-08-01T00:00:00.000Z',
  comments,
});

describe('post-body claims carry one ballot (creator = one vote)', () => {
  it('floors a viral post-body claim to 1 while its comments keep their own scores', () => {
    const maps = buildMaps([post('p1', 2125, [comment('c1', 41)])]);

    const fromPost = enrich(
      { source_id: 'p1', place: 'Franklin', general_praise: true },
      maps,
    );
    const fromComment = enrich(
      { source_id: 'c1', place: 'Franklin', general_praise: true },
      maps,
    );

    expect(fromPost.source_ups).toBe(1);
    expect(fromComment.source_ups).toBe(41);
  });

  it('a downvoted post still carries its creator ballot of exactly 1', () => {
    const maps = buildMaps([post('p1', 0, [])]);
    const fromPost = enrich(
      { source_id: 'p1', place: 'Franklin', general_praise: true },
      maps,
    );
    expect(fromPost.source_ups).toBe(1);
  });
});
