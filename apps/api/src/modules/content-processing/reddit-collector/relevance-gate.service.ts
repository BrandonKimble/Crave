import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
  jsonSchemaToTypedSchema,
} from '../../external-integrations/llm/prompts/llm-response-schemas';
import { LLMPost } from '../../external-integrations/llm/llm.types';
import {
  PromptRegistryService,
  RELEVANCE_GATE_PROMPT_KIND,
} from '../../external-integrations/llm/prompt-registry.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { callerProfile } from '../../external-integrations/llm/gemini-caller-profiles';

export interface RelevanceGateResult {
  kept: LLMPost[];
  dropped: number;
  fromCache: number;
  judged: number;
}

// The model is owned by the caller profile; this alias exists only for the
// persisted verdict rows and CANNOT drift from what actually ran.
const GATE_MODEL = callerProfile('relevance-gate.judgeBatch')!.model!;
// NO body truncation — a 500-char window caused PROVEN false drops (itinerary
// posts express food intent at char ~500-800: "Find a place to eat Okonomiyaki"
// @573). Reddit caps selftext at 40k chars, so cost is bounded by DYNAMIC
// PACKING instead: posts fill a call until the token budget is reached.
// Pack density RECALIBRATED 2026-07-29 through the PRODUCTION path
// (scripts/relevance-gate/density-replay.ts drives filterPosts itself):
// 130-post labeled corpus, keep-recall 1.000 / keep-precision 0.797 under
// the shipped configuration (gateway, systemInstruction placement, MINIMAL
// thinking). Re-run density-replay.ts if either constant grows.
const PACK_TOKEN_BUDGET = 20000;
const PACK_MAX_POSTS = 25;

/**
 * Reason-shape handling lives HERE, not in the prompt (2026-08-12 prompt
 * rederivation). The prompt used to carry an operational sentence — "when the
 * `reason` field is not in the requested output shape, omit reasons entirely"
 * — a leftover from the reasons-off era, when this service appended a lean
 * output shape to the system instruction. Instructing a model on how to cope
 * with a shape WE control spends tokens teaching it our plumbing and cannot be
 * enforced anyway; the parser can simply accept whatever comes back.
 *
 * A reason is kept only when it is a non-empty string. Anything else — absent,
 * null, a number, an object the model wrapped it in — becomes `undefined`,
 * which persists as NULL (the verdict itself is never affected: a malformed
 * reason must never change keep/drop).
 */
export function normalizeVerdictReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Universal thread-admission gate (plans/archive-prefilter-pipeline.md):
 * judges each post's TITLE+BODY with a cheap model — "would this thread
 * plausibly name venues or dishes worth eating/drinking at?" — so the
 * expensive extraction prompt only reads plausible threads. Calibrated on a
 * hand-labeled 130-post corpus (scripts/relevance-gate/): keep-recall 1.000,
 * keep-precision 0.797 under the shipped 2026-07-29 configuration
 * (fail-open by design — uncertainty and errors KEEP).
 *
 * Verdicts persist per (platform, postId, promptHash): a post judged once
 * UNDER THE CURRENT GATE CONFIG is never re-judged (re-loads and keyword
 * overlaps are free), false drops are auditable, and a config change
 * re-opens every post — superseded verdicts stay as history (P7 re-open,
 * 2026-08-17; ~$1 per full city per bump, deliberate). Runs interactively
 * even when extraction defers to batch — the
 * gate costs ~$1 per full city, which doesn't justify two-phase batch
 * choreography.
 */
