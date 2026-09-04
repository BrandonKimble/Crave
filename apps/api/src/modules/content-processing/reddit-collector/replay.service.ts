import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { foldRecoveryRunIntoShadow } from './extraction-scope.service';
import { runInWorkContext } from '../../external-integrations/shared/work-context';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  LLMMention,
  LLMModelInput,
  LLMPost,
  LLMSourceMap,
} from '../../external-integrations/llm/llm.types';
import { BatchJob } from './batch-processing-queue.types';
import {
  ExtractionPipelineService,
  StoredExtractionInputChunk,
} from './extraction-pipeline.service';
import { RehearsalGenerationService } from './rehearsal-generation.service';

type ReplaySourceDocument = {
  documentId: string;
  platform: string;
  community: string | null;
  sourceType: 'post' | 'comment';
  sourceId: string;
  parentSourceId: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  sourceCreatedAt: Date;
  scoreSnapshot: number | null;
  rawPayload: Prisma.JsonValue | null;
};

type ReplaySummary = {
  extractionRunId?: string;
  collectionRunId?: string;
  documentCount: number;
  chunkCount: number;
  placeCount: number;
  connectionCount: number;
  activated: boolean;
};

type ExtractionRunReplaySummary = ReplaySummary & {
  sourceExtractionRunId: string;
};

type CollectionRunReplaySummary = ReplaySummary & {
  sourceCollectionRunId: string;
  extractionRunCount: number;
};

/** Key-order-independent identity for a banked mention's JSON — Prisma may
 *  round-trip object key order differently between the original row and the
 *  recovery run's re-banked copy. */
