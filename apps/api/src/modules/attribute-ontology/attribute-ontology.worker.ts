import { Inject, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService } from '../../shared';
import { AttributeOntologyService } from './attribute-ontology.service';
import { runInWorkContext } from '../external-integrations/shared/work-context';
import {
  ATTRIBUTE_ONTOLOGY_QUEUE,
  ADJUDICATE_JOB,
  AttributeAdjudicationJobData,
} from './attribute-ontology-queue.service';

/**
 * Drains pending (quarantined) attributes: builds a placement plan against the
 * live active ontology and applies it (promote / merge / reject / rename). Runs
 * debounced after collection batches. Always on — quarantine guarantees a failed
 * or delayed run can never surface dirty data, so this worker is purely the
 * latency knob for new vocabulary going live.
 */
@Processor(ATTRIBUTE_ONTOLOGY_QUEUE)
export class AttributeOntologyWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly ontologyService: AttributeOntologyService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('AttributeOntologyWorker');
  }

  @Process(ADJUDICATE_JOB)
  async handle(job: Job<AttributeAdjudicationJobData>): Promise<void> {
    const type = job.data?.type;
    if (type !== 'item_attribute' && type !== 'place_attribute') {
      this.logger.warn('Adjudication job missing/invalid type', {
        jobId: job.id,
        data: job.data,
      });
      return;
    }

    // F357: re-establish the enqueuing work's campaign, which the BullMQ
    // boundary drops. The run's LLM spend then debits that campaign's
    // envelope — an ALREADY-GOVERNED bound on a loop that otherwise sizes
    // itself from however many pending rows collection happened to mint.
    // Outside a campaign this is a no-op and the run is ungoverned in size,
    // exactly as before.
    await runInWorkContext({ campaignId: job.data?.campaignId }, async () => {
      const plan = await this.ontologyService.buildPlan(type, 'pending');
      if (
        plan.promotions.length === 0 &&
        plan.merges.length === 0 &&
        plan.rejections.length === 0
      ) {
        return;
      }

      const result = await this.ontologyService.applyPlan(plan, {
        apply: true,
      });
      this.logger.info('Pending attributes adjudicated', {
        jobId: job.id,
        type,
        campaignId: job.data?.campaignId ?? null,
        candidates: plan.candidateCount,
        ...result,
      });
    });
  }
}
