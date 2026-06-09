import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';

export interface ModerationDecision {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class ModerationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ModerationService');
  }

  async moderateText(text: string): Promise<ModerationDecision> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) {
      return { allowed: true, reason: 'empty' };
    }

    try {
      const result = await this.llmService.moderateText(trimmed);
      if (!result.allowed) {
        this.logger.info('Content blocked by moderation', {
          reason: result.reason,
        });
      }
      return { allowed: result.allowed, reason: result.reason };
    } catch (error: unknown) {
      // Pre-launch: fail OPEN on a transient moderation outage so submissions aren't
      // wrongly blocked. Before public launch, switch to soft-hold (queue/pending)
      // per the polls plan §9 (do NOT auto-allow at scale).
      this.logger.error('Moderation call failed; allowing by default', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, reason: 'moderation_error' };
    }
  }
}
