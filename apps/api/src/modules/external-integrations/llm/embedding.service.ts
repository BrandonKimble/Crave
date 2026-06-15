import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LoggerService, CorrelationUtils } from '../../../shared';

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
  private readonly model = 'gemini-embedding-001';
  private readonly dimensions = 768;
  private readonly batchSize = 100;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('EmbeddingService');
    const apiKey = this.configService.get<string>('llm.apiKey') || '';
    this.genAI = new GoogleGenAI({ apiKey });
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
