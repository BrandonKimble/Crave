import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LoggerService } from '../../shared';
import { UsageLedgerService } from '../external-integrations/shared/usage-ledger.service';

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
  private readonly client: GoogleGenAI | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly usageLedger: UsageLedgerService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotoVisionService');
    const apiKey =
      this.configService.get<string>('llm.apiKey') || process.env.LLM_API_KEY;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  /** true = plausibly food/drink/menu/restaurant content; false = clearly
   *  not. Fail-OPEN on infra errors (a broken classifier must not block
   *  legitimate photos — safety is Rekognition's job, this is topicality). */
  async isFoodContent(thumbUrl: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn('LLM key missing — is-food gate skipped (fail open)');
      return true;
    }
    try {
      const imageResponse = await fetch(thumbUrl);
      if (!imageResponse.ok) {
        this.logger.warn('Thumb fetch failed — is-food gate skipped', {
          status: imageResponse.status,
        });
        return true;
      }
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType:
                    imageResponse.headers.get('content-type') ?? 'image/jpeg',
                  data: bytes.toString('base64'),
                },
              },
              {
                text:
                  'Is this image plausibly related to food, drink, a dish, ' +
                  'a menu, or the inside/outside of a restaurant? Answer ' +
                  'with exactly YES or NO.',
              },
            ],
          },
        ],
      });
      // Paid chokepoint: every Gemini call is ledgered (cost-recon audit
      // 2026-07-10 found this was the one unledgered caller).
      this.usageLedger.record({
        service: 'gemini',
        operation: 'generateContent',
        model: 'gemini-2.5-flash-lite',
        mode: 'interactive',
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens:
          (response.usageMetadata?.candidatesTokenCount ?? 0) +
          (response.usageMetadata?.thoughtsTokenCount ?? 0),
        cachedTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
        caller: 'photo-vision.isFoodContent',
      });
      const text = (response.text ?? '').trim().toUpperCase();
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
