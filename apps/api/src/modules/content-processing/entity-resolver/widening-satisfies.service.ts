import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { fetchAttributeCarriers } from '../../attribute-ontology/attribute-ontology.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  CONCEPT_SATISFIES_LANE,
  conceptSatisfiesLane,
} from './concept-satisfies-lane';
import type { SatisfiesVerdictSubject } from './concept-satisfies.service';
import {
  ATTRIBUTE_SATISFIES_PROMPT_VERSION,
  ATTRIBUTE_SATISFIES_RULE_FINGERPRINT,
  buildAttributeSatisfiesPrompt,
  buildIngredientSatisfiesPrompt,
  INGREDIENT_SATISFIES_PROMPT_VERSION,
  INGREDIENT_SATISFIES_RULE_FINGERPRINT,
  type WideningPairContext,
} from './widening-satisfies-rule';

/**
 * THE WIDENING COURT (owner ruling 2026-08-30): satisfies hearings for
 * ATTRIBUTES and INGREDIENTS — the kinds the merge court deliberately keeps
 * separate (same-claim identity only) and search must still union for the
 * broad searcher. Dishes already have their court (ConceptSatisfiesService);
 * restaurants are excluded by the same ruling (places are identities).
 *
 * DOCKET-DRIVEN, NEVER A CRON. The item court scans the corpus nightly; this
 * one hears exactly the pairs a governed runner hands it — the owner's kept
 * pairs from the sameness court, embedding-nominated neighbors, and nothing
 * else. Every pair is heard PER DIRECTION (two claims: A→B and B→A), because
 * the searcher-tolerance answer is not symmetric ("live music"→piano bar is
 * not the "piano bar"→live music question).
 *
 * SAME LANE, SAME EFFECT TABLE as the item court: one claim definition (a
 * directed id pair in `concept_satisfies`), one read projection
 * (`entity_satisfies`), per-kind rule versions from the shared number space
 * (widening-satisfies-rule.ts explains why versions 2 and 3).
 */

export type WideningKind = 'attribute' | 'ingredient';

export interface WideningDirectedCase {
  fromId: string;
  toId: string;
}

export interface WideningHearingRow {
  kind: WideningKind;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  verdict: 'satisfies' | 'reject' | 'unreturned' | 'skipped';
  reason: string;
}

export interface WideningHearingSummary {
  heard: number;
  satisfies: number;
  reject: number;
  unreturned: number;
  skipped: number;
  rows: WideningHearingRow[];
}

/** Per-direction cases per LLM call — small, the docket is small. */
const CASES_PER_CALL = 20;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'number' },
          verdict: { type: 'string', enum: ['satisfies', 'reject'] },
          reason: {
            type: 'string',
            description:
              'One clause grounding the verdict in what the searcher/eater would experience — never the bare verdict word restated.',
          },
        },
        required: ['n', 'verdict', 'reason'],
      },
    },
  },
  required: ['items'],
};

interface EntityRow {
  entity_id: string;
  name: string;
  type: string;
  status: string;
}

