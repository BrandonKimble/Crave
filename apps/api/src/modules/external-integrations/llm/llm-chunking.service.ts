import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMModelInput, LLMComment } from './llm.types';

const DEFAULT_MAX_CHUNK_COMMENTS = 80;
const DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE = 35000;
/**
 * DOCS-PER-CHUNK CAP (miss-population RC4, 2026-08-27 — structural).
 * Packing was governed by the token budget ALONE, which produced chunks
 * averaging ~57 documents (max 143) — and emission decayed monotonically
 * with position inside the chunk: 43.2% of first-quintile doc-slots carried
 * evidence vs 35.5% in the last (−18% relative). A single call asked to run
 * the full extraction loop for 100+ sources gives the later ones measurably
 * less attention; no prompt sentence closes that gap. The honest lever is a
 * doc-count cap ALONGSIDE the token budget: stop adding a thread when the
 * chunk already holds this many comments (a single larger thread stays
 * whole — thread coherence is never split).
 *
 * Default 30 targets a ~25–30-doc average (threads pack greedily under the
 * cap; only unsplittable mega-threads exceed it).
 *
 * COST MULTIPLIER (computed, not guessed): halving docs/chunk roughly
 * doubles the call count, but the per-call overhead is the SYSTEM prompt,
 * which is batch-cached (~19k tokens for the v17 candidate: 76KB / 4 —
 * read at 0.1x input price ≈ 1.9k token-equivalents per call) plus the
 * repeated post
 * context. Payload runs up to the 35k-token target per chunk, so the
 * marginal cost of one extra call is ~2k token-equivalents against a
 * ~15–35k payload — total input cost multiplier ≈ 1.1–1.3x for 2x calls,
 * not 2x. Output tokens are unchanged (same mentions, split across calls).
 */
const DEFAULT_MAX_DOCS_PER_CHUNK = 30;

/** Same boot-refuse contract as resolveChunkTargetTokens (F4954): absent →
 *  default; set-but-invalid crashes startup instead of silently coercing. */
export function resolveChunkMaxDocs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_MAX_DOCS_PER_CHUNK;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `LLM_CHUNK_MAX_DOCS must be a positive integer when set; got '${raw}'.`,
    );
  }
  return parsed;
}

/**
 * Resolve LLM_CHUNK_TARGET_TOKENS at BOOT, not per chunk (F4954).
 *
 * ABSENT → the documented default (an owner choice, declared here). But a value
 * that is SET and unparseable/non-positive (`abc`, `0`, `-1`) is REFUSED, not
 * silently coerced to the default: `plans/env-config-audit.md` already caught a
 * stale `LLM_CHUNK_TARGET_TOKENS=30000` living in `.env` unnoticed — the exact
 * class of "the override is wrong and nobody sees it" a silent parse-fallback
 * guarantees. Boot fails loud instead, and the running service holds a typed
 * number with no parser and no per-post fallback.
 */
export function resolveChunkTargetTokens(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `LLM_CHUNK_TARGET_TOKENS must be a positive integer when set; got '${raw}'. ` +
        `A silent fallback here once hid a stale override (env-config-audit).`,
    );
  }
  return parsed;
}

/**
 * Chunk metadata for tracking processing information
 */
export interface ChunkMetadata {
  chunkId: string;
  commentCount: number;
  rootCommentScore: number;
  estimatedProcessingTime: number;
  threadRootId: string;
  rootCommentIds?: string[];
  rootCommentScores?: number[];
  postId?: string;
  postChunkIndex?: number;
  estimatedTokenCount?: number;
}

/**
 * Result structure for chunking operation
 */
export interface ChunkResult<TInput extends LLMModelInput = LLMModelInput> {
  chunks: TInput[];
  metadata: ChunkMetadata[];
}

/**
 * LLM Chunking Service
 *
 * Implements context-aware chunking strategy for Reddit post data:
 * - Each chunk = 1 top-level comment + all its replies + post context
 * - Maintains "top" sorting order (most valuable content first)
 * - Preserves referential context completely
 * - Handles variable chunk sizes gracefully (1 to 50+ comments per chunk)
 */
