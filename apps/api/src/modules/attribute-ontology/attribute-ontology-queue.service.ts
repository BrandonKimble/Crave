import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../shared';
import { AttributeEntityType } from './attribute-ontology.service';
import { currentCampaignId } from '../external-integrations/shared/work-context';

export const ATTRIBUTE_ONTOLOGY_QUEUE = 'attribute-ontology-adjudication';
export const ADJUDICATE_JOB = 'adjudicate-pending-attributes';

/** Debounce window: lets a burst of collection batches coalesce into one run. */
const DEBOUNCE_MS = 60_000;

export interface AttributeAdjudicationJobData {
  type: AttributeEntityType;
  /**
   * Campaign funding the work that ENQUEUED this adjudication (F357).
   *
   * `buildPlan` issues one LLM call per candidate, one per new canonical and
   * one per rename, plus an embedding pass — and `candidateCount` is simply
   * however many `pending` rows collection happened to mint, with no batch
   * cap and no early exit. A re-extraction that mints tens of thousands of
   * pending attributes therefore turns one 60s debounce tick into a run whose
   * SIZE nobody declared, competing for the same Gemini pool as collection.
   *
   * A per-run candidate cap would be a number nobody has measured, so the
   * bound is an EXISTING governed one instead: the reload/re-extract campaigns
   * already carry spend envelopes, and adjudication triggered while one is
   * running now rides it exactly as the enrichment lane does. AsyncLocalStorage
   * does not cross the BullMQ boundary (round-six cost #4: the envelope was
   * sized for spend it never debited), so the ambient campaign is captured
   * here and re-established in the worker.
   */
  campaignId?: string;
}

/**
 * Enqueues debounced adjudication of pending (quarantined) attributes.
 *
 * Collection coins attributes as `pending`; this queue is the bridge that turns
 * them `active`. Debounce comes from Bull job-id dedupe: one deterministic id per
 * attribute type, delayed — repeat triggers while a job is queued are no-ops, so
 * N collection batches in a burst produce one adjudication run that drains
 * everything pending at execution time. Correctness never depends on this firing
 * (quarantine keeps unadjudicated attributes invisible); it is purely the
 * latency knob for how fast new vocabulary goes live.
 */
@Injectable()
export class AttributeOntologyQueueService {
  private readonly logger: LoggerService;

  constructor(
    @InjectQueue(ATTRIBUTE_ONTOLOGY_QUEUE)
    private readonly queue: Queue<AttributeAdjudicationJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('AttributeOntologyQueue');
  }

  /** Schedule adjudication for both attribute vocabularies (debounced per type). */
  async queueAdjudication(): Promise<void> {
    await Promise.all([
      this.queueForType('restaurant_attribute'),
      this.queueForType('food_attribute'),
    ]);
  }

  private async queueForType(type: AttributeEntityType): Promise<void> {
    try {
      // Time-bucketed id: triggers within one debounce window dedupe to a single
      // delayed job, while a trigger that fires DURING an active run still lands
      // in the next bucket (a fixed id would silently drop it and strand its
      // pendings until the next collection run). Extra buckets no-op cheaply.
      const bucket = Math.floor(Date.now() / DEBOUNCE_MS);
      await this.queue.add(
        ADJUDICATE_JOB,
        { type, campaignId: currentCampaignId() },
        {
          jobId: `${ADJUDICATE_JOB}:${type}:${bucket}`,
          delay: DEBOUNCE_MS,
          removeOnComplete: true,
          removeOnFail: 25,
          attempts: 2,
        },
      );
    } catch (error) {
      if (this.isDuplicateJobError(error)) {
        return; // already scheduled — the queued run will pick these up too
      }
      // Never let trigger plumbing break collection; quarantine keeps this safe.
      this.logger.error('Failed to enqueue attribute adjudication', {
        type,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /already exists/i.test(message);
  }
}
