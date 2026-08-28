import {
  LLMChunkingService,
  resolveChunkMaxDocs,
  resolveChunkTargetTokens,
} from './llm-chunking.service';
import type { LLMComment, LLMModelInput, LLMPost } from './llm.types';

/**
 * LLM_CHUNK_TARGET_TOKENS is resolved at BOOT and REFUSED when set-but-invalid
 * (F4954). The old `parsePositiveInt(value, 35000)` meant `abc`, `0` and `-1`
 * all silently became 35000 — the exact class of stale-override-nobody-sees
 * that env-config-audit already caught once.
 */
describe('resolveChunkTargetTokens', () => {
  it('uses the documented default when absent or blank', () => {
    expect(resolveChunkTargetTokens(undefined)).toBe(35000);
    expect(resolveChunkTargetTokens('')).toBe(35000);
    expect(resolveChunkTargetTokens('   ')).toBe(35000);
  });

  it('accepts a valid positive integer override', () => {
    expect(resolveChunkTargetTokens('20000')).toBe(20000);
  });

  it.each(['abc', '0', '-1', '3.5'])(
    'REFUSES the set-but-invalid value %s instead of silently defaulting',
    (raw) => {
      expect(() => resolveChunkTargetTokens(raw)).toThrow(/positive integer/);
    },
  );
});

/** Same boot-refuse contract for the docs-per-chunk attention cap (miss
 *  RC4): absent → 30; set-but-invalid crashes boot. */
describe('resolveChunkMaxDocs', () => {
  it('uses the documented default when absent or blank', () => {
    expect(resolveChunkMaxDocs(undefined)).toBe(30);
    expect(resolveChunkMaxDocs('')).toBe(30);
  });

  it('accepts a valid positive integer override', () => {
    expect(resolveChunkMaxDocs('50')).toBe(50);
  });

  it.each(['abc', '0', '-1', '3.5'])(
    'REFUSES the set-but-invalid value %s instead of silently defaulting',
    (raw) => {
      expect(() => resolveChunkMaxDocs(raw)).toThrow(/positive integer/);
    },
  );
});

/**
 * THE ATTENTION CAP ITSELF (miss RC4): packing/grouping must stop adding
 * threads once a chunk holds maxDocsPerChunk comments, even when the token
 * budget has plenty of room — and a single thread larger than the cap still
 * ships whole (thread coherence is never split).
 */
describe('docs-per-chunk attention cap', () => {
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

  function buildInput(threadSizes: number[]): LLMModelInput {
    let commentSeq = 0;
    const comments: LLMComment[] = [];
    for (const size of threadSizes) {
      const rootId = `c${(commentSeq += 1)}`;
      comments.push({
        id: rootId,
        parent_id: null,
        content: 'short comment text',
        score: 10,
      } as unknown as LLMComment);
      for (let i = 1; i < size; i += 1) {
        comments.push({
          id: `c${(commentSeq += 1)}`,
          parent_id: rootId,
          content: 'short reply text',
          score: 1,
        } as unknown as LLMComment);
      }
    }
    return {
      posts: [
        {
          id: 'p1',
          title: 'ask',
          content: 'body',
          comments,
        } as unknown as LLMPost,
      ],
    };
  }

  afterEach(() => {
    delete process.env.LLM_CHUNK_MAX_DOCS;
  });

  it('caps packed chunks at the docs cap even with token headroom', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const service = buildService();
    // 10 threads x 10 comments = 100 docs, tiny token footprint: the old
    // token-only packing would merge ALL of them into one 100-doc chunk.
    const { chunks, metadata } = service.createContextualChunks(
      buildInput(Array.from({ length: 10 }, () => 10)),
    );
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const meta of metadata) {
      expect(meta.commentCount).toBeLessThanOrEqual(30);
    }
    const total = metadata.reduce((sum, m) => sum + m.commentCount, 0);
    expect(total).toBe(100);
  });

  it('never splits a single thread larger than the cap (coherence)', () => {
    process.env.LLM_CHUNK_MAX_DOCS = '30';
    const service = buildService();
    const { metadata } = service.createContextualChunks(buildInput([45]));
    expect(metadata).toHaveLength(1);
    expect(metadata[0].commentCount).toBe(45);
  });
});
