import { filterAndTransformToLLM } from './reddit-data-filter';

/**
 * Ingest-honesty specs (F4905/F4906): the Reddit→LLM transform must never
 * FABRICATE a fact it did not observe. An unknown timestamp is null (not NOW),
 * an unknown author is null (not 'unknown'/'[deleted]'), an idless post is
 * dropped (not synthesized to 't3_unknown'), and a negative score keeps its
 * sign (not clamped to 0).
 */

const POST_URL = 'https://reddit.com/r/austinfood/comments/abc/def';

/** A [postListing, commentListing] pair as the comments endpoint returns. */
function response(
  postData: Record<string, unknown> | null,
  comments: Array<Record<string, unknown>> = [],
): unknown {
  return [
    {
      data: {
        children: postData ? [{ kind: 't3', data: postData }] : [],
      },
    },
    {
      data: {
        children: comments.map((data) => ({ kind: 't1', data })),
      },
    },
  ];
}

describe('reddit-data-filter ingest honesty', () => {
  it('F4905: an unparseable post timestamp becomes null, not the collection time', () => {
    const { post } = filterAndTransformToLLM(
      response({ name: 't3_x', created_utc: undefined, score: 5 }),
      POST_URL,
    );
    expect(post).not.toBeNull();
    expect(post?.created_at).toBeNull();
  });

  it('F4906: an idless post is dropped (no synthetic t3_unknown id)', () => {
    const { post } = filterAndTransformToLLM(
      response({ title: 'no id here', score: 3 }),
      POST_URL,
    );
    expect(post).toBeNull();
  });

  it('F4906: an authorless post/comment reports null, never a sentinel', () => {
    const { post, comments } = filterAndTransformToLLM(
      response({ name: 't3_x', score: 1 }, [
        { name: 't1_y', body: 'hi', score: 2 },
      ]),
      POST_URL,
    );
    expect(post?.author).toBeNull();
    expect(comments[0]?.author).toBeNull();
  });

  it('F4906: a negative comment score keeps its sign (no Math.max(0, …) clamp)', () => {
    const { comments } = filterAndTransformToLLM(
      response({ name: 't3_x', score: 1 }, [
        {
          name: 't1_hated',
          body: 'controversial take',
          author: 'u',
          score: -50,
        },
      ]),
      POST_URL,
    );
    expect(comments[0]?.score).toBe(-50);
  });
});
