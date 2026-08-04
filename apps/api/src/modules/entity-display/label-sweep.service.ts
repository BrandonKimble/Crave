import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  normalizeLocaleTag,
} from '../../shared/locale';
import {
  isDisplayable,
  normalizeSurface,
} from '../content-processing/entity-resolver/entity-identity';
import {
  AUTO_APPROVE_SCORE,
  NoopLabelGenerator,
  type GeneratedLabel,
  type LabelGenerationRequest,
  type LabelGenerator,
} from './label-generator';

/**
 * M2 — THE UNLABELED-CONCEPT SWEEP (mechanism only; the judge is stubbed).
 *
 * THE WATERMARK IS THE RELATION. Round 3 replaced mint-time drafting with this
 * sweep for one reason worth restating: `NOT EXISTS (a label row for this
 * locale)` covers the PAST and the FUTURE with ONE mechanism, needs no second
 * timestamp column to fall out of sync, and never couples concept minting to
 * the active-locale set. Turn on a new locale and every concept ever minted is
 * instantly "due" — no backfill script, no catch-up bucket.
 *
 * NOT WIRED TO A CRON, deliberately: crons are off in this environment and a
 * sweep that quietly starts spending money is not something to leave lying
 * around. `scripts/sweep-entity-labels.ts` is the manual driver.
 */

/** Concept types that HAVE display labels. Restaurants never do (proper nouns). */
const LABELED_ENTITY_TYPES = ['restaurant_attribute', 'food', 'ingredient'];

export interface SweepBatch {
  locale: string;
  requests: LabelGenerationRequest[];
}

export interface SweepResult {
  locale: string;
  /** Concepts with no active label row for this locale, before the run. */
  due: number;
  requested: number;
  generated: number;
  written: number;
  autoApproved: number;
  queuedForReview: number;
}

@Injectable()
export class LabelSweepService {
  private readonly logger = new Logger(LabelSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The locales a sweep is responsible for: every active one except English. */
  sweepLocales(): string[] {
    return SUPPORTED_LOCALES.filter(
      (locale) => locale.split('-')[0] !== DEFAULT_LOCALE,
    );
  }

  /**
   * How many concepts are DUE for `locale`. A number worth having on its own:
   * it is the honest answer to "is this language ready to launch?".
   */
  async countDue(locale: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ due: bigint }>>(
      Prisma.sql`
        SELECT count(*)::bigint AS due
        FROM core_entities e
        WHERE e.type::text = ANY(${LABELED_ENTITY_TYPES})
          AND e.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM entity_labels l
            WHERE l.entity_id = e.entity_id
              AND l.locale LIKE ${`${locale.split('-')[0]}%`}
              AND l.status IN ('active', 'candidate')
          )
      `,
    );
    return Number(rows[0]?.due ?? 0);
  }

  /**
   * The batch: concepts lacking a label for `locale`, most-referenced first.
   * ORDER MATTERS because a sweep is always budget-bounded — the concepts
   * users actually see should be labeled first, and "appears on more
   * restaurants" is the cheapest honest proxy the graph already holds.
   *
   * 'candidate' rows count as covered: a concept awaiting review is not
   * unlabeled, and re-generating it every night would spend money to produce
   * the same disputed answer.
   */
  async nextBatch(locale: string, limit: number): Promise<SweepBatch> {
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string; type: string }>
    >(
      Prisma.sql`
        SELECT e.entity_id, e.name, e.type::text AS type
        FROM core_entities e
        WHERE e.type::text = ANY(${LABELED_ENTITY_TYPES})
          AND e.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM entity_labels l
            WHERE l.entity_id = e.entity_id
              AND l.locale LIKE ${`${locale.split('-')[0]}%`}
              AND l.status IN ('active', 'candidate')
          )
        ORDER BY e.created_at ASC
        LIMIT ${limit}
      `,
    );
    return {
      locale,
      requests: rows.map((row) => ({
        entityId: row.entity_id,
        name: row.name,
        entityType: row.type,
        locale,
      })),
    };
  }

  /**
   * Run one sweep pass with `generator`. With the default NoopLabelGenerator
   * this measures the backlog and writes nothing — which is the correct
   * behaviour for a mechanism whose producer has not been built yet.
   */
  async sweep(
    locale: string,
    options: { limit?: number; generator?: LabelGenerator } = {},
  ): Promise<SweepResult> {
    const limit = options.limit ?? 200;
    const generator = options.generator ?? new NoopLabelGenerator();
    const due = await this.countDue(locale);
    const batch = await this.nextBatch(locale, limit);
    const generated = batch.requests.length
      ? await generator.generate(batch.requests)
      : [];
    const written = await this.writeLabels(generated);
    const result: SweepResult = {
      locale,
      due,
      requested: batch.requests.length,
      generated: generated.length,
      written,
      autoApproved: generated.filter((row) => row.status === 'active').length,
      queuedForReview: generated.filter((row) => row.status === 'candidate')
        .length,
    };
    this.logger.log(
      `label sweep locale=${locale} generator=${generator.name} due=${result.due} requested=${result.requested} written=${result.written} review=${result.queuedForReview}`,
    );
    return result;
  }

  /**
   * The ONE writer for generated labels. `is_default` is set only for a row
   * that both won consensus and cleared the MQM threshold — a disputed label
   * must never become the default a user sees while it waits for review.
   */
  async writeLabels(
    labels: readonly GeneratedLabel[],
    source: 'seed' | 'sweep' | 'manual' | 'synthesis' = 'sweep',
  ): Promise<number> {
    let written = 0;
    for (const label of labels) {
      // Same ingress primitives as the alias writer: NFC + format-control
      // strip so a surface has ONE normal form, a validated BCP-47 tag so a
      // typo can't land as free text the match filter drops, and the
      // Unicode-aware displayable guard so a zero-width/NBSP-only label (which
      // JS .trim() and SQL btrim both miss) never renders an invisible name.
      const form = normalizeSurface(label.form);
      const locale = normalizeLocaleTag(label.locale);
      if (!isDisplayable(form)) {
        continue;
      }
      // `uq_entity_labels_one_default` is a PARTIAL unique on
      // (entity_id, locale) WHERE is_default — a second default for the same
      // pair is a constraint violation, not a preference. First writer wins;
      // promoting a later label is a review action, never a side effect of a
      // sweep re-run.
      const existingDefault = await this.prisma.entityLabel.findFirst({
        where: {
          entityId: label.entityId,
          locale,
          isDefault: true,
        },
        select: { form: true },
      });
      const isDefault =
        !existingDefault &&
        label.status === 'active' &&
        label.judgement.score >= AUTO_APPROVE_SCORE;
      await this.prisma.entityLabel.upsert({
        where: {
          entityId_locale_form: {
            entityId: label.entityId,
            locale,
            form,
          },
        },
        create: {
          entityId: label.entityId,
          locale,
          form,
          description: label.description,
          isDefault,
          rank: 0,
          status: label.status,
          source,
        },
        update: {
          description: label.description,
          status: label.status,
          updatedAt: new Date(),
        },
      });
      written += 1;
    }
    return written;
  }
}
