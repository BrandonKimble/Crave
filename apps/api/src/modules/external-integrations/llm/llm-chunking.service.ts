import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMModelInput, LLMComment, LLMPost } from './llm.types';

const DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE = 35000;
/**
 * DOCS-PER-WINDOW CAP (miss-population RC4, 2026-08-27 — structural).
 * Packing was governed by the token budget ALONE, which produced chunks
 * averaging ~57 documents (max 143) — and emission decayed monotonically
 * with position inside the chunk: 43.2% of first-quintile doc-slots carried
 * evidence vs 35.5% in the last (−18% relative). A single call asked to run
 * the full extraction loop for 100+ sources gives the later ones measurably
 * less attention; no prompt sentence closes that gap. The honest lever is a
 * doc-count cap ALONGSIDE the token budget: stop adding to a window when it
 * already holds this many EMITTING comments.
 *
 * REPLY CHAINS, NOT WHOLE THREADS (rederivation 2026-09-04). The first cap
 * kept whole top-level threads unsplittable ("thread coherence"), and on the
 * v23 Austin shadow 539 of 1,762 chunks — every one a single mega-thread —
 * still ran 60 docs on average (max 143): the cap was a rule with a hole the
 * size of the problem. The unit the prompt actually needs coherent is the
 * REPLY CHAIN: its depth-aware resolution order reads the current comment,
 * then its parent, then earlier lines, then the post — never a sibling
 * subtree. So a thread larger than the cap splits at the next level: each
 * child subtree becomes its own packable unit, recursively, and every
 * window carries the full ancestor chain (post → … → the window's roots) as
 * CONTEXT-ONLY documents (`context_only: true`; the post under
 * `extract_from_post: false`), so "+1", "their brisket", "the one on Burnet"
 * still resolve exactly as before. A context-only comment never emits and
 * is never a `source_id`; it may be a `place_source_id` (the prompt's
 * "point at the source that NAMES the place"). The only irreducible unit
 * left is a LINEAR chain (each comment with exactly one reply): splitting
 * it would make the ancestor context grow quadratically for no attention
 * gain, so a chain ships whole even past the cap.
 *
 * Default 30 targets a ~25–30-doc average.
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

/** THE PAYLOAD CONTRACT'S ONE QUESTION PER DOCUMENT: does this window emit
 *  for it? A comment emits unless flagged `context_only`; a post body emits
 *  only under `extract_from_post: true`. Every coverage/activation/link
 *  writer derives its document set from THIS, so a context-only appearance
 *  can never satisfy coverage and a document's one emitting window is the
 *  one that claims it. */
export function isContextOnlyComment(
  comment: Pick<LLMComment, 'context_only'>,
): boolean {
  return comment.context_only === true;
}

export function emittingSourceIdsOf(input: LLMModelInput): {
  postIds: string[];
  commentIds: string[];
} {
  const postIds: string[] = [];
  const commentIds: string[] = [];
  for (const post of input.posts ?? []) {
    if (post.extract_from_post !== false) {
      postIds.push(post.id);
    }
    for (const comment of post.comments ?? []) {
      if (!isContextOnlyComment(comment)) {
        commentIds.push(comment.id);
      }
    }
  }
  return { postIds, commentIds };
}

/**
 * Chunk metadata for tracking processing information
 */
