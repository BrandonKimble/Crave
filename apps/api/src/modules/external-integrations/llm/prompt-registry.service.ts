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
  private collectionPromptUnavailable: string | null = null;
  private activeCollectionVersion: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('PromptRegistryService');
    // COLLECTION PROMPT FIRST, AND FAIL CLOSED (final red team D4/D6).
    // D4: one try around every kind meant a relevance-gate seed failure
    // skipped the collection swap entirely. D6: fail-OPEN to the asset file
    // is safe only while the asset still equals the active version — the
    // moment a candidate is activated, an asset-prompt boot produces a hash
    // no run carries, so findExtractionCoveredSourceIds reports NOTHING
    // covered and the live lanes re-extract the corpus ungoverned. That is
    // the July 2026 accident. Extraction must stop instead.
    try {
      const active = await this.ensureSeededAndGetActive();
      this.llmService.setActiveSystemPrompt(active.content);
      this.activeCollectionVersion = active.version;
      this.logger.info('Collection prompt registry ready', {
        activeVersion: active.version,
        contentHash: active.contentHash.slice(0, 12),
      });
    } catch (error) {
      this.collectionPromptUnavailable =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'FAIL CLOSED: collection prompt registry unavailable — extraction is ' +
          'blocked in this process rather than running under an unregistered ' +
          'prompt (which would void coverage for the whole corpus)',
        { error: { message: this.collectionPromptUnavailable } },
      );
    }
    // Other tenants seed independently: one kind's failure must never
    // strand another (D4). The relevance gate fails OPEN by design — its
    // verdict hash records the prompt it actually used.
    for (const kind of Object.keys(SEED_ASSETS)) {
      if (kind === COLLECTION_SYSTEM_PROMPT_KIND) continue;
      try {
        await this.ensureSeededAndGetActive(kind);
      } catch (error) {
        this.logger.error('Prompt registry seed failed for kind', {
          kind,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  /** Throws when this process could not establish the ACTIVE collection
   *  prompt. Called by the extraction path so a registry outage stops work
   *  instead of silently re-extracting under an unregistered prompt. */
  assertCollectionPromptAvailable(): void {
    if (this.collectionPromptUnavailable) {
      throw new Error(
        `Collection prompt registry unavailable: ${this.collectionPromptUnavailable}`,
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
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const existing = await this.prisma.llmPrompt.findFirst({
      where: { kind, contentHash },
      select: { version: true, status: true },
    });
    if (existing) {
      throw new Error(
        `Identical content already registered as version ${existing.version} (${existing.status})`,
      );
    }
    const version = (await this.nextVersion(kind)) ?? 1;
    await this.prisma.llmPrompt.create({
      data: {
        kind,
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
  async activate(
    version: number,
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const target = await this.getVersion(version, kind);
    if (target.status === 'active') return target;
    await this.prisma.$transaction([
      this.prisma.llmPrompt.updateMany({
        where: { kind, status: 'active' },
        data: { status: 'retired' },
      }),
      this.prisma.llmPrompt.updateMany({
        where: { kind, version },
        data: { status: 'active', activatedAt: new Date() },
      }),
    ]);
    // Only the collection prompt lives hot in LLMService; other kinds'
    // consumers (the gate) read the registry at their own boot.
    if (kind === COLLECTION_SYSTEM_PROMPT_KIND) {
      this.llmService.setActiveSystemPrompt(target.content);
    }
    this.logger.info('Prompt version activated', { version, kind });
    return { ...target, status: 'active' };
  }

  private async nextVersion(kind: string): Promise<number> {
    const max = await this.prisma.llmPrompt.aggregate({
      where: { kind },
      _max: { version: true },
    });
    return (max._max.version ?? 0) + 1;
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
    // No active row. Seed from the shipped asset — but NEVER assume version
    // 1 is free or is the asset: a runs-table backfill can pre-populate
    // retired versions (red team 2026-08-01). Find-by-hash first; else
    // insert as the NEXT version.
    const asset = SEED_ASSETS[kind];
    if (!asset) {
      throw new Error(`No active prompt and no seed asset for kind ${kind}`);
    }
    const content = readFileSync(join(__dirname, 'prompts', asset), 'utf-8');
    const contentHash = createHash('sha256').update(content).digest('hex');
    const byHash = await this.prisma.llmPrompt.findFirst({
      where: { kind, contentHash },
      select: { version: true },
    });
    const version = byHash?.version ?? (await this.nextVersion(kind));
    await this.prisma.llmPrompt.upsert({
      where: {
        kind_version: { kind, version },
      },
      update: { status: 'active', activatedAt: new Date() },
      create: {
        kind,
        version,
        content,
        contentHash,
        status: 'active',
        notes: `seeded from prompts/${asset} asset`,
      },
    });
    this.logger.info('Seeded active prompt from asset file', {
      kind,
      version,
    });
    return { version, content, contentHash, status: 'active' };
  }
}
