import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  canonicalFold,
  normalizeSurface,
} from '../content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import {
  hasOrthographicTrigger,
  orthographicVariants,
} from '../content-processing/entity-resolver/orthographic-variants';

/**
 * THE ORTHOGRAPHIC CENSUS — the mechanical half of the &↔"and" fix
 * (plans/orthographic-surfaces-report.md; the semantic half lives in the
 * vocabulary sweep's v8 prompt).
 *
 * WHY A CENSUS AND NOT A WRITE-DOOR HOOK. The gap's main carrier is the
 * entity NAME ("Salt & Time"), which is written by `identityInsertData` at
 * create/rename — not through `addSurfaces` — so a hook inside the surface
 * door would miss the very rows the audit measured. A watermark-shaped scan
 * covers the PAST and the FUTURE with one mechanism (the label sweep's own
 * law): every entity ever minted and every future mint becomes covered on
 * the next nightly pass, with no per-create coupling.
 *
 * WHY NO RUN LEDGER. The vocabulary sweep ledgers its asks because an ask
 * costs money and an abstention must not be re-bought. This pass asks
 * nothing: recomputing a variant is free and idempotent, and the watermark
 * IS the row — an entity whose every variant fold is already banked does no
 * work. A ledger here would be a second timestamp that can drift.
 *
 * WHAT IT MINTS: for each active entity whose name (or active surface)
 * carries the closed &↔and class, the missing retypings — role='recall'
 * (a retyping grounds, it is never rendered), source='orthographic'
 * (inferred: the collision guard polices it), surfaceOrigin
 * 'stripped-convenience' (the code synthesized the spelling, so it banks at
 * 'und' — reachable from every locale's lookup chain, which is right for a
 * retyping of a proper name).
 */
@Injectable()
export class OrthographicVariantSweepService {
  private readonly logger = new Logger(OrthographicVariantSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * One pass. `limit` bounds entities TOUCHED (those actually missing a
   * variant), not entities scanned — the scan is one indexed-ish query and
   * the whole class is a few hundred rows.
   */
  async run(options: { limit?: number; dryRun?: boolean } = {}): Promise<{
    scanned: number;
    entitiesTouched: number;
    variantsOffered: number;
    variantsBanked: number;
    variantsBlocked: number;
  }> {
    const limit = options.limit ?? 2000;
    // Candidates: any active entity whose NAME carries the class, plus any
    // whose active surface does. The SQL trigger is deliberately broader
    // than the TS one (LIKE '%&%' / word-bounded "and"); the pure module is
    // the authority on what actually mints.
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string }>
    >(Prisma.sql`
      SELECT e.entity_id, e.name
      FROM core_entities e
      WHERE e.status = 'active'
        AND (
          e.name LIKE '%&%'
          OR e.name ~* '(^|[[:space:](])and([[:space:])]|$)'
          OR EXISTS (
            SELECT 1 FROM entity_surface s
            WHERE s.entity_id = e.entity_id
              AND s.status = 'active'
              AND (s.form LIKE '%&%'
                   OR s.form ~* '(^|[[:space:](])and([[:space:])]|$)')
          )
        )
      ORDER BY e.created_at ASC
    `);

    let entitiesTouched = 0;
    let variantsOffered = 0;
    let variantsBanked = 0;
    let variantsBlocked = 0;

    for (const row of rows) {
      if (entitiesTouched >= limit) break;
      // Every form this entity is known by that carries the class...
      const surfaces = await this.prisma.$queryRaw<
        Array<{ form: string; form_folded: string; status: string }>
      >(Prisma.sql`
        SELECT form, form_folded, status FROM entity_surface
        WHERE entity_id = ${row.entity_id}::uuid
      `);
      const sourceForms = [
        row.name,
        ...surfaces.filter((s) => s.status === 'active').map((s) => s.form),
      ].filter((form) => hasOrthographicTrigger(normalizeSurface(form)));
      if (!sourceForms.length) continue;

      // ...minus the folds already banked ANYWHERE on the entity — including
      // 'deprecated' rows: deprecated is the memory that a form is WRONG
      // (R5-6b), and a mechanical pass must not re-propose what a judgment
      // refused. The entity's own name-fold counts as banked too.
      const banked = new Set(surfaces.map((s) => s.form_folded));
      banked.add(canonicalFold(row.name));

      const missing = new Map<string, string>();
      for (const form of sourceForms) {
        for (const variant of orthographicVariants(form)) {
          const fold = canonicalFold(variant);
          if (!banked.has(fold) && !missing.has(fold)) {
            missing.set(fold, variant);
          }
        }
      }
      if (!missing.size) continue;

      entitiesTouched += 1;
      variantsOffered += missing.size;
      if (options.dryRun) continue;

      const result = await this.prisma.$transaction((tx) =>
        addSurfaces(
          tx,
          row.entity_id,
          [...missing.values()].map((form) => ({
            form,
            source: 'orthographic' as const,
            role: 'recall' as const,
            surfaceOrigin: 'stripped-convenience' as const,
          })),
        ),
      );
      variantsBlocked += result.blocked.length;
      variantsBanked += missing.size - result.blocked.length;
    }

    const summary = {
      scanned: rows.length,
      entitiesTouched,
      variantsOffered,
      variantsBanked,
      variantsBlocked,
    };
    this.logger.log(
      `orthographic census scanned=${summary.scanned} touched=${summary.entitiesTouched} ` +
        `offered=${summary.variantsOffered} banked=${summary.variantsBanked} ` +
        `blocked=${summary.variantsBlocked}${options.dryRun ? ' (dry run)' : ''}`,
    );
    return summary;
  }
}
