import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from './llm.service';
import {
  COLLECTION_RESPONSE_JSON_SCHEMA,
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
} from './prompts/llm-response-schemas';

export const COLLECTION_SYSTEM_PROMPT_KIND = 'collection_system';
export const RELEVANCE_GATE_PROMPT_KIND = 'relevance_gate';

/** The response schema is half the behavioral contract — its descriptions
 *  steer the decode exactly like prompt text (proven twice: "related food
 *  terms" caused cuisine-in-categories; a description rewrite regressed
 *  ghost-best 6/6 -> 1/3). So a version's fingerprint covers BOTH: identical
 *  prompt text with a changed schema is a DIFFERENT version. Rows are
 *  immutable; pre-fold rows keep their content-only hashes. */
const KIND_SCHEMAS: Record<string, unknown> = {
  [COLLECTION_SYSTEM_PROMPT_KIND]: COLLECTION_RESPONSE_JSON_SCHEMA,
  [RELEVANCE_GATE_PROMPT_KIND]: RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
};

export function promptFingerprint(kind: string, content: string): string {
  const schema = KIND_SCHEMAS[kind];
  const folded = schema
    ? `${content}\0schema:${JSON.stringify(schema)}`
    : content;
  return createHash('sha256').update(folded).digest('hex');
}

/** The schema half of the contract, alone — what a row REMEMBERS it was
 *  pushed under (llm_prompts.schema_hash, 2026-09-05). */
