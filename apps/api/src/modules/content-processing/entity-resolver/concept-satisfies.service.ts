import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityTextSearchService } from '../../entity-text-search/entity-text-search.service';

/**
 * THE SUBSTITUTABILITY PASS (concept-graph plan, build step 4).
 *
 * Answers ONE directed question per candidate pair: *if a user asked for A and
 * we showed them B instead, would they be satisfied?*
 *
 * IT RUNS ONLY ON THE RESIDUAL. Three cheaper mechanisms already answer that
 * question for most pairs, and the plan's precedence ladder says a lower rung
 * always wins:
 *   rung 1  exact/alias grounding      — the concept itself
 *   rung 2  head-final name containment — grammar: "three cheese PIZZA" IS-A
 *           pizza, "PIZZA dough" merely mentions it. Free, ~9ms, and 57% of
 *           9,472 containment pairs carry no category edge, so it is also the
 *           widest source of true relationships.
 *   rung 3  category edges             — mention-derived membership
 * Everything those decide is EXCLUDED here. Measured on `cheese pizza`, that
 * removes `pizza`, `cheese`, `three cheese pizza` and `four cheese pizza` for
 * free and leaves exactly the pairs geometry and grammar cannot type —
 * `margherita pizza`, `pizza bianca`, `ny style slice`.
 *
 * WHY AN LLM AT ALL: no geometric measure separates "is the same craving as"
 * from "is the parent of" from "is an ingredient in". Mutual-rank ≤ 6 on
 * `cheese pizza` admits `cheese` (an ingredient) and `cheese-based dishes`
 * (junk) while rating `birria pizza` and `chocolate chip pancakes` as tight
 * "same". That is a knowledge judgment, not a distance.
 *
 * THE FEEDER IS `retrieveCandidates`, NOT the sibling graph. Measured recall
 * against an LLM-judged gold set: RRF hybrid 95%, plain cosine 93%,
 * reciprocity 66% — and reciprocity collapses to 10% on `pho`, because dense
 * neighbourhoods dense with near-identical variants push the true variants out
 * of the mutual-rank window. Reciprocity is a PRECISION filter; feeding a judge
 * with it is using it backwards.
 *
 * REJECTS ARE STORED, so a re-run judges nothing twice and a prompt-version
 * bump becomes a diff rather than a full re-run.
 *
 * THIS IS NOT A MERGE. Two entities linked here stay two entities with their
 * own evidence. "These are one entity under two spellings" is the merge
 * pipeline's separate, destructive judgment — and its candidates are lexical
 * only, so a `satisfies` verdict on a lexically-distant pair
 * (`soup dumplings` / `xiao long bao`) is also a merge signal it cannot see.
 */

/** Bump to re-derive. Verdicts carry the version they were decided under. */
export const SATISFIES_PROMPT_VERSION = 1;

/** Candidates pulled per concept before the ladder filters them. */
const CANDIDATE_POOL = 25;

/** Pairs per LLM call. */
const PAIRS_PER_CALL = 25;

/** A category-entity this size is a bucket, not a dish (plan L4). */
const CATEGORY_MEMBER_FLOOR = 5;

export interface SatisfiesRunSummary {
  conceptsScanned: number;
  candidatesSeen: number;
  decidedByLadder: number;
  residualJudged: number;
  /** Pairs the model did not return a verdict for — left unjudged, never
   *  recorded as a reject. */
  unreturned: number;
  satisfies: number;
  cousin: number;
  reject: number;
}

interface Candidate {
  entityId: string;
  name: string;
}

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'number' },
          verdict: { type: 'string' },
        },
        required: ['n', 'verdict'],
      },
    },
  },
  required: ['items'],
};

