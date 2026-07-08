import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { UsageLedgerService } from '../../external-integrations/shared/usage-ledger.service';
import {
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
  jsonSchemaToTypedSchema,
} from '../../external-integrations/llm/prompts/llm-response-schemas';
import { LLMPost } from '../../external-integrations/llm/llm.types';

export interface RelevanceGateResult {
  kept: LLMPost[];
  dropped: number;
  fromCache: number;
  judged: number;
}

const GATE_MODEL = 'gemini-3.1-flash-lite-preview';
// NO body truncation — a 500-char window caused PROVEN false drops (itinerary
// posts express food intent at char ~500-800: "Find a place to eat Okonomiyaki"
// @573). Reddit caps selftext at 40k chars, so cost is bounded by DYNAMIC
// PACKING instead: posts fill a call until the token budget is reached.
const PACK_TOKEN_BUDGET = 20000;
const PACK_MAX_POSTS = 25;

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
  private promptHash!: string;

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
    this.promptHash = createHash('sha256')
      .update(this.prompt)
      .digest('hex')
      .slice(0, 16);
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
    const batches: LLMPost[][] = [];
    let current: LLMPost[] = [];
    let currentTokens = 0;
    for (const post of unseen) {
      const postTokens = Math.ceil(
        (post.title.length + (post.content ?? '').length) / 4,
      );
      if (
        current.length &&
        (current.length >= PACK_MAX_POSTS ||
          currentTokens + postTokens > PACK_TOKEN_BUDGET)
      ) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }
      current.push(post);
      currentTokens += postTokens;
    }
    if (current.length) {
      batches.push(current);
    }
    for (const batch of batches) {
      const verdicts = await this.judgeBatch(batch);
      judged += batch.length;
      const rows = batch.map((post, index) => ({
        platform,
        postId: post.id,
        keep: verdicts[index]?.keep ?? true,
        reason:
          verdicts[index]?.reason?.slice(0, 256) ??
          (verdicts[index] ? null : 'fail_open'),
        model: GATE_MODEL,
        promptHash: this.promptHash,
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
  ): Promise<Array<{ keep: boolean; reason?: string } | null>> {
    const payload = posts.map((post, index) => ({
      index,
      title: post.title,
      body: post.content ?? '',
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
          // Schema is the output-shape authority. Gate reasons are EXEMPT
          // from the audit-reason policy: they are PERSISTED per verdict and
          // audit an IRREVERSIBLE decision (a dropped post never reaches
          // extraction) — ~$0.08/city of output tokens for a permanent
          // record of why signal was excluded. The policy covers only
          // ephemeral judge reasons that would be paid for and discarded.
          // TYPED responseSchema (not responseJsonSchema): flash-lite treats
          // the json-schema form as advisory on long prompts and emits a
          // bare array — typed is enforced (same lesson as the batch
          // backend).
          responseSchema: jsonSchemaToTypedSchema(
            RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
          ),
          maxOutputTokens: 65536,
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
      const raw = JSON.parse(text) as unknown;
      // Tolerate both the schema object and a bare verdict array (fail-open
      // parsing — a malformed response must never drop posts).
      const verdictList = Array.isArray(raw)
        ? (raw as { index: number; keep: boolean; reason?: string }[])
        : ((raw as Record<string, unknown>)?.verdicts as
            | { index: number; keep: boolean; reason?: string }[]
            | undefined);
      const parsed = { verdicts: verdictList };
      const out: Array<{ keep: boolean; reason?: string } | null> = posts.map(
        () => null,
      );
      for (const verdict of parsed.verdicts ?? []) {
        if (verdict.index >= 0 && verdict.index < posts.length) {
          out[verdict.index] = {
            keep: Boolean(verdict.keep),
            reason: verdict.reason,
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
