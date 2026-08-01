import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from './llm.service';

export const COLLECTION_SYSTEM_PROMPT_KIND = 'collection_system';
export const RELEVANCE_GATE_PROMPT_KIND = 'relevance_gate';

/** Every registry tenant self-seeds v1 from its shipped asset file — the
 *  file stays the version-1 source of record in git; the registry is the
 *  runtime truth. Add new prompt kinds HERE, never as a parallel loader. */
const SEED_ASSETS: Record<string, string> = {
  [COLLECTION_SYSTEM_PROMPT_KIND]: 'collection-prompt.md',
  [RELEVANCE_GATE_PROMPT_KIND]: 'relevance-gate-prompt.md',
};

export interface RegisteredPrompt {
  version: number;
  content: string;
  contentHash: string;
  status: string;
}

/**
 * VERSIONED PROMPTS (2026-08-01, reextract-choreography plan §3.1): the
 * collection system prompt is runtime DATA, not a deploy asset. One row per
 * version; exactly one ACTIVE per kind (partial unique index). Live
 * collection extracts with the active version; candidate versions run
 * shadow replays under a spend campaign. Activation is an explicit,
 * governed switch — never a side effect of a deploy.
 *
 * Why this exists: coverage is keyed to the prompt hash
 * (findExtractionCoveredSourceIds), so an implicit prompt change silently
 * voided every document's coverage and re-extracted the world ungoverned —
 * the July 2026 "self-heal" accident. With versions, the old prompt keeps
 * collecting until the owner activates the new one.
 *
 * Bootstrap: on first boot the current prompts/collection-prompt.md asset
 * is seeded as version 1 active, so the registry is self-initializing and
 * the file remains the version-1 source of record in git history.
 */
@Injectable()
export class PromptRegistryService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('PromptRegistryService');
    try {
      // Seed every tenant kind; swap the in-process collection prompt.
      for (const kind of Object.keys(SEED_ASSETS)) {
        if (kind !== COLLECTION_SYSTEM_PROMPT_KIND) {
          await this.ensureSeededAndGetActive(kind);
        }
      }
      const active = await this.ensureSeededAndGetActive();
      // Swap the in-process prompt to the registry's active version — the
      // asset file is only the v1 seed; the registry is the runtime truth.
      this.llmService.setActiveSystemPrompt(active.content);
      this.logger.info('Collection prompt registry ready', {
        activeVersion: active.version,
        contentHash: active.contentHash.slice(0, 12),
      });
    } catch (error) {
      // Fail-open to the asset file already loaded by LLMService: a registry
      // outage must not take extraction down with it.
      this.logger.error(
        'Prompt registry init failed — running on the asset-file prompt',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }
  }

  async getActive(
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    return this.ensureSeededAndGetActive(kind);
  }

  async getVersion(
    version: number,
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const row = await this.prisma.llmPrompt.findUnique({
      where: {
        kind_version: { kind, version },
      },
    });
    if (!row) {
      throw new Error(`Prompt version ${version} not found for kind ${kind}`);
    }
    return {
      version: row.version,
      content: row.content,
      contentHash: row.contentHash,
      status: row.status,
    };
  }

  /** Insert a new candidate version (next version number). Returns it. */
  async pushCandidate(
    content: string,
    notes?: string,
  ): Promise<RegisteredPrompt> {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const existing = await this.prisma.llmPrompt.findFirst({
      where: { kind: COLLECTION_SYSTEM_PROMPT_KIND, contentHash },
      select: { version: true, status: true },
    });
    if (existing) {
      throw new Error(
        `Identical content already registered as version ${existing.version} (${existing.status})`,
      );
    }
    const max = await this.prisma.llmPrompt.aggregate({
      where: { kind: COLLECTION_SYSTEM_PROMPT_KIND },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    await this.prisma.llmPrompt.create({
      data: {
        kind: COLLECTION_SYSTEM_PROMPT_KIND,
        version,
        content,
        contentHash,
        status: 'candidate',
        notes: notes ?? null,
      },
    });
    return { version, content, contentHash, status: 'candidate' };
  }

  /** The governed switch: candidate → active, previous active → retired.
   *  Single transaction; the partial unique index makes a double-active
   *  state impossible even under a race. Also swaps the in-process prompt
   *  immediately in THIS process; other processes pick it up on restart or
   *  via their own registry read. */
  async activate(version: number): Promise<RegisteredPrompt> {
    const target = await this.getVersion(version);
    if (target.status === 'active') return target;
    await this.prisma.$transaction([
      this.prisma.llmPrompt.updateMany({
        where: { kind: COLLECTION_SYSTEM_PROMPT_KIND, status: 'active' },
        data: { status: 'retired' },
      }),
      this.prisma.llmPrompt.updateMany({
        where: { kind: COLLECTION_SYSTEM_PROMPT_KIND, version },
        data: { status: 'active', activatedAt: new Date() },
      }),
    ]);
    this.llmService.setActiveSystemPrompt(target.content);
    this.logger.info('Prompt version activated', { version });
    return { ...target, status: 'active' };
  }

  private async ensureSeededAndGetActive(
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const active = await this.prisma.llmPrompt.findFirst({
      where: { kind, status: 'active' },
    });
    if (active) {
      return {
        version: active.version,
        content: active.content,
        contentHash: active.contentHash,
        status: active.status,
      };
    }
    // First boot on this database: seed the shipped asset as v1 active.
    const asset = SEED_ASSETS[kind];
    if (!asset) {
      throw new Error(`No active prompt and no seed asset for kind ${kind}`);
    }
    const content = readFileSync(join(__dirname, 'prompts', asset), 'utf-8');
    const contentHash = createHash('sha256').update(content).digest('hex');
    await this.prisma.llmPrompt.upsert({
      where: {
        kind_version: { kind, version: 1 },
      },
      update: { status: 'active' },
      create: {
        kind,
        version: 1,
        content,
        contentHash,
        status: 'active',
        notes: `seeded from prompts/${asset} asset`,
      },
    });
    this.logger.info('Seeded prompt v1 from asset file', { kind });
    return { version: 1, content, contentHash, status: 'active' };
  }
}