export interface ChunkMetadata {
  chunkId: string;
  /** EMITTING comments in the window (the attention-cap quantity). */
  commentCount: number;
  /** Ancestor comments riding along as context only (never emit). */
  contextCommentCount?: number;
  rootCommentScore: number;
  estimatedProcessingTime: number;
  threadRootId: string;
  /** Top-level thread roots that EMIT (fully or partly) in this window. */
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

type CommentNode = {
  comment: LLMComment;
  children: CommentNode[];
  /** Top-level thread root this node descends from (itself for a root). */
  root: LLMComment;
  /** Position in the post's depth-first reading order. */
  order: number;
};

/** One packable unit: comments that EMIT together (a whole subtree, or a
 *  linear chain prefix of a split subtree) plus the ancestor chain they
 *  need as context. */
type PackItem = {
  chain: LLMComment[];
  docs: LLMComment[];
  emitting: number;
  charLength: number;
};

type Window = {
  emittingIds: Set<string>;
  contextIds: Set<string>;
  emitting: number;
  charLength: number;
};

/**
 * LLM Chunking Service
 *
 * Reply-chain windows (see the cap note above):
 * - Each window = post context + the ancestor chain (context-only) + up to
 *   maxDocsPerChunk EMITTING comments, packed greedily in "top" order for
 *   top-level threads and reply order inside a thread.
 * - The token target is a ceiling, never the packing rule.
 * - SAME-POST PACKING ONLY (contamination A/B verdict 2026-07-11):
 *   cross-post packing resolved anaphora against co-packed sibling posts
 *   ("their sandwich joint" -> a restaurant from another post) and lost
 *   21-31% of mentions at every pack size. Windows never span posts;
 *   prompt-overhead economics are carried by the batch system-prompt cache.
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

  private estimateTokensFromChars(charCount: number): number {
    if (!Number.isFinite(charCount) || charCount <= 0) {
      return 0;
    }
    return Math.max(1, Math.floor(charCount / 4));
  }

  /**
   * Create reply-chain windows from Reddit post data.
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

    for (const post of llmInput.posts) {
      const postWindows = this.windowsForPost(post);
      const postMetadataStartIndex = chunkMetadata.length;
      for (const window of postWindows) {
        chunks.push(window.chunk);
        chunkMetadata.push(window.metadata);
      }

      const postChunkMetadata = chunkMetadata.slice(postMetadataStartIndex);
      if (postChunkMetadata.length > 0) {
        const chunkSizes = postChunkMetadata.map((m) => m.commentCount);
        this.logger.debug('Chunk distribution analysis for post', {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          totalPostChunks: postChunkMetadata.length,
          chunkSizes,
          contextSizes: postChunkMetadata.map(
            (m) => m.contextCommentCount ?? 0,
          ),
          largestChunk: Math.max(...chunkSizes),
          smallestChunk: Math.min(...chunkSizes),
        });
      }
    }

    const totalChunkSizes = chunkMetadata.map((m) => m.commentCount);
    const totalComments = totalChunkSizes.reduce((sum, size) => sum + size, 0);
    this.logger.info('Chunking complete', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      totalChunks: chunks.length,
      totalEmittingComments: totalComments,
      totalContextComments: chunkMetadata.reduce(
        (sum, m) => sum + (m.contextCommentCount ?? 0),
        0,
      ),
      averageChunkSize: chunks.length > 0 ? totalComments / chunks.length : 0,
      largestChunk:
        totalChunkSizes.length > 0 ? Math.max(...totalChunkSizes) : 0,
      targetTokens: this.maxTokensPerChunk,
      maxDocsPerChunk: this.maxDocsPerChunk,
    });

    return { chunks, metadata: chunkMetadata };
  }

  private windowsForPost(
    post: LLMPost,
  ): Array<{ chunk: LLMModelInput; metadata: ChunkMetadata }> {
    const postContextCharLength =
      (post.title?.length || 0) + (post.content?.length || 0);
    const extractFromPost = post.extract_from_post !== false;
    const comments = post.comments ?? [];

    if (comments.length === 0) {
      if (!extractFromPost) {
        // Nothing to emit: a covered post body with no comments is not a
        // window (the caller's dedupe should have dropped it).
        return [];
      }
      return [
        {
          chunk: {
            posts: [{ ...post, extract_from_post: true, comments: [] }],
          },
          metadata: {
            chunkId: `chunk_post_${post.id}`,
            commentCount: 0,
            contextCommentCount: 0,
            rootCommentScore: 0,
            estimatedProcessingTime: 5, // Base processing time for post only
            threadRootId: post.id,
            postId: post.id,
            postChunkIndex: 0,
            estimatedTokenCount: this.estimateTokensFromChars(
              postContextCharLength,
            ),
          },
        },
      ];
    }

    const { roots, byId } = this.buildForest(post);
    const items: PackItem[] = [];
    for (const root of roots) {
      this.flattenSubtree(root, [], items);
    }
    const windows = this.packItems(items, postContextCharLength);

    const result: Array<{ chunk: LLMModelInput; metadata: ChunkMetadata }> = [];
    let postChunkIndex = 0;
    for (const window of windows) {
      const isFirst = result.length === 0;
      const windowExtractsPost = isFirst && extractFromPost;
      if (window.emitting === 0 && !windowExtractsPost) {
        continue;
      }
      // Reading order = the post's depth-first order, filtered to this
      // window: ancestors always precede descendants, so the prompt's
      // depth-aware resolution walks the chain exactly as in a whole thread.
      const orderedComments = Array.from(byId.values())
        .filter(
          (node) =>
            window.emittingIds.has(node.comment.id) ||
            window.contextIds.has(node.comment.id),
        )
        .sort((a, b) => a.order - b.order)
        .map((node) =>
          window.emittingIds.has(node.comment.id)
            ? this.asEmitting(node.comment)
            : this.asContextOnly(node.comment),
        );
      const emittingRoots = new Map<string, number>();
      for (const node of byId.values()) {
        if (window.emittingIds.has(node.comment.id)) {
          emittingRoots.set(node.root.id, node.root.score ?? 0);
        }
      }
      const rootCommentIds = Array.from(emittingRoots.keys());
      const rootCommentScores = Array.from(emittingRoots.values());
      const contextCommentCount = orderedComments.length - window.emitting;

      result.push({
        chunk: {
          posts: [
            {
              ...post,
              extract_from_post: windowExtractsPost,
              comments: orderedComments,
            },
          ],
        },
        metadata: {
          chunkId: `chunk_${post.id}_w${postChunkIndex + 1}`,
          commentCount: window.emitting,
          contextCommentCount,
          rootCommentScore:
            rootCommentScores.length > 0 ? Math.max(...rootCommentScores) : 0,
          estimatedProcessingTime: Math.max(5, window.emitting * 6.4),
          threadRootId:
            rootCommentIds.length === 1
              ? rootCommentIds[0]
              : rootCommentIds.length === 0
                ? post.id
                : `group:${rootCommentIds.join(',')}`,
          rootCommentIds,
          rootCommentScores,
          postId: post.id,
          postChunkIndex,
          estimatedTokenCount: this.estimateTokensFromChars(window.charLength),
        },
      });
      postChunkIndex += 1;
    }
    return result;
  }

  /** Comments → forest. Top-level roots ("top" score order, as Reddit
   *  serves them) are comments whose parent is the post, null, or absent
   *  from the post (an orphan is its own root — there is no separate
   *  orphan chunk). Children keep input order (reply order). */
  private buildForest(post: LLMPost): {
    roots: CommentNode[];
    byId: Map<string, CommentNode>;
  } {
    const comments = post.comments ?? [];
    const bareId = post.id.replace('t3_', '');
    const nodesById = new Map<string, CommentNode>();
    for (const comment of comments) {
      nodesById.set(comment.id, {
        comment,
        children: [],
        root: comment,
        order: 0,
      });
    }
    const roots: CommentNode[] = [];
    for (const comment of comments) {
      const node = nodesById.get(comment.id)!;
      const parent =
        comment.parent_id &&
        comment.parent_id !== post.id &&
        comment.parent_id !== bareId
          ? nodesById.get(comment.parent_id)
          : undefined;
      if (parent && parent !== node) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    roots.sort((a, b) => (b.comment.score ?? 0) - (a.comment.score ?? 0));
    let order = 0;
    const visited = new Set<CommentNode>();
    const visit = (node: CommentNode, root: LLMComment) => {
      if (visited.has(node)) return;
      visited.add(node);
      node.root = root;
      node.order = order++;
      node.children = node.children.filter((child) => !visited.has(child));
      for (const child of node.children) visit(child, root);
    };
    for (const root of roots) visit(root, root.comment);
    // A parent_id cycle (malformed data) leaves its members unreachable
    // from any root; the first becomes a root so every comment ships
    // exactly once and the cycle edge is cut.
    for (const node of nodesById.values()) {
      if (!visited.has(node)) {
        roots.push(node);
        visit(node, node.comment);
      }
    }
    return { roots, byId: nodesById };
  }

  private subtreeInOrder(node: CommentNode): LLMComment[] {
    const out: LLMComment[] = [node.comment];
    for (const child of node.children) out.push(...this.subtreeInOrder(child));
    return out;
  }

  private emittingCount(comments: LLMComment[]): number {
    return comments.filter((c) => !isContextOnlyComment(c)).length;
  }

  private charLengthOf(comments: LLMComment[]): number {
    return comments.reduce((sum, c) => sum + (c.content?.length || 0), 0);
  }

  /** A subtree within the cap is one unit. Past the cap it splits at the
   *  first branching comment: the linear chain from the subtree root down to
   *  that comment is one unit (a chain is never split), and each of its
   *  child subtrees recurses with the chain appended to its ancestor
   *  context. */
  private flattenSubtree(
    node: CommentNode,
    chain: LLMComment[],
    out: PackItem[],
  ): void {
    const subtree = this.subtreeInOrder(node);
    const emitting = this.emittingCount(subtree);
    if (emitting <= this.maxDocsPerChunk) {
      out.push({
        chain,
        docs: subtree,
        emitting,
        charLength: this.charLengthOf(subtree),
      });
      return;
    }
    const prefix: LLMComment[] = [];
    let cursor = node;
    while (cursor.children.length === 1) {
      prefix.push(cursor.comment);
      cursor = cursor.children[0];
    }
    prefix.push(cursor.comment);
    out.push({
      chain,
      docs: prefix,
      emitting: this.emittingCount(prefix),
      charLength: this.charLengthOf(prefix),
    });
    const childChain = [...chain, ...prefix];
    for (const child of cursor.children) {
      this.flattenSubtree(child, childChain, out);
    }
  }

  /** Greedy packing in item order: an item joins the open window unless it
   *  would push EMITTING docs past the cap or the estimate past the token
   *  ceiling (a lone oversized item — an irreducible chain — still ships
   *  whole). Ancestor chains ride as context; a chain member already
   *  emitting in the window is not duplicated. */
  private packItems(
    items: PackItem[],
    postContextCharLength: number,
  ): Window[] {
    const windows: Window[] = [];
    let current: Window | null = null;
    const contextChars = new Map<string, number>();

    const flush = () => {
      if (current) windows.push(current);
      current = null;
      contextChars.clear();
    };

    for (const item of items) {
      if (current) {
        const newContext = item.chain.filter(
          (c) =>
            !current!.emittingIds.has(c.id) && !current!.contextIds.has(c.id),
        );
        const proposedChars =
          current.charLength + item.charLength + this.charLengthOf(newContext);
        const exceeds =
          current.emitting + item.emitting > this.maxDocsPerChunk ||
          this.estimateTokensFromChars(proposedChars) > this.maxTokensPerChunk;
        if (exceeds) flush();
      }
      if (!current) {
        current = {
          emittingIds: new Set(),
          contextIds: new Set(),
          emitting: 0,
          charLength: postContextCharLength,
        };
      }
      for (const ancestor of item.chain) {
        if (
          !current.emittingIds.has(ancestor.id) &&
          !current.contextIds.has(ancestor.id)
        ) {
          current.contextIds.add(ancestor.id);
          current.charLength += ancestor.content?.length || 0;
        }
      }
      for (const doc of item.docs) {
        if (isContextOnlyComment(doc)) {
          if (!current.contextIds.has(doc.id)) {
            current.contextIds.add(doc.id);
            current.charLength += doc.content?.length || 0;
          }
          continue;
        }
        if (current.contextIds.has(doc.id)) {
          // Was context for an earlier item; it emits here after all.
          current.contextIds.delete(doc.id);
        } else {
          current.charLength += doc.content?.length || 0;
        }
        current.emittingIds.add(doc.id);
        current.emitting += 1;
      }
    }
    flush();
    return windows;
  }

  private asEmitting(comment: LLMComment): LLMComment {
    if (comment.context_only === undefined) return comment;
    const emitting = { ...comment };
    delete emitting.context_only;
    return emitting;
  }

  private asContextOnly(comment: LLMComment): LLMComment {
    return { ...comment, context_only: true };
  }
}
