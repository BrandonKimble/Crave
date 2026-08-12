import { VOCABULARY_PROMPT_VERSION } from './vocabulary-generator';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SUPPORTED_LOCALES,
  localeLookupChain,
  normalizeLocaleTag,
} from '../../shared/locale';
import {
  isDisplayable,
  normalizeSurface,
} from '../content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import {
  WordClaimAdjudicatorService,
  type ContestedClaim,
} from '../content-processing/entity-resolver/word-claim-adjudicator.service';
import {
  NoopLabelGenerator,
  type GeneratedLabel,
  type LabelGenerationRequest,
  type LabelGenerator,
} from './label-generator';

/**
 * M2 — THE UNLABELED-CONCEPT SWEEP (mechanism only; the judge is stubbed).
 *
 * THE WATERMARK IS THE RELATION. Round 3 replaced mint-time drafting with this
 * sweep for one reason worth restating: a relation covers the PAST and the
 * FUTURE with ONE mechanism, needs no second timestamp column to fall out of
 * sync, and never couples concept minting to the active-locale set. Turn on a
 * new locale and every concept ever minted is instantly "due" — no backfill
 * script, no catch-up bucket.
 *
 * The relation is "HAVE WE ASKED", not "is there an output" (KL-A, 2026-08-09):
 * the run LEDGER (`knowledge_pass_runs`, pass `label_sweep:<locale>`) is
 * written for every concept in every batch, whatever came back, and a label row
 * at the current prompt version is the same evidence recorded by the passes
 * that ran before the ledger existed. An output-only watermark made every
 * abstention permanently due, and — the batch being most-referenced-first —
 * the same abstentions re-filled the capped nightly head forever.
 *
 * WIRED TO THE NIGHTLY via KnowledgeMaintenanceService (2026-08-08) —
 * behind KNOWLEDGE_MAINTENANCE_ENABLED under the global CRONS_ENABLED
 * kill-switch, so it cannot quietly spend. `scripts/sweep-entity-labels.ts`
 * remains the manual driver.
 */

/** Concept types that HAVE display labels. Restaurants never do (proper nouns). */
// food_attribute added 2026-08-06: its absence left `spicy` (and every
// dish-side attribute) with zero es surfaces — found by the launch-gate
// residual, fixed the compound stratum when simulated.
const LABELED_ENTITY_TYPES = [
  'restaurant_attribute',
  'food_attribute',
  'food',
  'ingredient',
];

/**
 * The ledger key for one locale's sweep. `knowledge_pass_runs` is keyed
 * (pass, subject, prompt_version) and a sweep is PER LOCALE, so the locale
 * belongs in the pass name — es and vi ask different questions about the same
 * concept and must not answer for each other.
 */
export function sweepPass(locale: string): string {
  return `label_sweep:${normalizeLocaleTag(locale)}`;
}

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
  /** Written with status 'active' — i.e. live for users. */
  autoApproved: number;
  /** Search surfaces the generator proposed. */
  surfacesOffered: number;
  /** …that were actually banked. */
  surfacesBanked: number;
  /** …that P0-b's collision guard REFUSED. Reported because a locale-tagged
   *  write never changes the und-only projection, so without this a run where
   *  the guard blocked everything looked identical to a perfect run. */
  surfacesBlocked: number;
}

@Injectable()
export class LabelSweepService {
  private readonly logger = new Logger(LabelSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claimAdjudicator: WordClaimAdjudicatorService,
  ) {}

