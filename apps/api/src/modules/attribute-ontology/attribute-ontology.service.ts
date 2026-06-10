import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
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

const DEFAULT_CHUNK_SIZE = 120;

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
    const chunks = this.chunk(incomingNames, chunkSize);

    for (const [chunkIndex, incoming] of chunks.entries()) {
      const result = await this.llmService.adjudicateAttributes({
        existing: Array.from(existingNames),
        incoming,
      });

      this.foldResultIntoPlan(result, byName, existingNames, plan);

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
    plan: CanonicalizationPlan,
  ): void {
    const seen = new Set<string>(); // entityIds already accounted for this run

    for (const group of result.groups) {
      const memberRows = this.resolveRows(
        group.members,
        byName,
        plan,
        'group_member',
      );
      if (memberRows.length === 0) continue;

      // Pick the surviving entity: an entity matching the canonical name wins;
      // otherwise an already-active member; otherwise the first member.
      const canonNorm = this.normalize(group.canonical);
      const target =
        memberRows.find((r) => this.normalize(r.name) === canonNorm) ??
        memberRows.find((r) => r.status === 'active') ??
        memberRows[0];

      const aliasNames = memberRows
        .filter((r) => r.entityId !== target.entityId)
        .map((r) => r.name);

      // A pending target with no active anchor in its group is a NEW canonical.
      if (target.status === 'pending' && !seen.has(target.entityId)) {
        plan.promotions.push({
          entityId: target.entityId,
          name: target.name,
          aliases: aliasNames,
        });
        seen.add(target.entityId);
      }

      for (const member of memberRows) {
        if (member.entityId === target.entityId) continue;
        if (seen.has(member.entityId)) continue;
        plan.merges.push({
          canonicalEntityId: target.entityId,
          canonicalName: target.name,
          mergedEntityId: member.entityId,
          mergedName: member.name,
        });
        seen.add(member.entityId);
      }

      // The surviving canonical name is now available as context for later chunks.
      existingNames.add(target.name);
    }

    for (const rejection of result.rejected) {
      const row = this.resolveRow(rejection.term, byName, plan, 'rejected');
      if (!row || seen.has(row.entityId)) continue;
      plan.rejections.push({
        entityId: row.entityId,
        name: row.name,
        reason: rejection.reason,
      });
      seen.add(row.entityId);
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
