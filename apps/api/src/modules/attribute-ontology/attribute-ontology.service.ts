import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../external-integrations/llm/llm.service';

/** Attribute entity types this service canonicalizes. */
export type AttributeEntityType = 'food_attribute' | 'restaurant_attribute';

export type CanonicalizationScope =
  | 'pending' // steady state: place new pending terms against the active ontology
  | 'all'; // one-time bulk: re-cluster the entire (active + pending) vocabulary

interface AttributeRow {
  entityId: string;
  name: string;
  status: string;
  aliases: string[];
}

/** A pending entity confirmed as a brand-new canonical (status -> active). */
export interface PlannedPromotion {
  entityId: string;
  name: string;
  /** Synonym names folded onto this canonical's aliases. */
  aliases: string[];
}

/** One entity folded into another: `merged` is deleted, its refs re-point to `canonical`. */
export interface PlannedMerge {
  canonicalEntityId: string;
  canonicalName: string;
  mergedEntityId: string;
  mergedName: string;
}

/** A term the LLM judged invalid: the entity is deleted (and dropped from any arrays). */
export interface PlannedRejection {
  entityId: string;
  name: string;
  reason: string;
}

/** A name the LLM returned that did not match any fetched entity — never acted on. */
export interface UnresolvedTerm {
  name: string;
  context: 'group_member' | 'group_canonical' | 'rejected';
}

export interface CanonicalizationPlan {
  type: AttributeEntityType;
  scope: CanonicalizationScope;
  candidateCount: number;
  promotions: PlannedPromotion[];
  merges: PlannedMerge[];
  rejections: PlannedRejection[];
  unresolved: UnresolvedTerm[];
}

export interface ApplyResult {
  /** false when the plan was executed then rolled back (verify mode). */
  applied: boolean;
  promotions: number;
  merges: number;
  rejections: number;
  /** Connection/entity rows whose attribute arrays were re-pointed (merge). */
  refsRepointed: number;
  /** Connection/entity rows an id was stripped from (reject). */
  refsRemoved: number;
}

const DEFAULT_CHUNK_SIZE = 120;

/** Thrown to abort the apply transaction in verify (dry) mode. */
class PlanRollback extends Error {}

/**
 * Builds (and, later, applies) the canonical attribute ontology.
 *
 * The ontology has no separate table: the canonical vocabulary IS the set of
 * `core_entities` rows of the given attribute type with `status = 'active'`,
 * each carrying its synonyms in `aliases`. Collection coins new attributes as
 * `pending` (quarantined from reads); this service adjudicates them — promoting
 * genuinely new canonicals, merging synonyms into existing canonicals, and
 * rejecting junk.
 *
 * Increment 2a (this file): planning only. `buildPlan` fetches, calls the LLM
 * adjudicator (chunked), resolves the returned names back to concrete entity
 * rows, and returns a fully-resolved, non-destructive plan. Applying the plan
 * (transactional promote / merge-with-reference-repoint / reject) lands next.
 */