@Injectable()
export class LLMChunkingService implements OnModuleInit {
  private logger!: LoggerService;
  /** Resolved once at boot (onModuleInit) — refuses a set-but-invalid value. */
  private maxTokensPerChunk = DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE;
  /** Resolved once at boot; the attention-decay cap (see the header note). */
  private maxDocsPerChunk = DEFAULT_MAX_DOCS_PER_CHUNK;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LlmChunking');
    // BOOT-REFUSE an invalid token budget here — not a per-chunk silent
    // fallback (F4954). A bad LLM_CHUNK_TARGET_TOKENS crashes startup.
    this.maxTokensPerChunk = resolveChunkTargetTokens(
      process.env.LLM_CHUNK_TARGET_TOKENS,
    );
    this.maxDocsPerChunk = resolveChunkMaxDocs(process.env.LLM_CHUNK_MAX_DOCS);
  }

  private getChunkingLimits(): {
    maxCommentsPerChunk: number;
    maxCharsPerChunk: number;
    maxTokensPerChunk: number;
    maxDocsPerChunk: number;
  } {
    const maxTokensPerChunk = this.maxTokensPerChunk;
    return {
      // Thread-coherence bound only (a single degenerate mega-thread), not a
      // packing knob — packing is governed by the token target plus the
      // docs-per-chunk attention cap (miss RC4).
      maxCommentsPerChunk: DEFAULT_MAX_CHUNK_COMMENTS,
      maxDocsPerChunk: this.maxDocsPerChunk,
      // DERIVED from the token target (4 chars/token estimate). The old
      // independent LLM_MAX_CHUNK_CHARS=12000 knob silently capped every
      // chunk at ~3k tokens, making the token target unreachable — the
      // packing audit (2026-07-11) measured ~2k content tokens/request
      // against a 35k target, with the system prompt at ~90% of all input.
      maxCharsPerChunk: maxTokensPerChunk * 4,
      maxTokensPerChunk,
    };
  }

  private estimateTokensFromChars(charCount: number): number {
    if (!Number.isFinite(charCount) || charCount <= 0) {
      return 0;
    }
    return Math.max(1, Math.floor(charCount / 4));
  }

  /**
   * Create context-preserving chunks from Reddit post data
   * Maintains "top" sorting order to process most valuable content first
   *
   * OPTIMIZATION: Uses lightweight post objects in chunks 2+ to save ~1,000 tokens per batch.
   * First chunk includes full post for extraction, subsequent chunks exclude unnecessary metadata.
   *
   * @param llmInput - Multiple posts with all comments (processes all posts)
   * @returns ChunkResult with chunks and metadata
   */
  createContextualChunks(llmInput: LLMModelInput): ChunkResult {
    const chunks: LLMModelInput[] = [];
    const chunkMetadata: ChunkMetadata[] = [];

    if (!llmInput.posts || llmInput.posts.length === 0) {
      this.logger.warn('No posts provided for chunking', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'create_contextual_chunks',
      });
      return { chunks: [], metadata: [] };
    }

    this.logger.debug('Creating chunks from multiple posts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      postIds: llmInput.posts.map((p) => p.id),
      totalComments: llmInput.posts.reduce(
        (sum, p) => sum + (p.comments?.length || 0),
        0,
      ),
    });

    // Process each post individually
    for (let postIndex = 0; postIndex < llmInput.posts.length; postIndex++) {
      const post = llmInput.posts[postIndex];

      this.logger.debug(
        `Processing post ${postIndex + 1}/${llmInput.posts.length}`,
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          postTitle: post.title,
          commentCount: post.comments?.length || 0,
        },
      );

      if (!post.comments || post.comments.length === 0) {
        const postContextCharLength =
          (post.title?.length || 0) + (post.content?.length || 0);
        const postTokens = this.estimateTokensFromChars(postContextCharLength);
        this.logger.debug(
          'No comments to chunk, adding single chunk with post only',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            postId: post.id,
          },
        );

        chunks.push({
          posts: [
            {
              id: post.id,
              // Extract from comment-less posts unless the caller pre-decided
              // (thread-level dedupe sends an already-covered post body as
              // context only, extract_from_post === false)
              extract_from_post: post.extract_from_post !== false,
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            },
          ],
        });

        chunkMetadata.push({
          chunkId: `chunk_post_${post.id}`,
          commentCount: 0,
          rootCommentScore: 0,
          estimatedProcessingTime: 5, // Base processing time for post only
          threadRootId: post.id,
          postId: post.id,
          postChunkIndex: 0,
          estimatedTokenCount: postTokens,
        });

        continue; // Continue to next post instead of returning
      }

      // Get top-level comments (parent_id is null or points to post)
      // Comments should already be sorted by "top" from Reddit API
      const topLevelComments = post.comments
        .filter(
          (c) =>
            c.parent_id === null ||
            c.parent_id === post.id ||
            c.parent_id === post.id.replace('t3_', ''),
        )
        .sort((a, b) => b.score - a.score); // Ensure top-scored first

      this.logger.debug('Creating chunks from top comments', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId: post.id,
        totalTopLevel: topLevelComments.length,
        totalComments: post.comments.length,
        topScores: topLevelComments.slice(0, 5).map((c) => c.score),
      });

      const postChunkStartIndex = chunks.length;
      const postMetadataStartIndex = chunkMetadata.length;
      const {
        maxCommentsPerChunk,
        maxCharsPerChunk,
        maxTokensPerChunk,
        maxDocsPerChunk,
      } = this.getChunkingLimits();
      const softTokenThreshold = Math.max(
        1000,
        Math.floor(maxTokensPerChunk * 0.8),
      );
      const postContextCharLength =
        (post.title?.length || 0) + (post.content?.length || 0);

      type ThreadInfo = {
        topComment: LLMComment;
        threadComments: LLMComment[];
        commentCount: number;
        charLength: number;
        rootScore: number;
      };

      const threadInfos: ThreadInfo[] = topLevelComments.map((topComment) => {
        const threadComments = this.getFullThread(topComment, post.comments);
        const charLength = threadComments.reduce((sum, comment) => {
          return sum + (comment.content?.length || 0);
        }, 0);

        return {
          topComment,
          threadComments,
          commentCount: threadComments.length,
          charLength,
          rootScore: topComment.score,
        };
      });

      type ThreadGroup = {
        threads: ThreadInfo[];
        commentCount: number;
        charLength: number;
      };

      const groupedThreads: ThreadGroup[] = [];
      let currentGroup: ThreadGroup | null = null;
      let chunkSequenceForPost = 0;

      for (const thread of threadInfos) {
        if (!currentGroup) {
          currentGroup = {
            threads: [thread],
            commentCount: thread.commentCount,
            charLength: postContextCharLength + thread.charLength,
          };
          continue;
        }

        const proposedCommentCount =
          currentGroup.commentCount + thread.commentCount;
        const proposedCharLength = currentGroup.charLength + thread.charLength;
        const proposedTokenEstimate =
          this.estimateTokensFromChars(proposedCharLength);

        const exceedsLimits =
          proposedCharLength > maxCharsPerChunk ||
          proposedTokenEstimate > maxTokensPerChunk ||
          // ATTENTION CAP (miss RC4): a HARD doc-count bound — adding this
          // thread would push the chunk past the docs-per-chunk cap, so it
          // starts a new chunk (a lone thread bigger than the cap still
          // stays whole: thread coherence is never split).
          proposedCommentCount > maxDocsPerChunk ||
          (proposedCommentCount > maxCommentsPerChunk &&
            proposedTokenEstimate >= softTokenThreshold);

        if (exceedsLimits) {
          groupedThreads.push(currentGroup);
          currentGroup = {
            threads: [thread],
            commentCount: thread.commentCount,
            charLength: postContextCharLength + thread.charLength,
          };
        } else {
          currentGroup.threads.push(thread);
          currentGroup.commentCount = proposedCommentCount;
          currentGroup.charLength = proposedCharLength;
        }
      }

      if (currentGroup) {
        groupedThreads.push(currentGroup);
      }

      groupedThreads.forEach((group, groupIndex) => {
        // Group 0 carries post-body extraction by default, but a caller may
        // pre-decide extract_from_post === false (thread-level dedupe: post
        // body already covered, riding along as context only).
        const shouldExtractFromPost =
          groupIndex === 0 && post.extract_from_post !== false;
        const chunkPost = shouldExtractFromPost
          ? {
              id: post.id,
              extract_from_post: true,
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            }
          : {
              id: post.id,
              extract_from_post: false,
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            };

        const combinedComments = group.threads.flatMap(
          (thread) => thread.threadComments,
        );
        const rootCommentIds = group.threads.map(
          (thread) => thread.topComment.id,
        );
        const rootCommentScores = group.threads.map(
          (thread) => thread.rootScore,
        );
        const commentCount = combinedComments.length;
        const chunkId =
          group.threads.length === 1
            ? `chunk_${rootCommentIds[0]}`
            : `chunk_${post.id}_group_${groupIndex + 1}`;
        const tokenEstimate = this.estimateTokensFromChars(group.charLength);

        chunks.push({
          posts: [
            {
              ...chunkPost,
              comments: combinedComments,
            },
          ],
        });

        chunkMetadata.push({
          chunkId,
          commentCount,
          rootCommentScore: Math.max(...rootCommentScores),
          estimatedProcessingTime: commentCount * 6.4,
          threadRootId:
            group.threads.length === 1
              ? rootCommentIds[0]
              : `group:${rootCommentIds.join(',')}`,
          rootCommentIds,
          rootCommentScores,
          postId: post.id,
          postChunkIndex: chunkSequenceForPost++,
          estimatedTokenCount: tokenEstimate,
        });
      });

      // Handle orphaned comments for this post (defensive programming)
      const thisPostChunks = chunks.slice(postChunkStartIndex);

      const processedCommentIds = new Set<string>();
      thisPostChunks.forEach((chunk) => {
        chunk.posts[0].comments.forEach((comment) => {
          processedCommentIds.add(comment.id);
        });
      });

      const orphanedComments = post.comments.filter(
        (c) => !processedCommentIds.has(c.id),
      );
      if (orphanedComments.length > 0) {
        const orphanCharLength =
          postContextCharLength +
          orphanedComments.reduce(
            (sum, comment) => sum + (comment.content?.length || 0),
            0,
          );
        const orphanTokens = this.estimateTokensFromChars(orphanCharLength);

        this.logger.debug('Found orphaned comments, adding as separate chunk', {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          orphanedCount: orphanedComments.length,
          orphanedIds: orphanedComments.slice(0, 5).map((c) => c.id),
        });

        // Orphaned comments get lightweight post context
        chunks.push({
          posts: [
            {
              // Lightweight post object for orphaned chunk
              id: post.id,
              extract_from_post: false, // PROMINENT: Never extract from post in orphaned chunk
              title: post.title,
              content: post.content, // Keep for context
              subreddit: post.subreddit, // Keep for references
              author: post.author, // Keep author field
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: orphanedComments,
            },
          ],
        });

        chunkMetadata.push({
          chunkId: `chunk_orphaned_${post.id}`,
          commentCount: orphanedComments.length,
          rootCommentScore: Math.max(
            ...orphanedComments.map((c) => c.score || 0),
          ),
          estimatedProcessingTime: orphanedComments.length * 6.4,
          threadRootId: 'orphaned',
          postId: post.id,
          postChunkIndex: chunkSequenceForPost++,
          estimatedTokenCount: orphanTokens,
        });
      }

      // Log chunk distribution analysis for this post
      const postChunkMetadata = chunkMetadata.slice(postMetadataStartIndex);
      const chunkSizes = postChunkMetadata.map((m) => m.commentCount);
      const totalChunkComments = chunkSizes.reduce(
        (sum, size) => sum + size,
        0,
      );
      const aggregatedRootScores = postChunkMetadata.flatMap((meta) =>
        Array.isArray(meta.rootCommentScores) &&
        meta.rootCommentScores.length > 0
          ? meta.rootCommentScores
          : [meta.rootCommentScore],
      );

      if (postChunkMetadata.length > 0) {
        this.logger.debug('Chunk distribution analysis for post', {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          postIndex: postIndex + 1,
          totalPostChunks: postChunkMetadata.length,
          chunkSizes,
          averageChunkSize: totalChunkComments / postChunkMetadata.length || 0,
          largestChunk: Math.max(...chunkSizes),
          smallestChunk: Math.min(...chunkSizes),
          topRootScores: aggregatedRootScores.slice(0, 10),
          estimatedTotalTime: Math.max(
            ...postChunkMetadata.map((m) => m.estimatedProcessingTime),
          ),
        });
      }
    } // End of post processing loop

    // Final summary logging for all posts
    const totalChunkSizes = chunkMetadata.map((m) => m.commentCount);
    const totalComments = totalChunkSizes.reduce((sum, size) => sum + size, 0);
    const allRootScores = chunkMetadata.flatMap((meta) =>
      Array.isArray(meta.rootCommentScores) && meta.rootCommentScores.length > 0
        ? meta.rootCommentScores
        : [meta.rootCommentScore],
    );

    this.logger.debug('Final chunk distribution analysis - all posts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      totalChunks: chunks.length,
      totalComments,
      chunkSizes: totalChunkSizes,
      averageChunkSize: chunks.length > 0 ? totalComments / chunks.length : 0,
      largestChunk:
        totalChunkSizes.length > 0 ? Math.max(...totalChunkSizes) : 0,
      smallestChunk:
        totalChunkSizes.length > 0 ? Math.min(...totalChunkSizes) : 0,
      topRootScores: allRootScores.slice(0, 10),
      estimatedTotalTime:
        chunkMetadata.length > 0
          ? Math.max(...chunkMetadata.map((m) => m.estimatedProcessingTime))
          : 0,
    });

    // SAME-POST PACKING ONLY (contamination A/B verdict 2026-07-11):
    // cross-post packing FAILED its empirical gate — packed runs resolved
    // anaphora against co-packed sibling posts (proven at 8k: "their
    // sandwich joint" -> a restaurant from another post) and lost 21-31% of
    // mentions at every pack size, with no passing knee before N=1. So
    // merging is restricted to chunks of the SAME post (group_1+group_2 —
    // one sealed world, safe by construction; the old 12k-char cap was
    // splitting single posts needlessly). Prompt-overhead economics are
    // carried by the explicit batch system-prompt cache instead.
    // Re-gate any future cross-post attempt with scripts/packing-ab.ts.
    return this.packChunks(chunks, chunkMetadata);
  }

  private packChunks(
    chunks: LLMModelInput[],
    metadata: ChunkMetadata[],
  ): ChunkResult {
    const { maxTokensPerChunk, maxDocsPerChunk } = this.getChunkingLimits();
    const packedChunks: LLMModelInput[] = [];
    const packedMetadata: ChunkMetadata[] = [];
    let currentPosts: Map<string, LLMModelInput['posts'][number]> | null = null;
    let currentTokens = 0;
    let currentDocs = 0;
    let currentMeta: ChunkMetadata | null = null;

    const flush = () => {
      if (!currentPosts || !currentMeta) return;
      packedChunks.push({ posts: Array.from(currentPosts.values()) });
      packedMetadata.push({
        ...currentMeta,
        estimatedTokenCount: currentTokens,
      });
      currentPosts = null;
      currentTokens = 0;
      currentDocs = 0;
      currentMeta = null;
    };

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const meta = metadata[index];
      const tokens =
        meta.estimatedTokenCount ??
        this.estimateTokensFromChars(JSON.stringify(chunk).length);
      const currentPostIds = currentPosts ? new Set(currentPosts.keys()) : null;
      const sameSinglePost =
        currentPostIds !== null &&
        currentPostIds.size === 1 &&
        chunk.posts.length === 1 &&
        currentPostIds.has(chunk.posts[0].id);
      if (
        currentPosts &&
        (!sameSinglePost ||
          currentTokens + tokens > maxTokensPerChunk ||
          // ATTENTION CAP (miss RC4): packing was token-governed only, which
          // built 57-avg/143-max-doc chunks and cost the tail ~18% relative
          // emission. Same law as grouping: merging must not push the packed
          // chunk past the docs cap (a lone oversized raw chunk still ships
          // whole — coherence).
          currentDocs + meta.commentCount > maxDocsPerChunk)
      ) {
        flush();
      }
      if (!currentPosts) {
        currentPosts = new Map();
        currentMeta = {
          ...meta,
          chunkId: `pack_${packedChunks.length}_${meta.chunkId}`,
        };
      } else if (currentMeta) {
        currentMeta.commentCount += meta.commentCount;
      }
      for (const post of chunk.posts) {
        const existing = currentPosts.get(post.id);
        if (existing) {
          existing.comments = [
            ...(existing.comments ?? []),
            ...(post.comments ?? []),
          ];
          if ((post as { extract_from_post?: boolean }).extract_from_post) {
            (existing as { extract_from_post?: boolean }).extract_from_post =
              true;
          }
        } else {
          currentPosts.set(post.id, {
            ...post,
            comments: [...(post.comments ?? [])],
          });
        }
      }
      currentTokens += tokens;
      currentDocs += meta.commentCount;
    }
    flush();

    this.logger.info('Chunk packing complete', {
      correlationId: CorrelationUtils.getCorrelationId(),
      rawChunks: chunks.length,
      packedChunks: packedChunks.length,
      targetTokens: maxTokensPerChunk,
    });
    return { chunks: packedChunks, metadata: packedMetadata };
  }

  /**
   * Recursively get all comments in a thread starting from a root comment
   *
   * @param root - Root comment of the thread
   * @param allComments - All comments from the post
   * @returns Array of all comments in the thread (including root)
   */
  private getFullThread(
    root: LLMComment,
    allComments: LLMComment[],
  ): LLMComment[] {
    const thread = [root];

    // Find all direct replies to this comment
    const replies = allComments.filter((c) => c.parent_id === root.id);

    // Recursively get full threads for each reply
    for (const reply of replies) {
      thread.push(...this.getFullThread(reply, allComments));
    }

    return thread;
  }
}
