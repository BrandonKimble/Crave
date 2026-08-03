import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';
import {
  moderationAllowed,
  moderationBlocked,
  moderationIndeterminate,
  type ModerationVerdict,
} from './moderation-verdict';

@Injectable()
export class ModerationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ModerationService');
  }

  /**
   * Moderate one piece of user text.
   *
   * Returns a VERDICT, not a boolean — see moderation-verdict.ts. This method
   * never decides what to DO about an unanswerable question; each caller names
   * its own policy via resolveModeration().
   */
  async moderateText(text: string): Promise<ModerationVerdict> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) {
      // Empty text is an ANSWER, not a guess: there is no content, so there is
      // nothing to block.
      return moderationAllowed();
    }

    try {
      const result = await this.llmService.moderateText(trimmed);
      if (!result.allowed) {
        this.logger.info('Content blocked by moderation', {
          reason: result.reason,
        });
        return moderationBlocked(result.reason ?? 'blocked');
      }
      return moderationAllowed();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // LOUD. An indeterminate verdict is an incident: the moderator is not
      // answering. It is emphatically not "this text is fine", which is what
      // returning `{allowed: true, reason: 'moderation_error'}` used to mean,
      // silently, for every caller at once.
      this.logger.error(
        'moderateText INDETERMINATE — the moderator did not answer',
        {
          operation: 'moderation_indeterminate',
          error: { message },
        },
      );
      return moderationIndeterminate('moderator_unavailable', message);
    }
  }
}
