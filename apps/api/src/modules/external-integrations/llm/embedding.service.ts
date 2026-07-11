import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';

/**
 * Text embeddings via Gemini. Used as the *recall* stage of entity resolution:
 * embeddings place semantically-equivalent terms near each other even when they
 * share no characters ("al fresco" ≈ "outdoor seating"), which string blocking
 * (trigram/token overlap) misses. Embeddings cannot do *precision* — antonyms
 * sit just as close ("thick" ≈ "thin") — so a caller must follow up with an LLM
 * judgment. Vectors are L2-normalized so cosine similarity is a plain dot product.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private genAI!: GoogleGenAI;
  private logger!: LoggerService;
  private redis: Redis | null = null;
  private readonly model = 'gemini-embedding-001';
  private readonly dimensions = 768;
  // 100 = Gemini embedding-API per-request item ceiling (provider limit,
  // not a tuning knob).
  private readonly batchSize = 100;
  // A string's embedding is immutable, so cache entries never go stale — the TTL
  // only bounds memory and model-version drift (the model is in the key, so a
  // model change just orphans old keys to expire). 30 days.
  private readonly queryCacheTtlSeconds = 60 * 60 * 24 * 30;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly usageLedger: UsageLedgerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('EmbeddingService');
    const apiKey = this.configService.get<string>('llm.apiKey') || '';
    this.genAI = new GoogleGenAI({ apiKey });
    try {
      this.redis = this.redisService.getOrThrow();
    } catch {
      this.redis = null; // cache is an optimization; embedding still works without it
    }
  }

  /**
   * Embed texts into L2-normalized vectors, returned in input order.
   * `taskType` SEMANTIC_SIMILARITY tunes the space for "are these alike" use.
   */
  async embed(
    texts: string[],
    taskType:
      | 'SEMANTIC_SIMILARITY'
      | 'CLUSTERING'
      | 'RETRIEVAL_DOCUMENT'
      | 'RETRIEVAL_QUERY' = 'SEMANTIC_SIMILARITY',
  ): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.genAI.models.embedContent({
        model: this.model,
        contents: batch,
        config: { taskType, outputDimensionality: this.dimensions },
      });
      this.usageLedger.record({
        service: 'gemini',
        operation: 'embedContent',
        model: this.model,
        mode: 'interactive',
        // embedContent bills per input token; usageMetadata isn't returned, so
        // approximate from characters (~4 chars/token) for cost slicing.
        inputTokens: Math.round(
          batch.reduce((sum, text) => sum + text.length, 0) / 4,
        ),
        requestCount: 1,
        caller: 'embedding.embed',
      });
      const vectors = response.embeddings ?? [];
      if (vectors.length !== batch.length) {
        this.logger.error('Embedding count mismatch', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'embed',
          requested: batch.length,
          received: vectors.length,
        });
        throw new Error(
          `Embedding count mismatch: requested ${batch.length}, got ${vectors.length}`,
        );
      }
      for (const vector of vectors) {
        out.push(this.normalize(vector.values ?? []));
      }
    }
    return out;
  }

  /**
   * Embed ONE query string (RETRIEVAL_QUERY) with a Redis cache. This is the
   * autocomplete/search hot path: a string's embedding is immutable, so the cache
   * is write-once-read-forever — the first occurrence of a query (globally) pays
   * the one embed call, every repeat is instant. That's what lets the dense lane
   * run ALWAYS (uniform, deterministic) instead of only as a fallback. Pre-warmed
   * by `scripts/warm-query-embedding-cache.ts`. Cache failures degrade to a live
   * embed, never an error.
   */
  async embedQuery(term: string): Promise<number[]> {
    const normalized = term?.trim();
    if (!normalized) return [];

    const key = this.queryCacheKey(normalized);
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const vec = JSON.parse(cached) as number[];
          if (Array.isArray(vec) && vec.length === this.dimensions) return vec;
        }
      } catch {
        // fall through to a live embed
      }
    }

    const [vec] = await this.embed([normalized], 'RETRIEVAL_QUERY');
    const out = vec ?? [];
    if (this.redis && out.length === this.dimensions) {
      try {
        await this.redis.set(
          key,
          JSON.stringify(out),
          'EX',
          this.queryCacheTtlSeconds,
        );
      } catch {
        // best-effort cache write
      }
    }
    return out;
  }

  /**
   * Pre-warm the query-embedding cache for a set of terms (entity names/aliases +
   * top historical queries). Skips already-cached terms, then embeds the rest in
   * batches of 100 and writes them — far cheaper than one `embedQuery` per term.
   * Run on deploy + periodically (`scripts/warm-query-embedding-cache.ts`).
   */
  async warmQueryCache(
    terms: string[],
  ): Promise<{ embedded: number; alreadyCached: number }> {
    const unique = Array.from(
      new Set(terms.map((t) => t?.trim()).filter((t): t is string => !!t)),
    );

    const toEmbed: string[] = [];
    let alreadyCached = 0;
    for (const term of unique) {
      if (this.redis) {
        try {
          if (await this.redis.get(this.queryCacheKey(term))) {
            alreadyCached++;
            continue;
          }
        } catch {
          // treat as a miss
        }
      }
      toEmbed.push(term);
    }

    let embedded = 0;
    for (let i = 0; i < toEmbed.length; i += this.batchSize) {
      const batch = toEmbed.slice(i, i + this.batchSize);
      const vectors = await this.embed(batch, 'RETRIEVAL_QUERY');
      for (let j = 0; j < batch.length; j++) {
        const vec = vectors[j];
        if (this.redis && vec?.length === this.dimensions) {
          try {
            await this.redis.set(
              this.queryCacheKey(batch[j]),
              JSON.stringify(vec),
              'EX',
              this.queryCacheTtlSeconds,
            );
          } catch {
            // best-effort
          }
        }
        embedded++;
      }
    }
    return { embedded, alreadyCached };
  }

  private queryCacheKey(term: string): string {
    const hash = createHash('sha256')
      .update(`${this.model}|${this.dimensions}|RETRIEVAL_QUERY|${term}`)
      .digest('hex')
      .slice(0, 32);
    return `crave:qemb:v1:${hash}`;
  }

  /** Cosine similarity of two L2-normalized vectors (a plain dot product). */
  static cosine(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  private normalize(vector: number[]): number[] {
    let norm = 0;
    for (const x of vector) norm += x * x;
    norm = Math.sqrt(norm);
    if (norm === 0) return vector;
    return vector.map((x) => x / norm);
  }
}