@Injectable()
export class WideningSatisfiesService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly ledger: ClaimVerdictLedgerService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('WideningSatisfiesService');
  }

  /**
   * Hear a docket of DIRECTED cases. Dry-run (the default posture — the
   * runner's --apply is the only caller that turns it off) judges and
   * returns every verdict but writes NOTHING: no ledger row, no edge, so the
   * owner reviews verdicts before any of them binds search.
   *
   * Idempotent under apply: cases already decided at the current per-kind
   * rule version are skipped (the ledger is the memory; a re-run judges
   * nothing twice). Both sides of a case must be live entities of one
   * widening kind; anything else is reported 'skipped', never guessed at.
   */
  async hearDocket(
    cases: readonly WideningDirectedCase[],
    options: { dryRun?: boolean } = {},
  ): Promise<WideningHearingSummary> {
    const dryRun = options.dryRun ?? true;
    const summary: WideningHearingSummary = {
      heard: 0,
      satisfies: 0,
      reject: 0,
      unreturned: 0,
      skipped: 0,
      rows: [],
    };
    if (!cases.length) return summary;

    const ids = Array.from(
      new Set(cases.flatMap((c) => [c.fromId, c.toId])),
    ).filter(Boolean);
    const entities = await this.prisma.$queryRaw<EntityRow[]>(Prisma.sql`
      SELECT entity_id::text, name, type::text, status::text
        FROM core_entities
       WHERE entity_id = ANY(${ids}::uuid[])`);
    const byId = new Map(entities.map((row) => [row.entity_id, row]));

    const kindOf = (row: EntityRow | undefined): WideningKind | null => {
      if (!row || row.status !== 'active') return null;
      if (row.type === 'place_attribute' || row.type === 'item_attribute') {
        return 'attribute';
      }
      if (row.type === 'ingredient') return 'ingredient';
      return null;
    };

    const admissible: Array<{
      kind: WideningKind;
      fromRow: EntityRow;
      toRow: EntityRow;
    }> = [];
    for (const c of cases) {
      const fromRow = byId.get(c.fromId);
      const toRow = byId.get(c.toId);
      const fromKind = kindOf(fromRow);
      const toKind = kindOf(toRow);
      if (!fromRow || !toRow || !fromKind || fromKind !== toKind) {
        // A missing/archived/mismatched side is a fact about the docket, not
        // a hearing — report it and move on (the brief's "skip gracefully").
        summary.skipped += 1;
        summary.rows.push({
          kind: fromKind ?? toKind ?? 'attribute',
          fromId: c.fromId,
          fromName: fromRow?.name ?? '(missing)',
          toId: c.toId,
          toName: toRow?.name ?? '(missing)',
          verdict: 'skipped',
          reason:
            !fromRow || !toRow
              ? 'a side of the pair does not exist'
              : fromRow.status !== 'active' || toRow.status !== 'active'
                ? 'a side of the pair is not active'
                : 'the sides are not one widening kind',
        });
        continue;
      }
      if (fromRow.entity_id === toRow.entity_id) {
        summary.skipped += 1;
        summary.rows.push({
          kind: fromKind,
          fromId: c.fromId,
          fromName: fromRow.name,
          toId: c.toId,
          toName: toRow.name,
          verdict: 'skipped',
          reason: 'both sides resolve to one entity (already merged)',
        });
        continue;
      }
      admissible.push({ kind: fromKind, fromRow, toRow });
    }

    for (const kind of ['attribute', 'ingredient'] as const) {
      const docket = admissible.filter((entry) => entry.kind === kind);
      if (!docket.length) continue;
      const ruleVersion =
        kind === 'attribute'
          ? ATTRIBUTE_SATISFIES_PROMPT_VERSION
          : INGREDIENT_SATISFIES_PROMPT_VERSION;
      // THE LEDGER IS THE MEMORY: anything already decided at this rule
      // version is not re-bought, even before its effect landed.
      const decided = await this.ledger.decidedKeys(
        CONCEPT_SATISFIES_LANE,
        ruleVersion,
        conceptSatisfiesLane.keyFoldVersion,
        docket.map((entry) =>
          conceptSatisfiesLane.canonicalClaimKey({
            fromEntityId: entry.fromRow.entity_id,
            toEntityId: entry.toRow.entity_id,
          }),
        ),
      );
      const due = docket.filter(
        (entry) =>
          !decided.has(
            conceptSatisfiesLane.canonicalClaimKey({
              fromEntityId: entry.fromRow.entity_id,
              toEntityId: entry.toRow.entity_id,
            }),
          ),
      );
      for (const entry of docket) {
        if (!due.includes(entry)) {
          summary.skipped += 1;
          summary.rows.push({
            kind,
            fromId: entry.fromRow.entity_id,
            fromName: entry.fromRow.name,
            toId: entry.toRow.entity_id,
            toName: entry.toRow.name,
            verdict: 'skipped',
            reason: `already decided at rule v${ruleVersion}`,
          });
        }
      }
      if (!due.length) continue;

      const carriers = await this.carriersFor(
        kind,
        due.flatMap((entry) => [entry.fromRow, entry.toRow]),
      );
      for (let i = 0; i < due.length; i += CASES_PER_CALL) {
        const batch = due.slice(i, i + CASES_PER_CALL);
        const contexts: WideningPairContext[] = batch.map((entry) => ({
          fromName: entry.fromRow.name,
          toName: entry.toRow.name,
          fromCarriers: carriers.get(entry.fromRow.entity_id) ?? [],
          toCarriers: carriers.get(entry.toRow.entity_id) ?? [],
        }));
        const verdicts = await this.judge(kind, contexts);
        const settled: Array<{
          subject: SatisfiesVerdictSubject;
          reason: string;
        }> = [];
        for (const [index, entry] of batch.entries()) {
          const answer = verdicts.get(index + 1);
          const row: WideningHearingRow = {
            kind,
            fromId: entry.fromRow.entity_id,
            fromName: entry.fromRow.name,
            toId: entry.toRow.entity_id,
            toName: entry.toRow.name,
            verdict: 'unreturned',
            reason: '',
          };
          if (!answer) {
            // A missing verdict is never a reject (the item court's law):
            // the case stays unjudged and a later run re-offers it.
            summary.unreturned += 1;
            summary.rows.push(row);
            continue;
          }
          row.verdict = answer.verdict;
          row.reason = answer.reason;
          summary.heard += 1;
          summary[answer.verdict] += 1;
          summary.rows.push(row);
          settled.push({
            subject: {
              fromEntityId: entry.fromRow.entity_id,
              toEntityId: entry.toRow.entity_id,
              relation: answer.verdict,
              promptVersion: ruleVersion,
            },
            reason: answer.reason,
          });
        }
        if (!dryRun && settled.length) {
          await this.settle(kind, settled);
        }
      }
    }

    this.logger.info('Widening docket heard', {
      dryRun,
      heard: summary.heard,
      satisfies: summary.satisfies,
      reject: summary.reject,
      unreturned: summary.unreturned,
      skipped: summary.skipped,
    });
    return summary;
  }

  /**
   * APPLY NEVER RE-JUDGES (acceptance red team 2026-08-30, docket
   * determinism): temperature-0 verdicts drift run-to-run on exactly the
   * marginal pairs the owner reviews, so an apply that re-heard the docket
   * would write a DIFFERENT table than the one he signed off. This settles
   * the REVIEWED verdict table itself — the dry-run's JSON output, unedited
   * or owner-edited — writing exactly what was approved, no LLM call at all.
   * `tableSha256` (the hash of the reviewed file) rides on every ledger
   * row's subject, so each verdict names the table that authorized it.
   *
   * Skipped rows (already decided at the current rule version, a side no
   * longer active, or a non-verdict row like 'skipped'/'unreturned') are
   * counted, never guessed at.
   */
  async settleReviewedVerdicts(
    rows: ReadonlyArray<WideningHearingRow>,
    tableSha256: string,
  ): Promise<{ settled: number; skippedDecided: number; skippedGone: number }> {
    const result = { settled: 0, skippedDecided: 0, skippedGone: 0 };
    const verdictRows = rows.filter(
      (row) => row.verdict === 'satisfies' || row.verdict === 'reject',
    );
    if (!verdictRows.length) return result;

    const ids = Array.from(
      new Set(verdictRows.flatMap((row) => [row.fromId, row.toId])),
    );
    const live = await this.prisma.$queryRaw<Array<{ entity_id: string }>>(
      Prisma.sql`SELECT entity_id::text FROM core_entities
                  WHERE entity_id = ANY(${ids}::uuid[])
                    AND status = 'active'`,
    );
    const liveIds = new Set(live.map((row) => row.entity_id));

    for (const kind of ['attribute', 'ingredient'] as const) {
      const docket = verdictRows.filter((row) => row.kind === kind);
      if (!docket.length) continue;
      const ruleVersion =
        kind === 'attribute'
          ? ATTRIBUTE_SATISFIES_PROMPT_VERSION
          : INGREDIENT_SATISFIES_PROMPT_VERSION;
      const decided = await this.ledger.decidedKeys(
        CONCEPT_SATISFIES_LANE,
        ruleVersion,
        conceptSatisfiesLane.keyFoldVersion,
        docket.map((row) =>
          conceptSatisfiesLane.canonicalClaimKey({
            fromEntityId: row.fromId,
            toEntityId: row.toId,
          }),
        ),
      );
      const settled: Array<{
        subject: SatisfiesVerdictSubject;
        reason: string;
      }> = [];
      for (const row of docket) {
        if (!liveIds.has(row.fromId) || !liveIds.has(row.toId)) {
          result.skippedGone += 1;
          continue;
        }
        const key = conceptSatisfiesLane.canonicalClaimKey({
          fromEntityId: row.fromId,
          toEntityId: row.toId,
        });
        if (decided.has(key)) {
          result.skippedDecided += 1;
          continue;
        }
        settled.push({
          subject: {
            fromEntityId: row.fromId,
            toEntityId: row.toId,
            relation: row.verdict,
            promptVersion: ruleVersion,
            reviewedTableSha256: tableSha256,
          } as SatisfiesVerdictSubject,
          reason: row.reason,
        });
      }
      if (settled.length) {
        await this.settle(kind, settled);
        result.settled += settled.length;
      }
    }
    this.logger.info('Reviewed widening verdicts settled', {
      tableSha256,
      ...result,
    });
    return result;
  }

  /** Verdict before effect (H5 amendment (c)) — the item court's settle
   *  shape: ledger row with the full subject, then the one effect writer,
   *  then executed marks. */
  private async settle(
    kind: WideningKind,
    settled: ReadonlyArray<{
      subject: SatisfiesVerdictSubject;
      reason: string;
    }>,
  ): Promise<void> {
    const fingerprint =
      kind === 'attribute'
        ? ATTRIBUTE_SATISFIES_RULE_FINGERPRINT
        : INGREDIENT_SATISFIES_RULE_FINGERPRINT;
    for (const entry of settled) {
      await this.ledger.record<SatisfiesVerdictSubject>({
        lane: CONCEPT_SATISFIES_LANE,
        claimKey: conceptSatisfiesLane.canonicalClaimKey(entry.subject),
        ruleVersion: entry.subject.promptVersion,
        foldVersion: conceptSatisfiesLane.keyFoldVersion,
        outcome: entry.subject.relation,
        reason: entry.reason,
        ruleFingerprint: fingerprint,
        subject: entry.subject,
      });
    }
    await this.applyEffect(settled.map((entry) => entry.subject));
    for (const entry of settled) {
      await this.ledger.markExecuted(
        CONCEPT_SATISFIES_LANE,
        conceptSatisfiesLane.canonicalClaimKey(entry.subject),
        entry.subject.promptVersion,
        conceptSatisfiesLane.keyFoldVersion,
      );
    }
  }

  /** The same idempotent `entity_satisfies` upsert the item court writes —
   *  the one read projection every consumer keeps reading. */
  protected async applyEffect(
    subjects: readonly SatisfiesVerdictSubject[],
  ): Promise<void> {
    if (!subjects.length) return;
    await this.prisma.$executeRaw`
      INSERT INTO entity_satisfies
        (from_entity_id, to_entity_id, relation, prompt_version)
      VALUES ${Prisma.join(
        subjects.map(
          (s) =>
            Prisma.sql`(${s.fromEntityId}::uuid, ${s.toEntityId}::uuid, ${s.relation}, ${s.promptVersion})`,
        ),
      )}
      ON CONFLICT (from_entity_id, to_entity_id)
      DO UPDATE SET relation = EXCLUDED.relation,
                    prompt_version = EXCLUDED.prompt_version,
                    decided_at = CURRENT_TIMESTAMP`;
  }

  /**
   * D2 CONTEXT (the sameness court's standard): every side of every case
   * carries up to 3 REAL carriers so the judge sees usage, not just the
   * word. Attributes reuse the two benches' shared `fetchAttributeCarriers`
   * (places carrying a place_attribute; dishes carrying an item_attribute);
   * ingredients get the dishes whose synthesized canon or evidence contains
   * them.
   */
  private async carriersFor(
    kind: WideningKind,
    rows: readonly EntityRow[],
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    try {
      if (kind === 'attribute') {
        const placeIds = rows
          .filter((row) => row.type === 'place_attribute')
          .map((row) => row.entity_id);
        const itemIds = rows
          .filter((row) => row.type === 'item_attribute')
          .map((row) => row.entity_id);
        const [placeCarriers, itemCarriers] = await Promise.all([
          fetchAttributeCarriers(this.prisma, 'place_attribute', placeIds),
          fetchAttributeCarriers(this.prisma, 'item_attribute', itemIds),
        ]);
        for (const [id, names] of placeCarriers) out.set(id, names);
        for (const [id, names] of itemCarriers) out.set(id, names);
        return out;
      }
      const ids = rows.map((row) => row.entity_id);
      const carried = await this.prisma.$queryRaw<
        Array<{ ingredient_id: string; carriers: string[] }>
      >(Prisma.sql`
        SELECT x.ingredient_id::text,
               (array_agg(DISTINCT x.name))[1:3] AS carriers
          FROM (
            SELECT unnest(f.canonical_ingredients) AS ingredient_id, f.name
              FROM core_entities f
             WHERE f.type = 'item' AND f.status = 'active'
            UNION ALL
            SELECT unnest(c.ingredients) AS ingredient_id, f.name
              FROM core_restaurant_items c
              JOIN core_entities f ON f.entity_id = c.food_id
          ) x
         WHERE x.ingredient_id = ANY(${ids}::uuid[])
         GROUP BY x.ingredient_id`);
      for (const row of carried) out.set(row.ingredient_id, row.carriers ?? []);
      return out;
    } catch (error) {
      // Context enriches; its absence must never block a hearing.
      this.logger.warn('Widening carrier read failed (hearing bare)', {
        kind,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return out;
    }
  }

  /** Public for the gold harness (scripts/widening-docket.ts --gold): rule
   *  certification judges synthetic contexts through the SAME transport and
   *  parse, with no ids and no writes. */
  async judge(
    kind: WideningKind,
    contexts: readonly WideningPairContext[],
  ): Promise<Map<number, { verdict: 'satisfies' | 'reject'; reason: string }>> {
    const prompt =
      kind === 'attribute'
        ? buildAttributeSatisfiesPrompt(contexts)
        : buildIngredientSatisfiesPrompt(contexts);
    const text = await this.llm.generateForCaller({
      caller: 'concepts.widening_satisfies',
      prompt,
      generationConfig: {
        // Zero, the classification-lane law (see the item court): a fixed
        // docket into two verdicts gains nothing from sampling variety, and
        // verdicts persist per rule version.
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return new Map();
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{ n?: number; verdict?: string; reason?: string }>;
    };
    const out = new Map<
      number,
      { verdict: 'satisfies' | 'reject'; reason: string }
    >();
    for (const item of parsed.items ?? []) {
      if (typeof item.n !== 'number') continue;
      const verdict = item.verdict === 'satisfies' ? 'satisfies' : 'reject';
      const reason = (item.reason ?? '').trim();
      // Schema-forced evidence reasons (the sameness court's law): a
      // degenerate reason — empty or the bare verdict word — is not a
      // ground. The verdict is left unreturned rather than laundered.
      if (!reason || reason.toLowerCase() === verdict) continue;
      out.set(item.n, { verdict, reason });
    }
    return out;
  }
}