@Injectable()
export class ConceptSatisfiesService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ConceptSatisfiesService');
  }

  async run(
    options: { limit?: number; dryRun?: boolean; type?: EntityType } = {},
  ): Promise<SatisfiesRunSummary> {
    const limit = options.limit ?? 200;
    const dryRun = options.dryRun ?? false;
    const type = options.type ?? ('food' as EntityType);
    const summary: SatisfiesRunSummary = {
      conceptsScanned: 0,
      candidatesSeen: 0,
      decidedByLadder: 0,
      residualJudged: 0,
      unreturned: 0,
      satisfies: 0,
      cousin: 0,
      reject: 0,
    };

    const concepts = await this.prisma.$queryRawUnsafe<
      Array<{ entity_id: string; name: string }>
    >(
      // THE WATERMARK IS THE RUN LEDGER (audit KL-A). The old output-row
      // watermark (NOT EXISTS a verdict) conflated "no answer needed" with
      // "not yet asked": a concept whose candidates were ALL decided free by
      // the ladder wrote zero rows, was re-selected every night, and once
      // 200 of the oldest concepts had empty residuals the pass could NEVER
      // reach concept #201 — while its counters read exactly like a healthy
      // quiet corpus. A run row is written UNCONDITIONALLY per concept,
      // whatever the outcome, so absence-of-run is the only re-offer signal.
      `SELECT e.entity_id::text, e.name
         FROM core_entities e
        WHERE e.type = $1::entity_type AND e.status = 'active'
          AND NOT EXISTS (
                SELECT 1 FROM knowledge_pass_runs r
                 WHERE r.pass = 'satisfies'
                   AND r.subject_id = e.entity_id
                   AND r.prompt_version = ${SATISFIES_PROMPT_VERSION}
              )
        ORDER BY e.created_at ASC
        LIMIT $2`,
      type,
      limit,
    );

    for (const concept of concepts) {
      summary.conceptsScanned += 1;
      const residual = await this.residualFor(concept, type, summary);
      if (!residual.length) {
        // "Nothing to judge" IS an outcome — record it or starve (KL-A).
        await this.recordRun(concept.entity_id, 'no_residual', dryRun);
        continue;
      }
      let incomplete = false;
      for (let i = 0; i < residual.length; i += PAIRS_PER_CALL) {
        const batch = residual.slice(i, i + PAIRS_PER_CALL);
        let verdicts: Map<number, string>;
        try {
          verdicts = await this.judge(concept.name, batch);
        } catch (error) {
          // A failed batch decides NOTHING — the pairs stay unjudged and the
          // watermark re-offers them. Never guess a relation.
          this.logger.warn('Satisfies batch failed (pairs left unjudged)', {
            concept: concept.name,
            size: batch.length,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          incomplete = true;
          continue;
        }
        const decided: Array<{ toId: string; relation: string }> = [];
        for (const [index, candidate] of batch.entries()) {
          const raw = verdicts.get(index + 1)?.toLowerCase();
          if (raw === undefined) {
            // A MISSING verdict is not a reject. Stored rejects are
            // load-bearing — they are what stops a pair being judged twice —
            // so writing one the model never returned would permanently
            // record a decision nobody made. Leave it unjudged; the
            // watermark re-offers it.
            summary.unreturned += 1;
            continue;
          }
          const relation =
            raw === 'satisfies' || raw === 'cousin' ? raw : 'reject';
          summary.residualJudged += 1;
          summary[relation] += 1;
          decided.push({ toId: candidate.entityId, relation });
        }
        if (!dryRun && decided.length) {
          // ONE round trip per batch, not one per verdict.
          await this.prisma.$executeRaw`
            INSERT INTO entity_satisfies
              (from_entity_id, to_entity_id, relation, prompt_version)
            VALUES ${Prisma.join(
              decided.map(
                (d) =>
                  Prisma.sql`(${concept.entity_id}::uuid, ${d.toId}::uuid, ${d.relation}, ${SATISFIES_PROMPT_VERSION})`,
              ),
            )}
            ON CONFLICT (from_entity_id, to_entity_id)
            DO UPDATE SET relation = EXCLUDED.relation,
                          prompt_version = EXCLUDED.prompt_version,
                          decided_at = CURRENT_TIMESTAMP`;
        }
      }
      // KL-A: the run row is written whatever happened. An incomplete run
      // (failed batch / unreturned verdicts) is NOT recorded as done — the
      // watermark re-offers it — but a completed judgment is, even when
      // every verdict was a reject.
      if (!incomplete) {
        await this.recordRun(concept.entity_id, 'judged', dryRun);
      }
    }

    this.logger.info('Satisfies pass complete', { ...summary, dryRun });
    return summary;
  }

  /** One unconditional run row per (pass, subject, version) — the ledger the
   *  watermark reads. Idempotent; a re-run of a recorded subject no-ops. */
  private async recordRun(
    subjectId: string,
    outcome: string,
    dryRun: boolean,
  ): Promise<void> {
    if (dryRun) return;
    await this.prisma.$executeRaw`
      INSERT INTO knowledge_pass_runs (pass, subject_id, prompt_version, outcome)
      VALUES ('satisfies', ${subjectId}::uuid, ${SATISFIES_PROMPT_VERSION}, ${outcome})
      ON CONFLICT (pass, subject_id, prompt_version) DO NOTHING`;
  }

  /**
   * Candidates for one concept, minus everything the ladder's cheaper rungs
   * already decide and everything already judged at this prompt version.
   */
  private async residualFor(
    concept: { entity_id: string; name: string },
    type: EntityType,
    summary: SatisfiesRunSummary,
  ): Promise<Candidate[]> {
    // THE FEEDER: the nightly sibling table, NOT a live embedding call.
    //
    // `derived_entity_sibling_edges` already persists every active food's top
    // dense neighbours (cosine >= 0.7, rebuilt nightly). Calling
    // retrieveCandidates here instead spends ONE EMBEDDING CALL PER CONCEPT to
    // recompute a table we already maintain — 5,815 vendor round trips to
    // re-derive nightly work.
    //
    // The recall cost is 2 points (plain cosine 93% vs RRF hybrid 95%,
    // measured), and it is even smaller in practice than that: the missing
    // 2 points are LEXICAL matches, and rung 2's name containment already
    // removes lexically-related pairs from the residual before the judge sees
    // it. What is left for the judge is precisely the semantically-close /
    // lexically-distant pairs, which is what dense is good at.
    //
    // `forward_rank` only — mutual_rank is a PRECISION filter and would drop a
    // third of true matches (66% recall, 10% on `pho`).
    const edges = await this.prisma.$queryRaw<
      Array<{ entityId: string; name: string }>
    >(Prisma.sql`
        SELECT b.entity_id::text AS "entityId", b.name
          FROM derived_entity_sibling_edges e
          JOIN core_entities b ON b.entity_id = e.sibling_entity_id
         WHERE e.anchor_entity_id = ${concept.entity_id}::uuid
           AND e.forward_rank <= ${CANDIDATE_POOL}
           AND b.status = 'active'::entity_status
           AND b.type = ${type}::entity_type
      `);
    // FALLBACK for concepts the nightly builder has not reached (minted since
    // the last rebuild, or a type it does not cover). Rare by construction, so
    // the embedding call is paid only where the free path has nothing.
    const recalled = edges.length
      ? edges
      : await this.entityTextSearch.retrieveCandidates(
          concept.name,
          [type],
          CANDIDATE_POOL,
          { denseMode: 'always' },
        );
    const candidates: Candidate[] = recalled
      .filter((row) => row.entityId !== concept.entity_id)
      .map((row) => ({ entityId: row.entityId, name: row.name }));
    if (!candidates.length) {
      return [];
    }
    summary.candidatesSeen += candidates.length;

    const ids = candidates.map((candidate) => candidate.entityId);
    const excluded = await this.prisma.$queryRawUnsafe<
      Array<{ entity_id: string }>
    >(
      `SELECT c.entity_id::text
         FROM core_entities c, core_entities a
        WHERE a.entity_id = $1::uuid
          AND c.entity_id = ANY($2::uuid[])
          AND (
            -- RUNG 2 (KL-D): read from the ONE materialized containment
            -- table — the same folded-key definition query-time admission
            -- uses. This SQL used to re-derive containment with its own
            -- LIKE over identity_key while the query side used lower(name):
            -- two definitions of one rung, and the divergence class §2
            -- exists to prevent.
            EXISTS (
              SELECT 1 FROM derived_name_containment_edges n
               WHERE (n.base_id = a.entity_id AND n.variant_id = c.entity_id)
                  OR (n.base_id = c.entity_id AND n.variant_id = a.entity_id)
            )
            -- RUNG 3: a stored category claim in either direction.
            OR EXISTS (
                 SELECT 1 FROM derived_food_category_edges e
                  WHERE (e.food_id = c.entity_id AND e.category_id = a.entity_id)
                     OR (e.food_id = a.entity_id AND e.category_id = c.entity_id)
               )
            -- L4: a category-entity is a bucket, never a substitute.
            OR (SELECT count(*) FROM derived_food_category_edges e2
                 WHERE e2.category_id = c.entity_id) >= ${CATEGORY_MEMBER_FLOOR}
            -- Already decided at this prompt version.
            OR EXISTS (
                 SELECT 1 FROM entity_satisfies s
                  WHERE s.from_entity_id = a.entity_id
                    AND s.to_entity_id = c.entity_id
                    AND s.prompt_version = ${SATISFIES_PROMPT_VERSION}
               )
          )`,
      concept.entity_id,
      ids,
    );
    const skip = new Set(excluded.map((row) => row.entity_id));
    summary.decidedByLadder += skip.size;
    return candidates.filter((candidate) => !skip.has(candidate.entityId));
  }

  private async judge(
    anchorName: string,
    batch: readonly Candidate[],
  ): Promise<Map<number, string>> {
    const text = await this.llm.generateForCaller({
      caller: 'concepts.satisfies',
      prompt: buildSatisfiesPrompt(anchorName, batch),
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        // responseJsonSchema (NOT responseSchema): the latter is Gemini's
        // TYPED Schema field and expects OBJECT/STRING, so a raw JSON Schema
        // handed to it is ignored — the enforcement this comment claims would
        // not have existed. Every other caller in the repo uses this field or
        // converts explicitly.
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return new Map();
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{ n?: number; verdict?: string }>;
    };
    return new Map(
      (parsed.items ?? [])
        .filter((item) => typeof item.n === 'number' && item.verdict)
        .map((item) => [item.n as number, item.verdict as string]),
    );
  }
}

/**
 * THE SUBSTITUTABILITY PROMPT. Directed, and strict on `satisfies` only where
 * strictness is cheap: a miss costs recall (recoverable), while a wrong
 * `satisfies` puts the wrong food in the FRONT section where the Crave Score
 * can rank it first.
 */
export function buildSatisfiesPrompt(
  anchorName: string,
  batch: readonly Candidate[],
): string {
  return [
    `A user searched for "${anchorName}" in a restaurant app.`,
    `For EACH numbered candidate below, answer this DIRECTED question:`,
    `if the user asked for "${anchorName}" and we showed them that candidate`,
    `instead, would they be satisfied?`,
    ``,
    `Answer with exactly one verdict per candidate:`,
    `- "satisfies" — yes. The same thing, a variant of it, or another name for it.`,
    `- "cousin" — no, but it is a reasonable "similar" suggestion: same family,`,
    `  different craving (a swapped protein, a changed form, a different flavour`,
    `  direction).`,
    `- "reject" — not a substitute at all: an INGREDIENT or component of it, a`,
    `  BROAD CATEGORY that merely contains it, or unrelated.`,
    ``,
    `Answer for THIS direction only — do not assume the reverse also holds.`,
    `A swapped protein or a changed form (pizza vs ramen vs pancake) is a`,
    `cousin, never "satisfies".`,
    `Cover every input number exactly once.`,
    ``,
    `Candidates:`,
    ...batch.map((candidate, index) => `${index + 1}. ${candidate.name}`),
  ].join('\n');
}