export function schemaHashFor(kind: string): string | null {
  const schema = KIND_SCHEMAS[kind];
  if (!schema) return null;
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

export function contentSha(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * How a stored row relates to the running code's response schema:
 *  - 'current': pushed under this schema — servable everywhere.
 *  - 'prior':   pushed under a PREVIOUS schema (its schema_hash differs). The
 *    text is intact (content_sha matches) but the contract it describes is
 *    not the one this process would run it under: never the LIVE extraction
 *    prompt, always fine to read as history, and a candidate pushed under the
 *    current schema may be shadowed beside it. This is what a schema edit
 *    looks like between deploy and activation — the state that used to be a
 *    boot refusal, which made every schema change impossible to shadow.
 *  - 'legacy':  a pre-fold row (content-only sha256, no schema on record) —
 *    tolerated with a warning; the next push re-fingerprints.
 */
export type PromptContract = 'current' | 'prior' | 'legacy';

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
  contract: PromptContract;
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
      if (active.contract === 'prior') {
        // A schema edit shipped ahead of the activation that carries it:
        // live extraction must not run v${active.version}'s text under a
        // schema it was never certified with (the G-4 coverage lie), but
        // the process boots — a candidate pushed under THIS schema can be
        // shadowed, diffed, and activated from here.
        this.collectionPromptUnavailable =
          `active collection prompt v${active.version} was pushed under a previous ` +
          `response schema (row schema ${active.contentHash.slice(0, 12)} ≠ running ` +
          `${(schemaHashFor(COLLECTION_SYSTEM_PROMPT_KIND) ?? '').slice(0, 12)}); live extraction ` +
          `is blocked until a version pushed under the current schema is activated`;
        this.logger.error(
          'FAIL CLOSED for LIVE extraction only: the active collection prompt is a PRIOR contract',
          { activeVersion: active.version },
        );
      } else {
        this.llmService.setActiveSystemPrompt(active.content);
        this.activeCollectionVersion = active.version;
        this.logger.info('Collection prompt registry ready', {
          activeVersion: active.version,
          contentHash: active.contentHash.slice(0, 12),
          contract: active.contract,
        });
      }
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
    return this.classify(kind, row);
  }

  /** Insert a new candidate version (next version number). Returns it. */
  async pushCandidate(
    content: string,
    notes?: string,
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const contentHash = promptFingerprint(kind, content);
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
        contentSha: contentSha(content),
        schemaHash: schemaHashFor(kind),
        status: 'candidate',
        notes: notes ?? null,
      },
    });
    return {
      version,
      content,
      contentHash,
      status: 'candidate',
      contract: 'current',
    };
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
    if (target.contract === 'prior') {
      throw new Error(
        `v${version} was pushed under a previous response schema; push it again ` +
          `under the current schema before activating`,
      );
    }
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
    this.activeCache.set(kind, { ...target, status: 'active' });
    this.logger.info('Prompt version activated', { version, kind });
    return { ...target, status: 'active' };
  }

  /** The contract a stored row describes, or a refusal when its text
   *  matches nothing on record (a corrupted row is never served). */
  private classify(
    kind: string,
    row: {
      version: number;
      content: string;
      contentHash: string;
      status: string;
      contentSha: string | null;
      schemaHash: string | null;
    },
  ): RegisteredPrompt {
    const base = {
      version: row.version,
      content: row.content,
      contentHash: row.contentHash,
      status: row.status,
    };
    const currentSchema = schemaHashFor(kind);
    if (row.contentHash === promptFingerprint(kind, row.content)) {
      return { ...base, contract: 'current' };
    }
    const legacy = contentSha(row.content);
    if (row.contentHash === legacy) {
      return { ...base, contract: 'legacy' };
    }
    if (
      row.schemaHash &&
      currentSchema &&
      row.schemaHash !== currentSchema &&
      (row.contentSha ?? legacy) === legacy
    ) {
      return { ...base, contract: 'prior' };
    }
    throw new Error(
      `${kind} v${row.version} row hash ${row.contentHash.slice(0, 12)} ` +
        `matches neither its content+schema fingerprint ` +
        `(${promptFingerprint(kind, row.content).slice(0, 12)}), a legacy ` +
        `content-only hash, nor a recorded prior schema — refusing to serve ` +
        `a prompt whose stored contract does not describe it`,
    );
  }

  private async nextVersion(kind: string): Promise<number> {
    const max = await this.prisma.llmPrompt.aggregate({
      where: { kind },
      _max: { version: true },
    });
    return (max._max.version ?? 0) + 1;
  }

  /** The active row is read on the per-chunk extraction path (it is the
   *  hash authority for coverage), so it is cached per process. Safe: the
   *  row changes only through activate(), which refreshes the cache; other
   *  processes pick a new activation up on restart, exactly as before. */
  private readonly activeCache = new Map<string, RegisteredPrompt>();

  private async ensureSeededAndGetActive(
    kind: string = COLLECTION_SYSTEM_PROMPT_KIND,
  ): Promise<RegisteredPrompt> {
    const cached = this.activeCache.get(kind);
    if (cached) return cached;
    const active = await this.prisma.llmPrompt.findFirst({
      where: { kind, status: 'active' },
    });
    if (active) {
      // THE FINGERPRINT IS ENFORCED ON THE ROW WE SERVE (red team 2026-09-04
      // G-4), and the row's OWN schema decides what "its contract" means
      // (2026-09-05): a row pushed under a previous schema is a PRIOR
      // contract — intact, readable, never the live extraction prompt. A
      // corrupted row (text no longer matching any hash on record) is still
      // refused outright.
      const row = this.classify(kind, active);
      if (row.contract === 'legacy') {
        this.logger.warn(
          'Active prompt row carries a pre-fold content-only hash — response-schema drift is not observable for this version; the next push re-fingerprints',
          { kind, version: active.version },
        );
      }
      this.activeCache.set(kind, row);
      return row;
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
    const contentHash = promptFingerprint(kind, content);
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
        contentSha: contentSha(content),
        schemaHash: schemaHashFor(kind),
        status: 'active',
        notes: `seeded from prompts/${asset} asset`,
      },
    });
    this.logger.info('Seeded active prompt from asset file', {
      kind,
      version,
    });
    return {
      version,
      content,
      contentHash,
      status: 'active',
      contract: 'current',
    };
  }
}