@Injectable()
export class RelevanceGateService implements OnModuleInit {
  private logger!: LoggerService;
  private prompt!: string;
  private promptHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly llmService: LLMService,
    private readonly promptRegistry: PromptRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('RelevanceGateService');
    // REGISTRY TENANT (2026-08-01): the gate prompt lives in llm_prompts
    // (kind 'relevance_gate', self-seeded from the asset) — same law as the
    // collection prompt, no parallel file-loader silo. Fail-open to the
    // shipped asset if the registry is unreachable at boot.
    try {
      this.prompt = (
        await this.promptRegistry.getActive(RELEVANCE_GATE_PROMPT_KIND)
      ).content;
    } catch (error) {
      // F7 (final red team): this was a bare `catch {}` — a worker running
      // the gate on the asset file instead of the registry's active version
      // was undetectable. Correctness is still fine (the config
      // discriminator hashes the prompt actually used), but the divergence
      // must be visible.
      this.logger.warn(
        'Relevance-gate prompt registry unavailable — falling back to the shipped asset',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      this.prompt = readFileSync(
        join(
          __dirname,
          '../../external-integrations/llm/prompts/relevance-gate-prompt.md',
        ),
        'utf8',
      );
    }
    // CONFIG hash, not just prompt hash (red team F3). All 8,197 verdicts
    // persisted before 2026-07-27 were judged under Gemini-3's implicit
    // HIGH thinking, and this commit moved the gate prompt from the user
    // text part to systemInstruction — both real configuration changes that
    // a prompt-text hash cannot see. The discriminator makes every future
    // row honest about WHICH judging configuration produced it — and since
    // the P7 re-open (2026-08-17) it is part of the verdict's IDENTITY:
    // reuse is keyed on it, so changing the config re-judges every post.
    // (The 130-post calibration numbers describe the old configuration —
    // re-run density-replay before trusting them for this one.)
    // The discriminator is the REAL profile, serialized — a hand-written
    // literal here could not see a profile model/thinking change (red team
    // R7 round 2). Placement is the one config fact the profile cannot
    // know.
    this.promptHash = createHash('sha256')
      .update(
        `${this.prompt}\n@gate-config placement=systemInstruction ${JSON.stringify(
          callerProfile('relevance-gate.judgeBatch'),
        )}`,
      )
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
      // Config-scoped reuse: only a verdict from THIS gate configuration
      // counts; a row from a superseded config leaves the post unseen, so
      // the bump re-judges it (the P7 re-open).
      where: {
        platform,
        postId: { in: posts.map((post) => post.id) },
        promptHash: this.promptHash,
      },
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
      // Fail-open verdicts (judge error → null) keep the post for THIS run
      // but are NOT persisted: an absent row re-judges next collection,
      // instead of a transient error becoming a permanent keep=true.
      const rows = batch.flatMap((post, index) => {
        const verdict = verdicts[index];
        verdictById.set(post.id, verdict?.keep ?? true);
        if (!verdict) {
          return [];
        }
        return [
          {
            platform,
            postId: post.id,
            keep: verdict.keep,
            reason: verdict.reason?.slice(0, 256) ?? null,
            model: GATE_MODEL,
            promptHash: this.promptHash,
          },
        ];
      });
      if (rows.length) {
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
      // THE GATEWAY, not a private client (2026-07-29). This service used to
      // hold its own GoogleGenAI and hand-assemble the request — the exact
      // assembler pattern behind every cost bug this month: it forgot the
      // thinking level (HIGH by default), never recorded cached tokens, and
      // bypassed spend admission entirely. generateForCaller supplies all of
      // it from the caller profile; this file keeps only what is genuinely
      // the gate's: packing, verdict parsing, fail-open persistence.
      const text = await this.llmService.generateForCaller({
        caller: 'relevance-gate.judgeBatch',
        systemInstruction: this.prompt,
        prompt: `## Posts\n\n${JSON.stringify(payload)}`,
        maxRetries: 0,
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          // Schema is the output-shape authority. Gate reasons are EXEMPT
          // from the audit-reason policy: they are PERSISTED per verdict and
          // audit an IRREVERSIBLE decision (a dropped post never reaches
          // extraction). TYPED responseSchema (not responseJsonSchema):
          // flash-lite treats the json-schema form as advisory on long
          // prompts and emits a bare array — typed is enforced.
          responseSchema: jsonSchemaToTypedSchema(
            RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
          ),
        },
      });
      const raw = JSON.parse(text || '{}') as unknown;
      // Tolerate both the schema object and a bare verdict array (fail-open
      // parsing — a malformed response must never drop posts).
      if (Array.isArray(raw)) {
        this.logger.warn(
          'typed responseSchema regression: model returned bare array',
          { posts: posts.length },
        );
      }
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
            reason: normalizeVerdictReason(verdict.reason),
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
