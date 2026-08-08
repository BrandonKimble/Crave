import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { LoggerService } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';

/**
 * SAFETY MODERATION, SERVER-SIDE (D149-V, owner-approved 2026-08-07).
 *
 * ── WHAT CHANGED AND WHY ─────────────────────────────────────────────────
 * Safety moderation used to be a Cloudinary UPLOAD-PRESET setting
 * (`moderation: 'aws_rek'`): a prepaid add-on with a 50-images/month free
 * allowance and no per-call meter of ours. That is the worst shape spend can
 * take — invisible until it runs OUT, at which point Cloudinary simply stops
 * moderating and the first symptom is a user seeing something they should
 * never have seen. It was un-metered, un-gated, and un-priced.
 *
 * Google Cloud Vision's SafeSearch is the same verdict as an ordinary paid
 * API call we make ourselves: one request per photo, metered into
 * api_usage_ledger like Places and Gemini, priced in vendor-pricing.ts, and
 * watched by the nightly expectation comparator. Quota becomes spend, and
 * spend is something this codebase already knows how to watch.
 *
 * ── NO GATE, ONLY A METER (D149 "scream, never kill") ────────────────────
 * There is deliberately NO spend admission here. At $1.50/1,000 images a
 * runaway would cost pennies before the nightly comparator screamed, and the
 * alternative — refusing to moderate — is strictly worse than paying: an
 * un-moderated photo is a safety event, not a budget event. The comparator
 * (expected-monthly-spend.ts) is the watcher.
 *
 * ── FAILURE POSTURE: CLOSED, ALWAYS ──────────────────────────────────────
 * Every failure path THROWS. There is no code path in this file that returns
 * `approved` without a verdict from Google. Callers must treat a throw as
 * "unknown, stay pending, retry" — never as approval. That asymmetry against
 * PhotoVisionService (the is-food classifier, which fails OPEN) is deliberate
 * and documented on both sides: topicality errs toward availability, safety
 * errs toward retry.
 */

/** Google's five-value SafeSearch scale, most- to least-certain. */
export type SafeSearchLikelihood =
  | 'UNKNOWN'
  | 'VERY_UNLIKELY'
  | 'UNLIKELY'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERY_LIKELY';

const LIKELIHOOD_RANK: Record<SafeSearchLikelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

/**
 * THE THRESHOLD — an OWNER-TUNABLE constant, not a derived number.
 *
 * `LIKELY` (rank 4) means Google thinks the category probably applies. We
 * reject at that level and above for the three categories that describe what
 * a person would be upset to see on a restaurant photo: adult, violence,
 * racy. `spoof` and `medical` are NOT safety categories — a spoofed or
 * clinical image is odd, not harmful — and rejecting on them would silently
 * delete legitimate food photos (latte art reads as `spoof` surprisingly
 * often), so they are read and logged but never decide.
 *
 * `POSSIBLE` was considered and rejected: it fires on ordinary food
 * photography (glistening meat, beach-bar scenes) and every false positive
 * here DESTROYS the asset. Raising or lowering this is a one-line owner
 * decision — the ranks above are the whole mechanism.
 */
const REJECT_AT_OR_ABOVE: SafeSearchLikelihood = 'LIKELY';

/** The categories whose likelihood can reject a photo. */
const DECIDING_CATEGORIES = ['adult', 'violence', 'racy'] as const;

export interface ImageSafetyVerdict {
  decision: 'approved' | 'rejected';
  /** Present only on rejection: `adult:VERY_LIKELY`. Logged, never shown. */
  reason?: string;
  /** Every category Google returned, for the log line. */
  likelihoods: Partial<Record<string, SafeSearchLikelihood>>;
}

/**
 * The ONE failure type this service raises. `transient` distinguishes "try
 * again in ten minutes" (network, timeout, 429, 5xx) from "a human must fix
 * something" (missing key, 403, malformed request) — the enrichment
 * taxonomy's split.
 *
 * Both classes have the SAME consequence for a photo: it stays pending and
 * the reconciliation sweep retries. The flag exists so the log can say which
 * one it is, because a permanent failure that retries forever is a silent
 * outage of safety moderation and deserves to read as an error, not a warn.
 */
export class ImageModerationUnavailableError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    /**
     * WHOSE PROBLEM IT IS — and the only thing that can ever end a retry.
     *
     * `service` — our key, our request, the vendor, the network. EVERY photo
     *   is affected, so nothing about this failure is a fact about the image,
     *   and no photo may ever be terminated because of it. It retries until a
     *   human fixes it (and the sweep alerts when that takes too long).
     * `image` — Google read the request and could not annotate THIS image
     *   (unfetchable URL, unsupported format). Combined with `transient:
     *   false` it is the one honest terminal answer: retrying costs a paid
     *   call per sweep, forever, to be told the same thing (F9703).
     */
    readonly scope: 'service' | 'image' = 'service',
  ) {
    super(message);
    this.name = 'ImageModerationUnavailableError';
  }
}

interface AnnotateResponse {
  responses?: Array<{
    safeSearchAnnotation?: Record<string, SafeSearchLikelihood>;
    error?: { code?: number; message?: string };
  }>;
}

