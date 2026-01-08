import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../shared';

export interface ModerationDecision {
  allowed: boolean;
  reason?: string;
  categories?: Record<string, number>;
}

@Injectable()
export class ModerationService {
  private readonly logger: LoggerService;
  private readonly endpoint: string;
  private readonly allowlistPhrases = ['bloody', 'killer', 'dirty fries'];

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ModerationService');
    this.endpoint =
      this.configService.get<string>('moderation.endpoint') ??
      'https://contentmoderation.googleapis.com/v1beta/moderations:moderateText';
  }

  async moderateText(text: string): Promise<ModerationDecision> {
    const apiKey = this.configService.get<string>('moderation.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_MODERATION_API_KEY not configured, allowing text by default',
      );
      return { allowed: true, reason: 'missing_api_key' };
    }

    try {
      const response = await fetch(`${this.endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
        }),
      });

      if (!response.ok) {
        this.logger.warn('Moderation API responded with non-200 status', {
          status: response.status,
          statusText: response.statusText,
        });
        return { allowed: true, reason: 'moderation_api_error' };
      }

      const payload = (await response.json()) as {
        categories?: Array<{ name: string; score: number }>;
      };
      const categories = Object.fromEntries(
        (payload.categories ?? []).map((category) => [
          category.name,
          category.score,
        ]),
      );

      const blocked = Object.entries(categories).some(
        ([, score]) => score >= 0.8,
      );

      if (blocked && this.isAllowlisted(text)) {
        return { allowed: true, categories, reason: 'allowlist_override' };
      }

      return {
        allowed: !blocked,
        categories,
        reason: blocked ? 'high_risk_category' : undefined,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to call moderation API', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, reason: 'moderation_api_failure' };
    }
  }

  private isAllowlisted(text: string): boolean {
    const normalized = text.toLowerCase();
    return this.allowlistPhrases.some((phrase) => normalized.includes(phrase));
  }
}
