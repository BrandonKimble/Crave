import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { UsageLedgerService } from '../../external-integrations/shared/usage-ledger.service';
import { LLMPost } from '../../external-integrations/llm/llm.types';

export interface RelevanceGateResult {
  kept: LLMPost[];
  dropped: number;
  fromCache: number;
  judged: number;
}

const GATE_MODEL = 'gemini-3.1-flash-lite-preview';
const BATCH_SIZE = 25;
const BODY_CHARS = 500;

/**
 * Universal thread-admission gate (plans/archive-prefilter-pipeline.md):
 * judges each post's TITLE+BODY with a cheap model — "would this thread
 * plausibly name venues or dishes worth eating/drinking at?" — so the
 * expensive extraction prompt only reads plausible threads. Calibrated on a
 * hand-labeled 130-post corpus (scripts/relevance-gate/): keep-recall 1.000,
 * keep-precision 0.869 (fail-open by design — uncertainty and errors KEEP).
 *
 * Verdicts persist per (platform, postId): a post judged once is never
 * re-judged (re-loads and keyword overlaps are free) and false drops are
 * auditable. Runs interactively even when extraction defers to batch — the
 * gate costs ~$1 per full city, which doesn't justify two-phase batch
 * choreography.
 */
@Injectable()
export class RelevanceGateService implements OnModuleInit {
  private logger!: LoggerService;
  private genAI!: GoogleGenAI;
  private prompt!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly usageLedger: UsageLedgerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RelevanceGateService');
    this.genAI = new GoogleGenAI({
      apiKey: this.configService.get<string>('llm.apiKey') || '',
    });
    this.prompt = readFileSync(
      join(
        __dirname,
        '../../external-integrations/llm/prompts/relevance-gate-prompt.md',
      ),
      'utf8',
    );
  }

  /** Filter posts to the relevance-gate keepers. Fail-open everywhere: a
   *  judge error or missing verdict keeps the post. */
  async filterPosts(
    platform: string,
    posts: LLMPost[],
  ): Promise<RelevanceGateResult> {
    if (!posts.length) {
      return { kept: [], dropped: 0, fromCache: 0, judged: 0 };
    }

    const cached = await this.prisma.collectionRelevanceVerdict.findMany({
      where: { platform, postId: { in: posts.map((post) => post.id) } },
      select: { postId: true, keep: true },
    });
    const verdictById = new Map(cached.map((row) => [row.postId, row.keep]));
    const unseen = posts.filter((post) => !verdictById.has(post.id));

    let judged = 0;
    for (let i = 0; i < unseen.length; i += BATCH_SIZE) {
      const batch = unseen.slice(i, i + BATCH_SIZE);
      const verdicts = await this.judgeBatch(batch);
      judged += batch.length;
      const rows = batch.map((post, index) => ({
        platform,
        postId: post.id,
        keep: verdicts[index]?.keep ?? true,
        reason: verdicts[index]?.reason?.slice(0, 256) ?? 'fail_open',
        model: GATE_MODEL,
      }));
      for (const row of rows) {
        verdictById.set(row.postId, row.keep);
      }
      await this.prisma.collectionRelevanceVerdict
        .createMany({ data: rows, skipDuplicates: true })
        .catch((error: unknown) => {
          this.logger.warn('Verdict persistence failed (posts still gated)', {
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        });
    }

    const kept = posts.filter((post) => verdictById.get(post.id) !== false);
    const result: RelevanceGateResult = {
      kept,
      dropped: posts.length - kept.length,
      fromCache: cached.length,
      judged,
    };
    this.logger.info('Relevance gate applied', {
      platform,
      inPosts: posts.length,
      ...(result as unknown as Record<string, unknown>),
      kept: kept.length,
    });
    return result;
  }

  private async judgeBatch(
    posts: LLMPost[],
  ): Promise<Array<{ keep: boolean; reason: string } | null>> {
    const payload = posts.map((post, index) => ({
      index,
      title: post.title,
      body: (post.content ?? '').slice(0, BODY_CHARS),
    }));
    try {
      const response = await this.genAI.models.generateContent({
        model: GATE_MODEL,
        contents: [
          {
            parts: [
              {
                text: `${this.prompt}\n\n## Posts\n\n${JSON.stringify(payload)}`,
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      });
      this.usageLedger.record({
        service: 'gemini',
        operation: 'generateContent',
        model: GATE_MODEL,
        mode: 'interactive',
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        caller: 'relevance-gate.judgeBatch',
      });
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = JSON.parse(text) as {
        verdicts?: { index: number; keep: boolean; reason?: string }[];
      };
      const out: Array<{ keep: boolean; reason: string } | null> = posts.map(
        () => null,
      );
      for (const verdict of parsed.verdicts ?? []) {
        if (verdict.index >= 0 && verdict.index < posts.length) {
          out[verdict.index] = {
            keep: Boolean(verdict.keep),
            reason: verdict.reason ?? '',
          };
        }
      }
      return out;
    } catch (error) {
      this.logger.warn('Relevance judge call failed — failing open', {
        posts: posts.length,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return posts.map(() => null);
    }
  }
}