function stableMentionKey(value: Prisma.JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableMentionKey).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableMentionKey((value as Record<string, Prisma.JsonValue>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class ReplayService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly extractionPipelineService: ExtractionPipelineService,
    private readonly rehearsalGenerationService: RehearsalGenerationService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ReplayService');
  }

  async replayExtractionRun(params: {
    sourceExtractionRunId: string;
    activate?: boolean;
    /** Owner-approved spend campaign: threads into runMetadata so the
     *  batch jobs this replay submits meter the campaign envelope
     *  (extraction-pipeline resumeContext → usage-ledger attribution). */
    campaignId?: string;
    /** VERSIONED PROMPTS: pin a registered candidate version for a SHADOW
     *  replay (activate:false). Omit to replay under the active prompt. */
    promptVersion?: number;
  }): Promise<ExtractionRunReplaySummary> {
    const sourceRun = await this.prismaService.extractionRun.findUnique({
      where: { extractionRunId: params.sourceExtractionRunId },
      select: {
        extractionRunId: true,
        pipeline: true,
        metadata: true,
        inputs: {
          orderBy: { inputIndex: 'asc' },
          select: {
            inputId: true,
            inputIndex: true,
            inputPayload: true,
            sourceMap: true,
            sourceDocuments: {
              orderBy: { ordinal: 'asc' },
              select: {
                document: {
                  select: {
                    documentId: true,
                    platform: true,
                    community: true,
                    sourceType: true,
                    sourceId: true,
                    parentSourceId: true,
                    title: true,
                    body: true,
                    url: true,
                    sourceCreatedAt: true,
                    scoreSnapshot: true,
                    rawPayload: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceRun) {
      throw new Error(
        `Extraction run ${params.sourceExtractionRunId} was not found`,
      );
    }

    if (!sourceRun.inputs.length) {
      throw new Error(
        `Extraction run ${params.sourceExtractionRunId} has no stored inputs to replay`,
      );
    }

    // ONE SHADOW EXTRACTION PER SOURCE RUN PER PROMPT (junk RC7, v17 loop2).
    // The resolver's rehearsal sandbox deliberately hides one shadow run's
    // mints from every other run (entity-resolution.service.ts, the
    // rehearsal-visibility filter) — correct for coherence, but it means a
    // source run replayed to completion TWICE under one candidate prompt
    // mints identical-identity_key rehearsal twins ("fast food burger" x2,
    // 2026-08-27 diff). Items carry no partial-unique identity index (only
    // attributes do), so nothing downstream collapses them. The honest
    // chokepoint is here, before any spend: a shadow replay of a source run
    // that already has a running/completed replay under the SAME candidate
    // prompt hash is a duplicate and is skipped, loudly.
    if (params.activate !== true && params.promptVersion !== undefined) {
      const prompt = await this.prismaService.llmPrompt.findFirst({
        where: { kind: 'collection_system', version: params.promptVersion },
        select: { contentHash: true },
      });
      if (prompt) {
        const priorRuns = await this.prismaService.$queryRaw<
          Array<{ extraction_run_id: string; status: string }>
        >`
          SELECT extraction_run_id, status
          FROM collection_extraction_runs
          WHERE system_prompt_hash = ${prompt.contentHash}
            AND status IN ('running', 'completed', 'failed')
            AND metadata->>'replayOfExtractionRunId' = ${params.sourceExtractionRunId}`;
        const duplicates = priorRuns.filter((run) => run.status !== 'failed');
        if (duplicates.length > 0) {
          this.logger.warn(
            'Shadow replay skipped: source run already replayed under this prompt hash',
            {
              sourceExtractionRunId: params.sourceExtractionRunId,
              promptVersion: params.promptVersion,
              existingRuns: duplicates.map((run) => ({
                extractionRunId: run.extraction_run_id,
                status: run.status,
              })),
            },
          );
          return {
            sourceExtractionRunId: params.sourceExtractionRunId,
            extractionRunId: duplicates[0].extraction_run_id,
            collectionRunId: undefined,
            documentCount: 0,
            chunkCount: 0,
            placeCount: 0,
            connectionCount: 0,
            activated: false,
          };
        }
        // FAILED-RUN RESIDUE SWEEP (v17 mechanical): a failed prior replay
        // does not block the retry — but its rehearsal-born entities and
        // surfaces persist (items carry no unique identity index, so the
        // adopt path never fires for them) and the retry re-mints
        // identity_key twins. Before spending, sweep the failed run's
        // rehearsal residue through the sanctioned rejection machinery —
        // entities archived (adopt-able later by flip's archived-with-born-
        // run clause), surfaces and rehearsal verdicts deleted — so the
        // retry is the ONLY rehearsal generation for this (source run,
        // prompt hash).
        const failedRunIds = priorRuns
          .filter((run) => run.status === 'failed')
          .map((run) => run.extraction_run_id);
        if (failedRunIds.length > 0) {
          const swept =
            await this.rehearsalGenerationService.reject(failedRunIds);
          this.logger.info('Swept failed shadow replay residue before retry', {
            sourceExtractionRunId: params.sourceExtractionRunId,
            promptVersion: params.promptVersion,
            failedRunIds,
            ...swept,
          });
        }
      }
    }

    const sourceDocuments = this.collectSourceDocumentsFromInputs(
      sourceRun.inputs,
    );
    const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
    const inputChunks = sourceRun.inputs.map<StoredExtractionInputChunk>(
      (input) => ({
        inputIndex: input.inputIndex,
        inputPayload: this.asInputPayload(input.inputPayload),
        sourceMap: this.asSourceMap(input.sourceMap, input.inputId),
        sourceDocumentIds: input.sourceDocuments.map(
          (documentLink) => documentLink.document.documentId,
        ),
        sourceInputId: input.inputId,
      }),
    );

    const replayResult =
      await this.extractionPipelineService.processStoredInputs({
        pipeline: this.normalizePipeline(sourceRun.pipeline),
        platform: sourceDocuments[0]?.platform ?? 'reddit',
        community: this.resolveCommunity(
          sourceDocuments,
          this.asRecord(sourceRun.metadata),
        ),
        llmPosts,
        inputChunks,
        sourceDocuments: sourceDocuments.map((document) => ({
          documentId: document.documentId,
          sourceType: document.sourceType,
          sourceId: document.sourceId,
        })),
        batchId: `replay-run-${params.sourceExtractionRunId}-${Date.now()}`,
        parentJobId: params.sourceExtractionRunId,
        collectionRunScopeKey: `replay:extraction:${params.sourceExtractionRunId}`,
        activateDocumentsBeforeProcessing: params.activate === true,
        rehearsal: params.activate !== true,
        promptVersion: params.promptVersion,
        skipSourceLedgerDedupe: true,
        runMetadata: {
          replaySource: 'extraction_run',
          replayOfExtractionRunId: params.sourceExtractionRunId,
          ...(params.campaignId ? { campaignId: params.campaignId } : {}),
        },
      });

    this.logger.info('Replay extraction run completed', {
      sourceExtractionRunId: params.sourceExtractionRunId,
      extractionRunId: replayResult.extractionRunId,
      documentCount: sourceDocuments.length,
      chunkCount: inputChunks.length,
      placeCount: replayResult.dbResult.affectedPlaceIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    });

    return {
      sourceExtractionRunId: params.sourceExtractionRunId,
      extractionRunId: replayResult.extractionRunId,
      collectionRunId: undefined,
      documentCount: sourceDocuments.length,
      chunkCount: inputChunks.length,
      placeCount: replayResult.dbResult.affectedPlaceIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    };
  }

  /** BANKED-REFUSAL RECOVERY (v17 witness repair): re-admit a campaign's
   *  banked contract refusals through the real admitWireMention + the normal
   *  downstream persist path — no LLM call. Recovered rows are DELETED from
   *  the bank; still-refused rows stay (the witnesses=0 residue). The
   *  recovery run re-banks its own refusals; those duplicates are removed
   *  after reconciliation so the bank holds exactly the ORIGINAL residue.
   *  Idempotent: a re-run re-refuses the residue and recovers nothing. */
  async recoverBankedRefusals(params: { campaignId: string }): Promise<{
    campaignId: string;
    bankedRows: number;
    runsProcessed: number;
    runsSkipped: number;
    recoveredRows: number;
    stillRefusedRows: number;
    recoveryRunIds: string[];
  }> {
    // THE SERVICE OWNS ITS ATTRIBUTION (red team 2026-09-04 T1-5). The two
    // scripts that call this ran it bare, so every judge/embedding call the
    // rehearsal resolver made inside the recovery landed in the ledger with
    // no campaign — never breaching the envelope the owner approved. The
    // one entry point that knows the campaign establishes the context; no
    // caller can forget it.
    return runInWorkContext(
      {
        campaignId: params.campaignId,
        label: `replay:banked-refusals:${params.campaignId}`,
      },
      () => this.recoverBankedRefusalsInner(params),
    );
  }

  private async recoverBankedRefusalsInner(params: {
    campaignId: string;
  }): Promise<{
    campaignId: string;
    bankedRows: number;
    runsProcessed: number;
    runsSkipped: number;
    recoveredRows: number;
    stillRefusedRows: number;
    recoveryRunIds: string[];
  }> {
    const bankedRows =
      await this.prismaService.extractionContractRefusal.findMany({
        where: {
          extractionRun: {
            metadata: { path: ['campaignId'], equals: params.campaignId },
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          refusalId: true,
          extractionRunId: true,
          inputId: true,
          mention: true,
        },
      });

    const summary = {
      campaignId: params.campaignId,
      bankedRows: bankedRows.length,
      runsProcessed: 0,
      runsSkipped: 0,
      recoveredRows: 0,
      stillRefusedRows: 0,
      recoveryRunIds: [] as string[],
    };
    if (!bankedRows.length) {
      this.logger.info('No banked refusals for campaign', {
        campaignId: params.campaignId,
      });
      return summary;
    }

    const rowsByRunId = new Map<string, typeof bankedRows>();
    for (const row of bankedRows) {
      const rows = rowsByRunId.get(row.extractionRunId) ?? [];
      rows.push(row);
      rowsByRunId.set(row.extractionRunId, rows);
    }

    const collectionRunScopeKey = `replay:banked-refusals:${params.campaignId}:${Date.now()}`;

    for (const [sourceRunId, runRows] of rowsByRunId) {
      const inputIds = Array.from(
        new Set(
          runRows
            .map((row) => row.inputId)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const rowsWithoutInput = runRows.filter((row) => !row.inputId);
      if (rowsWithoutInput.length) {
        // No stored chunk context — the mention cannot be re-admitted.
        // Stays banked, loudly.
        this.logger.warn('Banked refusals without input_id stay banked', {
          sourceRunId,
          rows: rowsWithoutInput.length,
        });
        summary.stillRefusedRows += rowsWithoutInput.length;
      }
      if (!inputIds.length) {
        summary.runsSkipped += 1;
        continue;
      }

      const sourceRun = await this.prismaService.extractionRun.findUnique({
        where: { extractionRunId: sourceRunId },
        select: {
          extractionRunId: true,
          pipeline: true,
          metadata: true,
          systemPromptHash: true,
          inputs: {
            where: { inputId: { in: inputIds } },
            orderBy: { inputIndex: 'asc' },
            select: {
              inputId: true,
              inputIndex: true,
              inputPayload: true,
              sourceMap: true,
              sourceDocuments: {
                orderBy: { ordinal: 'asc' },
                select: {
                  document: {
                    select: {
                      documentId: true,
                      platform: true,
                      community: true,
                      sourceType: true,
                      sourceId: true,
                      parentSourceId: true,
                      title: true,
                      body: true,
                      url: true,
                      sourceCreatedAt: true,
                      scoreSnapshot: true,
                      rawPayload: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!sourceRun || sourceRun.inputs.length !== inputIds.length) {
        this.logger.warn(
          'Banked run is missing stored inputs — rows stay banked',
          {
            sourceRunId,
            expectedInputs: inputIds.length,
            foundInputs: sourceRun?.inputs.length ?? 0,
          },
        );
        summary.runsSkipped += 1;
        summary.stillRefusedRows += runRows.filter((row) =>
          Boolean(row.inputId),
        ).length;
        continue;
      }

      const inputIndexByInputId = new Map(
        sourceRun.inputs.map((input) => [input.inputId, input.inputIndex]),
      );
      const mentionsByInputIndex = new Map<number, LLMMention[]>();
      for (const row of runRows) {
        if (!row.inputId) continue;
        const inputIndex = inputIndexByInputId.get(row.inputId);
        if (inputIndex === undefined) continue;
        const mentions = mentionsByInputIndex.get(inputIndex) ?? [];
        mentions.push(row.mention as unknown as LLMMention);
        mentionsByInputIndex.set(inputIndex, mentions);
      }

      const sourceDocuments = this.collectSourceDocumentsFromInputs(
        sourceRun.inputs,
      );
      const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
      const inputChunks = sourceRun.inputs.map<StoredExtractionInputChunk>(
        (input) => ({
          inputIndex: input.inputIndex,
          inputPayload: this.asInputPayload(input.inputPayload),
          sourceMap: this.asSourceMap(input.sourceMap, input.inputId),
          sourceDocumentIds: input.sourceDocuments.map(
            (documentLink) => documentLink.document.documentId,
          ),
          sourceInputId: input.inputId,
        }),
      );

      const result =
        await this.extractionPipelineService.reingestBankedMentions({
          pipeline: this.normalizePipeline(sourceRun.pipeline),
          platform: sourceDocuments[0]?.platform ?? 'reddit',
          community: this.resolveCommunity(
            sourceDocuments,
            this.asRecord(sourceRun.metadata),
          ),
          llmPosts,
          inputChunks,
          sourceDocuments: sourceDocuments.map((document) => ({
            documentId: document.documentId,
            sourceType: document.sourceType,
            sourceId: document.sourceId,
          })),
          mentionsByInputIndex,
          systemPromptHash: sourceRun.systemPromptHash,
          batchId: `banked-refusal-replay-${sourceRunId}-${Date.now()}`,
          parentJobId: sourceRunId,
          collectionRunScopeKey,
          rehearsal: true,
          skipSourceLedgerDedupe: true,
          runMetadata: {
            replaySource: 'banked_refusals',
            replayOfExtractionRunId: sourceRunId,
            campaignId: params.campaignId,
          },
        });

      const recoveryRunId = result.extractionRunId;
      summary.recoveryRunIds.push(recoveryRunId);

      // The failure-rate law can fail the recovery run (a chunk quarantined
      // itself). A failed run neither persisted nor banked those mentions —
      // deleting their originals would silently drop them, so the whole
      // run's rows stay banked.
      const recoveryRun = await this.prismaService.extractionRun.findUnique({
        where: { extractionRunId: recoveryRunId },
        select: { status: true },
      });
      if (recoveryRun?.status !== 'completed') {
        this.logger.warn('Recovery run did not complete — rows stay banked', {
          sourceRunId,
          recoveryRunId,
          status: recoveryRun?.status ?? 'missing',
        });
        summary.runsSkipped += 1;
        summary.stillRefusedRows += runRows.filter((row) =>
          Boolean(row.inputId),
        ).length;
        continue;
      }

      // Reconcile: a mention the recovery run RE-refused stays banked as its
      // ORIGINAL row; everything else was admitted and its row is recovered.
      const reRefused =
        await this.prismaService.extractionContractRefusal.findMany({
          where: { extractionRunId: recoveryRunId },
          select: { refusalId: true, mention: true },
        });
      const stillRefusedCounts = new Map<string, number>();
      for (const row of reRefused) {
        const key = stableMentionKey(row.mention);
        stillRefusedCounts.set(key, (stillRefusedCounts.get(key) ?? 0) + 1);
      }

      const recoveredIds: string[] = [];
      for (const row of runRows) {
        if (!row.inputId) continue;
        const key = stableMentionKey(row.mention);
        const remaining = stillRefusedCounts.get(key) ?? 0;
        if (remaining > 0) {
          stillRefusedCounts.set(key, remaining - 1);
          summary.stillRefusedRows += 1;
        } else {
          recoveredIds.push(row.refusalId);
        }
      }

      await this.prismaService.$transaction([
        // Recovered originals leave the bank …
        this.prismaService.extractionContractRefusal.deleteMany({
          where: { refusalId: { in: recoveredIds } },
        }),
        // … and the recovery run's re-banked rows are duplicates of the
        // retained originals — the bank keeps exactly one row per residual
        // refusal, on the run that first banked it.
        this.prismaService.extractionContractRefusal.deleteMany({
          where: { extractionRunId: recoveryRunId },
        }),
      ]);
      summary.recoveredRows += recoveredIds.length;
      summary.runsProcessed += 1;

      // RECOVERED EVIDENCE IS THE SHADOW'S EVIDENCE (red team 2026-09-04
      // T1-2): fold R's products onto S so activation — which plans by
      // document ownership and flips by born run — carries them. Left
      // keyed to R they were dark forever (75 runs / 2,122 events on
      // staging) while the diff still counted them.
      const folded = await this.prismaService.$transaction((tx) =>
        foldRecoveryRunIntoShadow(tx, sourceRunId, recoveryRunId),
      );

      this.logger.info('Banked-refusal recovery run reconciled', {
        sourceRunId,
        recoveryRunId,
        banked: runRows.length,
        recovered: recoveredIds.length,
        stillRefused: runRows.length - recoveredIds.length,
        foldedIntoShadow: folded,
      });
    }

    return summary;
  }

  async replayDateRange(params: {
    platform: string;
    community?: string | null;
    start: Date;
    end: Date;
    pipeline?: BatchJob['collectionType'];
    activate?: boolean;
  }): Promise<ReplaySummary> {
    const sourceDocuments = await this.loadDateRangeSourceDocuments(params);
    if (!sourceDocuments.length) {
      throw new Error('No source documents matched the requested replay range');
    }

    const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
    const replayResult = await this.extractionPipelineService.processPosts({
      pipeline: params.pipeline ?? 'chronological',
      platform: params.platform,
      community: this.resolveCommunity(sourceDocuments),
      llmPosts,
      batchId: `replay-date-range-${Date.now()}`,
      parentJobId: null,
      collectionRunScopeKey: `replay:date-range:${params.platform}:${params.start.toISOString()}:${params.end.toISOString()}`,
      activateDocumentsBeforeProcessing: params.activate === true,
      // Sibling parity (red team 2026-08-19 D9): a non-activating date-range
      // replay quarantines its mints exactly like the run/collection replays
      // — without this line it minted LIVE entities from docs that never
      // activate, the leak class the rehearsal sandbox exists to close.
      rehearsal: params.activate !== true,
      skipSourceLedgerDedupe: true,
      runMetadata: {
        replaySource: 'date_range',
        platform: params.platform,
        community: params.community ?? null,
        start: params.start.toISOString(),
        end: params.end.toISOString(),
      },
    });

    this.logger.info('Replay date-range extraction completed', {
      extractionRunId: replayResult.extractionRunId,
      platform: params.platform,
      community: params.community ?? null,
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      documentCount: sourceDocuments.length,
      chunkCount: replayResult.chunkStats.chunkCount,
      placeCount: replayResult.dbResult.affectedPlaceIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    });

    return {
      extractionRunId: replayResult.extractionRunId,
      collectionRunId: undefined,
      documentCount: sourceDocuments.length,
      chunkCount: replayResult.chunkStats.chunkCount,
      placeCount: replayResult.dbResult.affectedPlaceIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    };
  }

  async replayCollectionRun(params: {
    sourceCollectionRunId: string;
    activate?: boolean;
  }): Promise<CollectionRunReplaySummary> {
    const sourceCollectionRun =
      await this.prismaService.collectionRun.findUnique({
        where: { collectionRunId: params.sourceCollectionRunId },
        select: {
          collectionRunId: true,
          scopeKey: true,
          pipeline: true,
          platform: true,
          community: true,
          extractionRuns: {
            orderBy: { startedAt: 'asc' },
            select: {
              extractionRunId: true,
              pipeline: true,
              metadata: true,
              inputs: {
                orderBy: { inputIndex: 'asc' },
                select: {
                  inputId: true,
                  inputIndex: true,
                  inputPayload: true,
                  sourceMap: true,
                  sourceDocuments: {
                    orderBy: { ordinal: 'asc' },
                    select: {
                      document: {
                        select: {
                          documentId: true,
                          platform: true,
                          community: true,
                          sourceType: true,
                          sourceId: true,
                          parentSourceId: true,
                          title: true,
                          body: true,
                          url: true,
                          sourceCreatedAt: true,
                          scoreSnapshot: true,
                          rawPayload: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!sourceCollectionRun) {
      throw new Error(
        `Collection run ${params.sourceCollectionRunId} was not found`,
      );
    }

    if (!sourceCollectionRun.extractionRuns.length) {
      throw new Error(
        `Collection run ${params.sourceCollectionRunId} has no extraction runs to replay`,
      );
    }

    const targetCollectionRunScopeKey = `replay:collection:${params.sourceCollectionRunId}:${Date.now()}`;
    let documentCount = 0;
    let chunkCount = 0;
    let placeCount = 0;
    let connectionCount = 0;

    for (const sourceRun of sourceCollectionRun.extractionRuns) {
      if (!sourceRun.inputs.length) {
        continue;
      }

      const sourceDocuments = this.collectSourceDocumentsFromInputs(
        sourceRun.inputs,
      );
      const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
      const inputChunks = sourceRun.inputs.map<StoredExtractionInputChunk>(
        (input) => ({
          inputIndex: input.inputIndex,
          inputPayload: this.asInputPayload(input.inputPayload),
          sourceMap: this.asSourceMap(input.sourceMap, input.inputId),
          sourceDocumentIds: input.sourceDocuments.map(
            (documentLink) => documentLink.document.documentId,
          ),
          sourceInputId: input.inputId,
        }),
      );

      const replayResult =
        await this.extractionPipelineService.processStoredInputs({
          pipeline: this.normalizePipeline(sourceRun.pipeline),
          platform:
            sourceDocuments[0]?.platform ??
            sourceCollectionRun.platform ??
            'reddit',
          community:
            this.resolveCommunity(
              sourceDocuments,
              this.asRecord(sourceRun.metadata),
            ) ||
            sourceCollectionRun.community ||
            'unknown',
          llmPosts,
          inputChunks,
          sourceDocuments: sourceDocuments.map((document) => ({
            documentId: document.documentId,
            sourceType: document.sourceType,
            sourceId: document.sourceId,
          })),
          batchId: `replay-collection-run-${sourceRun.extractionRunId}-${Date.now()}`,
          parentJobId: sourceRun.extractionRunId,
          collectionRunScopeKey: targetCollectionRunScopeKey,
          activateDocumentsBeforeProcessing: params.activate === true,
          rehearsal: params.activate !== true,
          skipSourceLedgerDedupe: true,
          runMetadata: {
            replaySource: 'collection_run',
            replayOfCollectionRunId: params.sourceCollectionRunId,
            replayOfExtractionRunId: sourceRun.extractionRunId,
          },
        });

      documentCount += sourceDocuments.length;
      chunkCount += inputChunks.length;
      placeCount += replayResult.dbResult.affectedPlaceIds.length;
      connectionCount += replayResult.dbResult.affectedConnectionIds.length;
    }

    const targetCollectionRun =
      await this.prismaService.collectionRun.findUnique({
        where: { scopeKey: targetCollectionRunScopeKey },
        select: {
          collectionRunId: true,
          extractionRuns: { select: { extractionRunId: true } },
        },
      });

    if (!targetCollectionRun) {
      throw new Error(
        'Replay collection run completed without creating a target collection run',
      );
    }

    return {
      sourceCollectionRunId: params.sourceCollectionRunId,
      extractionRunId: undefined,
      collectionRunId: targetCollectionRun.collectionRunId,
      documentCount,
      chunkCount,
      placeCount,
      connectionCount,
      extractionRunCount: targetCollectionRun.extractionRuns.length,
      activated: params.activate === true,
    };
  }

  /* F472–F474: `activateExtractionRunForDateRange` /
   * `activateExtractionRunForDocuments` lived here with a THIRD copy of the
   * supersede-and-activate law (each copy fixed after its sibling) plus a
   * re-inlined D7 affected-restaurants union. Both had ZERO callers — only a
   * README line referenced them. Deleted; the law is
   * `supersedeAndActivate` in extraction-scope.service, and affected
   * restaurants come from `ExtractionScopeService.affectedRestaurantsForDocuments`.
   */

  private async loadDateRangeSourceDocuments(params: {
    platform: string;
    community?: string | null;
    start: Date;
    end: Date;
  }): Promise<ReplaySourceDocument[]> {
    const documents = await this.prismaService.sourceDocument.findMany({
      where: {
        platform: params.platform,
        community: params.community ?? undefined,
        sourceCreatedAt: {
          gte: params.start,
          lte: params.end,
        },
      },
      orderBy: { sourceCreatedAt: 'asc' },
      select: {
        documentId: true,
        platform: true,
        community: true,
        sourceType: true,
        sourceId: true,
        parentSourceId: true,
        title: true,
        body: true,
        url: true,
        sourceCreatedAt: true,
        scoreSnapshot: true,
        rawPayload: true,
      },
    });

    if (!documents.length) {
      return [];
    }

    const postsById = new Map(
      documents
        .filter((document) => document.sourceType === 'post')
        .map((document) => [document.sourceId, document] as const),
    );
    const missingPostIds = new Set<string>();

    documents.forEach((document) => {
      if (document.sourceType !== 'comment') {
        return;
      }
      const rawPayload = this.asRecord(document.rawPayload);
      const postId =
        this.asString(rawPayload?.post_id) ?? document.parentSourceId ?? null;
      if (postId && !postsById.has(postId)) {
        missingPostIds.add(postId);
      }
    });

    if (!missingPostIds.size) {
      return documents;
    }

    const parentPosts = await this.prismaService.sourceDocument.findMany({
      where: {
        platform: params.platform,
        sourceType: 'post',
        sourceId: { in: Array.from(missingPostIds) },
      },
      select: {
        documentId: true,
        platform: true,
        community: true,
        sourceType: true,
        sourceId: true,
        parentSourceId: true,
        title: true,
        body: true,
        url: true,
        sourceCreatedAt: true,
        scoreSnapshot: true,
        rawPayload: true,
      },
    });

    return [...documents, ...parentPosts];
  }

  private buildPostsFromSourceDocuments(
    sourceDocuments: ReplaySourceDocument[],
  ): LLMPost[] {
    const postsById = new Map<string, LLMPost>();
    const commentsByPostId = new Map<string, LLMPost['comments']>();

    const sortedDocuments = [...sourceDocuments].sort(
      (left, right) =>
        left.sourceCreatedAt.getTime() - right.sourceCreatedAt.getTime(),
    );

    sortedDocuments.forEach((document) => {
      const rawPayload = this.asRecord(document.rawPayload);
      if (document.sourceType === 'post') {
        postsById.set(document.sourceId, {
          id: document.sourceId,
          title: this.asString(rawPayload?.title) ?? document.title ?? '',
          content: this.asString(rawPayload?.content) ?? document.body ?? '',
          subreddit:
            this.asString(rawPayload?.subreddit) ?? document.community ?? '',
          author: this.asString(rawPayload?.author) ?? '',
          url: this.asString(rawPayload?.url) ?? document.url ?? '',
          score:
            this.asNumber(rawPayload?.score) ?? document.scoreSnapshot ?? 0,
          created_at:
            this.asString(rawPayload?.created_at) ??
            document.sourceCreatedAt.toISOString(),
          comments: [],
          extract_from_post: this.asBoolean(rawPayload?.extract_from_post),
        });
        return;
      }

      const postId =
        this.asString(rawPayload?.post_id) ?? document.parentSourceId ?? null;
      if (!postId) {
        return;
      }

      const comment = {
        id: document.sourceId,
        content: this.asString(rawPayload?.content) ?? document.body ?? '',
        author: this.asString(rawPayload?.author) ?? '',
        score: this.asNumber(rawPayload?.score) ?? document.scoreSnapshot ?? 0,
        created_at:
          this.asString(rawPayload?.created_at) ??
          document.sourceCreatedAt.toISOString(),
        parent_id:
          this.asString(rawPayload?.parent_id) ?? document.parentSourceId,
        url: this.asString(rawPayload?.url) ?? document.url ?? '',
      };

      const comments = commentsByPostId.get(postId) ?? [];
      comments.push(comment);
      commentsByPostId.set(postId, comments);
    });

    return Array.from(postsById.values())
      .map((post) => ({
        ...post,
        comments: [...(commentsByPostId.get(post.id) ?? [])].sort(
          (left, right) =>
            new Date(left.created_at ?? 0).getTime() -
            new Date(right.created_at ?? 0).getTime(),
        ),
      }))
      .sort(
        (left, right) =>
          new Date(left.created_at ?? 0).getTime() -
          new Date(right.created_at ?? 0).getTime(),
      );
  }

  private collectSourceDocumentsFromInputs(
    inputs: Array<{
      sourceDocuments: Array<{ document: ReplaySourceDocument }>;
    }>,
  ): ReplaySourceDocument[] {
    const documentsById = new Map<string, ReplaySourceDocument>();

    inputs.forEach((input) => {
      input.sourceDocuments.forEach((documentLink) => {
        documentsById.set(
          documentLink.document.documentId,
          documentLink.document,
        );
      });
    });

    return Array.from(documentsById.values()).sort(
      (left, right) =>
        left.sourceCreatedAt.getTime() - right.sourceCreatedAt.getTime(),
    );
  }

  private resolveCommunity(
    sourceDocuments: ReplaySourceDocument[],
    metadata?: Record<string, Prisma.JsonValue> | null,
  ): string {
    const communityFromDocs = sourceDocuments.find(
      (document) =>
        typeof document.community === 'string' && document.community.length > 0,
    )?.community;
    if (communityFromDocs) {
      return communityFromDocs;
    }

    const metadataSubreddit = this.asString(metadata?.subreddit);
    if (metadataSubreddit) {
      return metadataSubreddit;
    }

    return 'unknown';
  }

  private normalizePipeline(
    pipeline: string | null | undefined,
  ): BatchJob['collectionType'] {
    if (
      pipeline === 'chronological' ||
      pipeline === 'keyword' ||
      pipeline === 'archive'
    ) {
      return pipeline;
    }

    return 'chronological';
  }

  private asInputPayload(value: Prisma.JsonValue): LLMModelInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { posts: [] };
    }
    if ('source_map' in value) {
      throw new Error(
        'Stored input_payload must be model-facing only and cannot contain source_map',
      );
    }
    return value as unknown as LLMModelInput;
  }

  private asSourceMap(
    value: Prisma.JsonValue | undefined | null,
    inputId: string,
  ): LLMSourceMap {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Stored input ${inputId} is missing source_map`);
    }
    return value as unknown as LLMSourceMap;
  }

  private asRecord(
    value: Prisma.JsonValue | undefined | null,
  ): Record<string, Prisma.JsonValue> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, Prisma.JsonValue>;
  }

  private asString(value: Prisma.JsonValue | undefined | null): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private asNumber(value: Prisma.JsonValue | undefined | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private asBoolean(value: Prisma.JsonValue | undefined | null): boolean {
    return value === true;
  }
}