  /**
   * The locales a sweep is responsible for: EVERY active one, English
   * included (L2, 2026-08-11).
   *
   * English used to be excluded on the reasoning that `core_entities.name` is
   * already the English label — true, and irrelevant to what this pass is
   * actually worth. The label is the half a user READS; the half that moved
   * the launch gate from 77.3% to 96.7% was the SEARCH SURFACES, and English
   * speakers type words the canonical name does not contain just as Spanish
   * ones do. The corpus calls a dish "chicken and rice"; a New Yorker types
   * "chicken over rice" and reaches nothing. There was no mechanism that
   * could ever produce that word, because the one pass that enumerates how
   * speakers name a concept was structurally forbidden from being asked about
   * the language most of them speak.
   *
   * Nothing else needed changing for this to be true: the pass is
   * parameterized by locale end to end — the prompt, the ledger key
   * (`label_sweep:en`), the watermark's lookup chain, the surface writer's
   * locale tag. English was excluded by this one filter, not by any law.
   */
  sweepLocales(): string[] {
    return [...SUPPORTED_LOCALES];
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
            SELECT 1 FROM entity_surface l
            WHERE l.entity_id = e.entity_id
              -- Display predicate: a role='recall' corpus surface does not
              -- make a concept LABELLED (surface merge, §11-2).
              AND l.role <> 'recall'
              AND LOWER(l.locale) = ANY(${localeLookupChain(locale)}::text[])
              AND l.status IN ('active', 'candidate')
              AND l.prompt_version >= ${VOCABULARY_PROMPT_VERSION}
          )
          -- ...AND WE HAVE NOT ALREADY ASKED (audit KL-A, applied to the
          -- sweep). An output watermark alone conflates "no label needed" with
          -- "not yet asked": a concept the generator legitimately omits — an
          -- untranslatable proper noun, an abstention, a form that fails the
          -- displayable check — writes no row, stays due FOREVER, and, being
          -- most-referenced-first, deterministically re-occupies the head of
          -- every capped nightly run. The concepts behind it are never
          -- reached. The run ledger records the ASK, so absence-of-run is the
          -- honest re-offer signal; a label row at this version is the same
          -- evidence recorded by the older passes, before the ledger existed.
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_pass_runs r
            WHERE r.pass = ${sweepPass(locale)}
              AND r.subject_id = e.entity_id
              AND r.prompt_version >= ${VOCABULARY_PROMPT_VERSION}
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
            SELECT 1 FROM entity_surface l
            WHERE l.entity_id = e.entity_id
              -- Display predicate: a role='recall' corpus surface does not
              -- make a concept LABELLED (surface merge, §11-2).
              AND l.role <> 'recall'
              AND LOWER(l.locale) = ANY(${localeLookupChain(locale)}::text[])
              AND l.status IN ('active', 'candidate')
              AND l.prompt_version >= ${VOCABULARY_PROMPT_VERSION}
          )
          -- ...AND WE HAVE NOT ALREADY ASKED (audit KL-A, applied to the
          -- sweep). An output watermark alone conflates "no label needed" with
          -- "not yet asked": a concept the generator legitimately omits — an
          -- untranslatable proper noun, an abstention, a form that fails the
          -- displayable check — writes no row, stays due FOREVER, and, being
          -- most-referenced-first, deterministically re-occupies the head of
          -- every capped nightly run. The concepts behind it are never
          -- reached. The run ledger records the ASK, so absence-of-run is the
          -- honest re-offer signal; a label row at this version is the same
          -- evidence recorded by the older passes, before the ledger existed.
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_pass_runs r
            WHERE r.pass = ${sweepPass(locale)}
              AND r.subject_id = e.entity_id
              AND r.prompt_version >= ${VOCABULARY_PROMPT_VERSION}
          )
        -- MOST-REFERENCED FIRST. A sweep is always budget-bounded, so the
        -- concepts users actually encounter must be labelled first. This
        -- comment previously described this ordering while the SQL sorted by
        -- created_at — which is why a 3,000-concept run reached 90.0% on the
        -- gate instead of the 96.7% a gold-targeted run reached: it was
        -- labelling the oldest concepts, not the most-used ones. Measured
        -- difference in the top 5: dessert/taco/pizza/burger/coffee versus
        -- tasting menu/fish/sushi/turkey/sandwich.
        ORDER BY (
          SELECT count(*) FROM core_restaurant_items c WHERE c.food_id = e.entity_id
        ) DESC, e.created_at ASC
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
   * The batch for NAMED concepts — every labelled-type entity whose name
   * matches, in any of its type rows (this corpus carries most foods as a
   * food AND an ingredient row, and both need the word). Deliberately NOT
   * filtered by the due watermark: naming a concept IS the decision to re-ask
   * about it.
   */
  async namedBatch(
    locale: string,
    names: readonly string[],
  ): Promise<SweepBatch> {
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string; type: string }>
    >(
      Prisma.sql`
        SELECT e.entity_id, e.name, e.type::text AS type
        FROM core_entities e
        WHERE e.type::text = ANY(${LABELED_ENTITY_TYPES})
          AND e.status = 'active'
          AND lower(e.name) = ANY(${names.map((n) => n.toLowerCase().trim())}::text[])
        ORDER BY e.name ASC, e.type::text ASC
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
    options: {
      limit?: number;
      generator?: LabelGenerator;
      /**
       * NAME THE CONCEPTS instead of taking the head of the backlog. The
       * backlog is ordered most-REFERENCED-first, which is the right default
       * and a poor way to reach a GENERIC word: "soup" and "spring roll" carry
       * few direct menu-item links even though `canh` and `nem` are among the
       * commonest words a Vietnamese speaker will type. This asks the same
       * question of the same generator through the same writer, ledger and
       * adjudicator — only the SELECTION differs, so a targeted pass is never
       * a second code path that can drift from the nightly one.
       */
      entityNames?: readonly string[];
    } = {},
  ): Promise<SweepResult> {
    const limit = options.limit ?? 200;
    const generator = options.generator ?? new NoopLabelGenerator();
    const due = await this.countDue(locale);
    const batch = options.entityNames?.length
      ? await this.namedBatch(locale, options.entityNames)
      : await this.nextBatch(locale, limit);
    const generated = batch.requests.length
      ? await generator.generate(batch.requests)
      : [];
    const surfaceTally = { offered: 0, banked: 0, blocked: 0 };
    const contested: ContestedClaim[] = [];
    const written = await this.writeLabels(
      generated,
      'sweep',
      surfaceTally,
      contested,
    );
    // CLAIMS REGISTRY (§9.9): a blocked surface is not a dead counter — it is
    // an appeal. Testimony incumbents are upheld free; inferred-vs-inferred
    // conflicts get the judge; every verdict is remembered (deprecated), so
    // no claim is ever re-litigated or silently re-proposed.
    if (contested.length) {
      await this.claimAdjudicator.adjudicate(contested);
    }
    // THE ASK IS RECORDED WHATEVER CAME BACK (KL-A). Every concept in the
    // batch was put to the generator, so every one gets a run row — 'labeled'
    // when a displayable label landed, 'not_generated' when the generator
    // abstained or its form was undisplayable. Without the second case the
    // abstentions are immortal and starve everything behind them.
    if (!generator.dryRun && batch.requests.length) {
      const labeled = new Set(
        generated
          .filter((row) => isDisplayable(normalizeSurface(row.form)))
          .map((row) => row.entityId),
      );
      await this.prisma.$executeRaw`
        INSERT INTO knowledge_pass_runs (pass, subject_id, prompt_version, outcome)
        VALUES ${Prisma.join(
          batch.requests.map(
            (request) =>
              Prisma.sql`(${sweepPass(locale)}, ${request.entityId}::uuid,
                          ${VOCABULARY_PROMPT_VERSION},
                          ${labeled.has(request.entityId) ? 'labeled' : 'not_generated'})`,
          ),
        )}
        ON CONFLICT (pass, subject_id, prompt_version) DO NOTHING`;
    }
    const result: SweepResult = {
      locale,
      due,
      requested: batch.requests.length,
      generated: generated.length,
      written,
      autoApproved: generated.filter((row) => row.status === 'active').length,
      surfacesOffered: surfaceTally.offered,
      surfacesBanked: surfaceTally.banked,
      surfacesBlocked: surfaceTally.blocked,
    };
    this.logger.log(
      `label sweep locale=${locale} generator=${generator.name} due=${result.due} requested=${result.requested} written=${result.written}`,
    );
    return result;
  }

  /**
   * The ONE writer for generated labels — and, since the surface merge
   * (§11-2), for their recall claims in the SAME transaction.
   *
   * A label form is offered with role='both': a word a real speaker READS
   * is normally a word they SAY. The collision guard adjudicates that claim
   * once, here. If it loses, `addSurfaces` DEGRADES the row to 'display' —
   * the user keeps the label, the word keeps its owner, and the refusal is
   * recorded in the row itself. That is why `reconcileLabelSurfaces` is
   * deleted: there is no longer a gap between a display store and a recall
   * store for a standing pass to close.
   *
   * The generator's declared search surfaces are a SEPARATE, role='recall'
   * write so the offered/banked/blocked tally stays about them alone.
   */
  async writeLabels(
    labels: readonly GeneratedLabel[],
    source: 'seed' | 'sweep' | 'manual' | 'synthesis' = 'sweep',
    surfaceTally?: { offered: number; banked: number; blocked: number },
    contested?: ContestedClaim[],
  ): Promise<number> {
    let written = 0;
    for (const label of labels) {
      // Same ingress primitives as every other surface: NFC + format-control
      // strip so a form has ONE normal form, a validated BCP-47 tag so a typo
      // cannot land as free text the match filter drops, and the
      // Unicode-aware displayable guard so a zero-width/NBSP-only label
      // (which JS .trim() and SQL btrim both miss) never renders an
      // invisible name.
      const form = normalizeSurface(label.form);
      const locale = normalizeLocaleTag(label.locale);
      if (!isDisplayable(form)) {
        continue;
      }
      const labelResult = await this.prisma.$transaction((tx) =>
        addSurfaces(tx, label.entityId, [
          {
            form,
            locale,
            source,
            role: 'both',
            status: label.status,
            description: label.description ?? null,
            // Elect this the default label if the pair has none yet. The
            // election happens inside the insert; the partial unique
            // arbitrates the simultaneous case.
            isDefault: true,
            promptVersion: VOCABULARY_PROMPT_VERSION,
          },
        ]),
      );
      written += 1;
      // A refused label form is a CONTESTED CLAIM, not a lost label: the row
      // landed as 'display'. The adjudicator can still win it back the word.
      for (const blocked of labelResult.blocked) {
        contested?.push({
          form: blocked,
          locale,
          entityId: label.entityId,
          source,
        });
      }

      // SEARCH SURFACES the generator declared. The label is what a user
      // READS; these are what they can MATCH — and the surfaces are the half
      // that moved the launch gate (77.3% -> 96.7%). Locale-TAGGED; source
      // 'vocabulary' marks them INFERRED, so the collision guard refuses any
      // that already name a different concept (the soup->caldo class).
      // EXACTLY what the generator declared — nothing is added implicitly.
      const surfaces = Array.from(
        new Set((label.aliases ?? []).map((s) => s.trim())),
      ).filter(Boolean);
      if (surfaces.length) {
        if (surfaceTally) surfaceTally.offered += surfaces.length;
        try {
          await this.prisma.$transaction(async (tx) => {
            const result = await addSurfaces(
              tx,
              label.entityId,
              surfaces.map((surface) => ({
                form: surface,
                locale,
                // Its OWN provenance, not the dish pass's. Borrowing
                // 'knowledge_synthesis' to get under the collision guard
                // would make a bad surface untraceable to the pass that
                // wrote it. 'vocabulary' is INFERRED, so the guard applies.
                source: 'vocabulary' as const,
                role: 'recall' as const,
              })),
            );
            if (surfaceTally) {
              surfaceTally.blocked += result.blocked.length;
              surfaceTally.banked += surfaces.length - result.blocked.length;
            }
            for (const blockedForm of result.blocked) {
              contested?.push({
                form: blockedForm,
                locale,
                entityId: label.entityId,
                source: 'vocabulary',
              });
            }
          });
        } catch (error) {
          // A surface that fails to bank must never cost the label that did
          // write — display and matching degrade independently by design.
          this.logger.warn(
            `Vocabulary surfaces failed to bank entity=${label.entityId} locale=${locale}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    return written;
  }
}
