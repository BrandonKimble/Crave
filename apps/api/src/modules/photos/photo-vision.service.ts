import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';

/**
 * The IS-FOOD gate (product/images.md moderation): Rekognition covers
 * safety only, so food-vs-not rides a Gemini flash-lite vision call against
 * the THUMB variant (~30KB — pennies per thousand). Runs async in the
 * moderation pipeline after safety approval; fail posture is documented on
 * classify().
 */
@Injectable()
export class PhotoVisionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotoVisionService');
  }

  /** true = plausibly food/drink/menu/restaurant content; false = clearly
   *  not. Fail-OPEN on infra errors (a broken classifier must not block
   *  legitimate photos — safety is Rekognition's job, this is topicality). */
  async isFoodContent(thumbUrl: string): Promise<boolean> {
    try {
      const imageResponse = await fetch(thumbUrl);
      if (!imageResponse.ok) {
        this.logger.warn('Thumb fetch failed — is-food gate skipped', {
          status: imageResponse.status,
        });
        return true;
      }
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      // THE GATEWAY, not a private client (2026-07-29). This was the one
      // assembler outside every protection: no thinking config (harmless
      // only while the model literal stayed gemini-2.5), no spend admission,
      // its own ledger row. Whoever bumps the model now inherits the caller
      // profile and the resolver instead of silently recreating the
      // HIGH-thinking bug. Fail posture unchanged: any error — including a
      // closed spend budget — keeps the photo (topicality is not safety).
      const raw = await this.llmService.generateForCaller({
        caller: 'photos.is_food',
        prompt:
          'Is this image plausibly related to food, drink, a dish, ' +
          'a menu, or the inside/outside of a restaurant? Answer ' +
          'with exactly YES or NO.',
        mediaParts: [
          {
            inlineData: {
              mimeType:
                imageResponse.headers.get('content-type') ?? 'image/jpeg',
              data: bytes.toString('base64'),
            },
          },
        ],
        generationConfig: { temperature: 0 },
        maxRetries: 0,
      });
      const text = raw.trim().toUpperCase();
      return !text.startsWith('NO');
    } catch (error) {
      this.logger.warn('is-food classification failed — fail open', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return true;
    }
  }
}