@Injectable()
export class GoogleVisionService {
  private readonly logger: LoggerService;
  private readonly baseUrl = 'https://vision.googleapis.com/v1/images:annotate';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly usageLedger: UsageLedgerService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('GoogleVisionService');
  }

  /**
   * SafeSearch verdict for one image URL (a signed Cloudinary delivery URL —
   * Google fetches it directly, so we never move the bytes ourselves).
   *
   * Throws ImageModerationUnavailableError on ANY failure. Never returns
   * `approved` without Google having said so.
   */
  async moderateImage(imageUrl: string): Promise<ImageSafetyVerdict> {
    // FAIL LOUD AT FIRST USE, NOT AT BOOT (deliberate): the key is minted
    // separately from a deploy, and an API that refuses to start because a
    // photo-moderation key is absent would take down search, polls, and every
    // other surface for one feature's credential. First use is where the
    // absence actually matters — and because the caller treats a throw as
    // "stay pending", an unconfigured environment parks photos rather than
    // publishing them unmoderated.
    const apiKey = this.configService.get<string>('googleVision.apiKey');
    if (!apiKey) {
      throw new ImageModerationUnavailableError(
        'GOOGLE_VISION_API_KEY is not configured — safety moderation cannot run',
        false,
      );
    }
    const timeout =
      Number(this.configService.get('googleVision.timeout')) || 15_000;

    // METERED BEFORE THE CALL, like Places: a request that times out was
    // still made and still billed. Recording after a successful response
    // would systematically under-meter exactly the failures worth seeing.
    this.usageLedger.record({
      service: 'google_vision',
      operation: 'safeSearchDetection',
      caller: 'google-vision.moderateImage',
    });

    let data: AnnotateResponse;
    try {
      const response = await firstValueFrom(
        this.httpService.post<AnnotateResponse>(
          this.baseUrl,
          {
            requests: [
              {
                image: { source: { imageUri: imageUrl } },
                features: [{ type: 'SAFE_SEARCH_DETECTION', maxResults: 1 }],
              },
            ],
          },
          {
            params: { key: apiKey },
            timeout,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      data = response.data;
    } catch (error) {
      const axiosError = error as AxiosError<{
        error?: { message?: string };
      }>;
      const status = axiosError.response?.status;
      // No response at all (DNS, socket, timeout), a 429, or a 5xx is the
      // vendor or the network having a moment — retry. A 4xx that is not 429
      // is us: a bad key, a disabled API, an unreachable image URL.
      const transient = status === undefined || status === 429 || status >= 500;
      const message =
        axiosError.response?.data?.error?.message ?? axiosError.message;
      throw new ImageModerationUnavailableError(
        `Vision SafeSearch request failed (${status ?? 'no response'}): ${message}`,
        transient,
      );
    }

    const result = data.responses?.[0];
    if (!result || result.error) {
      // A per-image error inside a 200 envelope (Vision reports image-level
      // failures this way — unfetchable URL, unsupported format). Treated as
      // NON-transient: retrying an image Google cannot read will fail the
      // same way forever, and the row parks visibly rather than going live.
      throw new ImageModerationUnavailableError(
        `Vision SafeSearch returned no annotation: ${
          result?.error?.message ?? 'empty response'
        }`,
        false,
        'image',
      );
    }
    const annotation = result.safeSearchAnnotation;
    if (!annotation) {
      throw new ImageModerationUnavailableError(
        'Vision SafeSearch returned no safeSearchAnnotation',
        false,
      );
    }

    // AN ABSENT OR `UNKNOWN` SCORE IS NOT AN APPROVAL (F9702).
    //
    // The loop below ranks a missing category, and `UNKNOWN` itself, at 0 —
    // the SAFEST possible score — so an annotation of `{}` (present, empty:
    // exactly what a partially-failed or future-shaped response looks like)
    // walked past all three categories and returned `approved`. The whole
    // fail-closed posture of this file was one empty object away from
    // publishing an unmoderated photo.
    //
    // A verdict requires an ANSWER on every deciding category. Anything else
    // is the moderator not having decided, which is the same event as the
    // moderator being down — so it takes the same path: throw, stay pending,
    // ask again. `scope: 'image'` because it is this image Google declined to
    // score; `transient` because a re-ask can legitimately answer.
    const undecided = DECIDING_CATEGORIES.filter((category) => {
      const likelihood = annotation[category];
      return (
        !likelihood ||
        likelihood === 'UNKNOWN' ||
        LIKELIHOOD_RANK[likelihood] === undefined
      );
    });
    if (undecided.length > 0) {
      throw new ImageModerationUnavailableError(
        `Vision SafeSearch did not score ${undecided.join(', ')} ` +
          `(got ${JSON.stringify(annotation)}) — no verdict, not an approval`,
        true,
        'image',
      );
    }

    const threshold = LIKELIHOOD_RANK[REJECT_AT_OR_ABOVE];
    for (const category of DECIDING_CATEGORIES) {
      const likelihood = annotation[category];
      const rank = LIKELIHOOD_RANK[likelihood];
      if (rank >= threshold) {
        return {
          decision: 'rejected',
          reason: `${category}:${likelihood}`,
          likelihoods: annotation,
        };
      }
    }
    return { decision: 'approved', likelihoods: annotation };
  }
}