@Injectable()
export class AttributeOntologyService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('AttributeOntologyService');
  }

  /**
   * Compute a canonicalization plan without mutating anything.
   *
   * @param type   which attribute vocabulary to canonicalize
   * @param scope  'pending' (steady state) or 'all' (one-time bulk re-cluster)
   */
  async buildPlan(
    type: AttributeEntityType,
    scope: CanonicalizationScope = 'pending',
    chunkSize: number = DEFAULT_CHUNK_SIZE,
  ): Promise<CanonicalizationPlan> {
    const rows = await this.fetchAttributeRows(type);

    // Index every entity by normalized name and alias so we can resolve the
    // LLM's verbatim term echoes back to concrete rows. First writer wins on a
    // collision so a stable canonical isn't shadowed by a later duplicate.
    const byName = new Map<string, AttributeRow>();
    for (const row of rows) {
      for (const key of [row.name, ...row.aliases]) {
        const norm = this.normalize(key);
        if (norm && !byName.has(norm)) byName.set(norm, row);
      }
    }

    const activeRows = rows.filter((r) => r.status === 'active');
    const incomingRows =
      scope === 'all' ? rows : rows.filter((r) => r.status === 'pending');

    const plan: CanonicalizationPlan = {
      type,
      scope,
      candidateCount: incomingRows.length,
      promotions: [],
      merges: [],
      rejections: [],
      unresolved: [],
    };

    if (incomingRows.length === 0) {
      this.logger.info('No candidate attributes to canonicalize', {
        type,
        scope,
      });
      return plan;
    }

    // Seed the "existing canonical" context. In 'all' scope there is no frozen
    // anchor, so canonicals emerge from the data; chunks accumulate confirmed
    // canonicals so later chunks can merge into earlier ones.
    const existingNames = new Set<string>(
      scope === 'all' ? [] : activeRows.map((r) => r.name),
    );

    const incomingNames = incomingRows.map((r) => r.name);
    // Only these entities may be merged away or rejected; existing actives in
    // 'pending' scope are context and must never be retired by the LLM.
    const incomingIds = new Set(incomingRows.map((r) => r.entityId));
    const chunks = this.chunk(incomingNames, chunkSize);
    // Entity ids already given a role (survivor / merged / rejected / promoted)
    // across ALL chunks — prevents any entity playing two roles between chunks.
    const claimed = new Set<string>();

    for (const [chunkIndex, incoming] of chunks.entries()) {
      const result = await this.llmService.adjudicateAttributes({
        existing: Array.from(existingNames),
        incoming,
      });

      this.foldResultIntoPlan(
        result,
        byName,
        existingNames,
        incomingIds,
        claimed,
        plan,
      );

      this.logger.info('Canonicalization chunk adjudicated', {
        type,
        scope,
        chunk: `${chunkIndex + 1}/${chunks.length}`,
        chunkSize: incoming.length,
        groups: result.groups.length,
        rejected: result.rejected.length,
      });
    }

    this.logPlanSummary(plan);
    return plan;
  }

  private foldResultIntoPlan(
    result: {
      groups: { canonical: string; members: string[] }[];
      rejected: { term: string; reason: string }[];
    },
    byName: Map<string, AttributeRow>,
    existingNames: Set<string>,
    incomingIds: Set<string>,
    claimed: Set<string>,
    plan: CanonicalizationPlan,
  ): void {
    for (const group of result.groups) {
      // Members must be unclaimed incoming candidates. An existing-context term
      // that slips into members is dropped here — it can only be a merge target.
      const memberRows = this.resolveRows(
        group.members,
        byName,
        plan,
        'group_member',
      ).filter((r) => incomingIds.has(r.entityId) && !claimed.has(r.entityId));
      if (memberRows.length === 0) continue;

      // The canonical is either an existing attribute outside the member set
      // (a merge target) or one of the members. If it resolves to neither, the
      // LLM coined a name we can't map — keep the first member as the survivor.
      const canonRow = byName.get(this.normalize(group.canonical));
      const canonIsMember =
        canonRow !== undefined &&
        memberRows.some((m) => m.entityId === canonRow.entityId);
      let target: AttributeRow;
      if (canonRow && !canonIsMember) {
        target = canonRow; // existing canonical → members merge into it
      } else if (canonRow) {
        target = canonRow; // canonical is one of the members
      } else {
        target = memberRows[0];
        plan.unresolved.push({
          name: group.canonical,
          context: 'group_canonical',
        });
      }

      // Promote only when the survivor is itself an incoming candidate (a member)
      // that is still pending — i.e. a brand-new canonical entering the ontology.
      const targetIsMember = memberRows.some(
        (m) => m.entityId === target.entityId,
      );
      if (
        targetIsMember &&
        target.status === 'pending' &&
        !claimed.has(target.entityId)
      ) {
        plan.promotions.push({
          entityId: target.entityId,
          name: target.name,
          aliases: memberRows
            .filter((r) => r.entityId !== target.entityId)
            .map((r) => r.name),
        });
      }
      claimed.add(target.entityId);

      for (const member of memberRows) {
        if (member.entityId === target.entityId) continue;
        if (claimed.has(member.entityId)) continue;
        plan.merges.push({
          canonicalEntityId: target.entityId,
          canonicalName: target.name,
          mergedEntityId: member.entityId,
          mergedName: member.name,
        });
        claimed.add(member.entityId);
      }

      // The surviving canonical name is now context for later chunks.
      existingNames.add(target.name);
    }

    for (const rejection of result.rejected) {
      const row = this.resolveRow(rejection.term, byName, plan, 'rejected');
      // Reject only unclaimed incoming candidates. Existing-context actives
      // (in 'pending' scope) are stable and are never retired by the LLM; in
      // 'all' scope every active IS a candidate, so this gate permits cleanup.
      if (!row || claimed.has(row.entityId) || !incomingIds.has(row.entityId)) {
        continue;
      }
      plan.rejections.push({
        entityId: row.entityId,
        name: row.name,
        reason: rejection.reason,
      });
      claimed.add(row.entityId);
    }
  }

  private resolveRows(
    names: string[],
    byName: Map<string, AttributeRow>,
    plan: CanonicalizationPlan,
    context: UnresolvedTerm['context'],
  ): AttributeRow[] {
    const rows: AttributeRow[] = [];
    const seen = new Set<string>();
    for (const name of names) {
      const row = this.resolveRow(name, byName, plan, context);
      if (row && !seen.has(row.entityId)) {
        rows.push(row);
        seen.add(row.entityId);
      }
    }
    return rows;
  }

  private resolveRow(
    name: string,
    byName: Map<string, AttributeRow>,
    plan: CanonicalizationPlan,
    context: UnresolvedTerm['context'],
  ): AttributeRow | undefined {
    const row = byName.get(this.normalize(name));
    if (!row) plan.unresolved.push({ name, context });
    return row;
  }

  private async fetchAttributeRows(
    type: AttributeEntityType,
  ): Promise<AttributeRow[]> {
    const rows = await this.prisma.entity.findMany({
      where: { type: type as EntityType },
      select: { entityId: true, name: true, status: true, aliases: true },
    });
    return rows.map((r) => ({
      entityId: r.entityId,
      name: r.name,
      status: String(r.status),
      aliases: r.aliases ?? [],
    }));
  }

  private logPlanSummary(plan: CanonicalizationPlan): void {
    this.logger.info('Canonicalization plan built (dry run — no mutations)', {
      type: plan.type,
      scope: plan.scope,
      candidateCount: plan.candidateCount,
      promotions: plan.promotions.length,
      merges: plan.merges.length,
      rejections: plan.rejections.length,
      unresolved: plan.unresolved.length,
    });
  }

  /**
   * Execute a canonicalization plan. The whole plan runs in ONE transaction:
   * promotions flip status, merges fold synonyms + re-point references + delete
   * the merged entity, rejections strip references + delete. With `apply: false`
   * (the default) the transaction is rolled back after running — verifying the
   * mechanics (and affected-row counts) against real data without persisting.
   *
   * The merged/rejected attribute ids live in `core_restaurant_items.food_attributes`
   * (food) or `core_entities.restaurant_attributes` (restaurant) — those are the
   * only array columns that hold an attribute id, so re-pointing is type-scoped.
   */
  async applyPlan(
    plan: CanonicalizationPlan,
    options: { apply: boolean } = { apply: false },
  ): Promise<ApplyResult> {
    this.assertPlanConsistent(plan);

    const counts: ApplyResult = {
      applied: false,
      promotions: 0,
      merges: 0,
      rejections: 0,
      refsRepointed: 0,
      refsRemoved: 0,
    };

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const promotion of plan.promotions) {
            counts.promotions += await tx.$executeRawUnsafe(
              `UPDATE core_entities SET status = 'active'
               WHERE entity_id = $1::uuid AND status = 'pending'`,
              promotion.entityId,
            );
          }

          for (const merge of plan.merges) {
            // Fold the merged entity's name + aliases onto the canonical.
            await tx.$executeRawUnsafe(
              `UPDATE core_entities y
               SET aliases = (
                 SELECT array_agg(DISTINCT a)
                 FROM unnest(y.aliases || ARRAY[x.name] || x.aliases) a
               )
               FROM core_entities x
               WHERE y.entity_id = $1::uuid AND x.entity_id = $2::uuid`,
              merge.canonicalEntityId,
              merge.mergedEntityId,
            );
            counts.refsRepointed += await this.repointMergeRefs(
              tx,
              plan.type,
              merge.mergedEntityId,
              merge.canonicalEntityId,
            );
            counts.merges += await tx.$executeRawUnsafe(
              `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
              merge.mergedEntityId,
            );
          }

          for (const rejection of plan.rejections) {
            counts.refsRemoved += await this.removeRejectRefs(
              tx,
              plan.type,
              rejection.entityId,
            );
            counts.rejections += await tx.$executeRawUnsafe(
              `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
              rejection.entityId,
            );
          }

          if (!options.apply) {
            throw new PlanRollback('verify');
          }
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
      counts.applied = true;
    } catch (error) {
      if (!(error instanceof PlanRollback)) throw error;
    }

    this.logger.info(
      counts.applied
        ? 'Canonicalization plan APPLIED'
        : 'Canonicalization plan verified (rolled back — no mutations)',
      {
        type: plan.type,
        scope: plan.scope,
        ...counts,
      },
    );
    return counts;
  }

  /**
   * Reject any plan where one entity would play two conflicting roles (e.g. a
   * canonical target that is also merged away, or merged-and-rejected). A
   * promoted entity doubling as a canonical is fine — that is the expected case.
   */
  private assertPlanConsistent(plan: CanonicalizationPlan): void {
    const merged = new Set(plan.merges.map((m) => m.mergedEntityId));
    const rejected = new Set(plan.rejections.map((r) => r.entityId));
    const canonicals = new Set(plan.merges.map((m) => m.canonicalEntityId));
    const promoted = new Set(plan.promotions.map((p) => p.entityId));

    const conflicts: string[] = [];
    for (const id of merged) {
      if (rejected.has(id)) conflicts.push(`${id}: merged and rejected`);
      if (canonicals.has(id)) conflicts.push(`${id}: merged and a canonical`);
    }
    for (const id of promoted) {
      if (merged.has(id)) conflicts.push(`${id}: promoted and merged`);
      if (rejected.has(id)) conflicts.push(`${id}: promoted and rejected`);
    }
    for (const id of canonicals) {
      if (rejected.has(id)) conflicts.push(`${id}: canonical and rejected`);
    }

    if (conflicts.length > 0) {
      throw new Error(
        `Inconsistent canonicalization plan — refusing to apply:\n${conflicts.join('\n')}`,
      );
    }
  }

  /** Re-point a merged attribute id to its canonical in the type's array column. */
  private repointMergeRefs(
    tx: Prisma.TransactionClient,
    type: AttributeEntityType,
    mergedId: string,
    canonicalId: string,
  ): Promise<number> {
    if (type === 'food_attribute') {
      return tx.$executeRawUnsafe(
        `UPDATE core_restaurant_items
         SET food_attributes = (
           SELECT array_agg(DISTINCT e)
           FROM unnest(array_replace(food_attributes, $1::uuid, $2::uuid)) e
         )
         WHERE $1::uuid = ANY(food_attributes)`,
        mergedId,
        canonicalId,
      );
    }
    return tx.$executeRawUnsafe(
      `UPDATE core_entities
       SET restaurant_attributes = (
         SELECT array_agg(DISTINCT e)
         FROM unnest(array_replace(restaurant_attributes, $1::uuid, $2::uuid)) e
       )
       WHERE $1::uuid = ANY(restaurant_attributes)`,
      mergedId,
      canonicalId,
    );
  }

  /** Strip a rejected attribute id from the type's array column. */
  private removeRejectRefs(
    tx: Prisma.TransactionClient,
    type: AttributeEntityType,
    id: string,
  ): Promise<number> {
    if (type === 'food_attribute') {
      return tx.$executeRawUnsafe(
        `UPDATE core_restaurant_items
         SET food_attributes = array_remove(food_attributes, $1::uuid)
         WHERE $1::uuid = ANY(food_attributes)`,
        id,
      );
    }
    return tx.$executeRawUnsafe(
      `UPDATE core_entities
       SET restaurant_attributes = array_remove(restaurant_attributes, $1::uuid)
       WHERE $1::uuid = ANY(restaurant_attributes)`,
      id,
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private chunk<T>(items: T[], size: number): T[][] {
    if (size <= 0) return [items];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(items.slice(i, i + size));
    }
    return out;
  }
}
