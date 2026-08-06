import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
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
      satisfies: 0,
      cousin: 0,
      reject: 0,
    };

    const concepts = await this.prisma.$queryRawUnsafe<
      Array<{ entity_id: string; name: string }>
    >(
      `SELECT entity_id::text, name
         FROM core_entities
        WHERE type = $1::entity_type AND status = 'active'
        ORDER BY created_at ASC
        LIMIT $2`,
      type,
      limit,
    );

    for (const concept of concepts) {
      summary.conceptsScanned += 1;
      const residual = await this.residualFor(concept, type, summary);
      if (!residual.length) {
        continue;
      }
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
          continue;
        }
        for (const [index, candidate] of batch.entries()) {
          const raw = (verdicts.get(index + 1) ?? '').toLowerCase();
          const relation =
            raw === 'satisfies' || raw === 'cousin' ? raw : 'reject';
          summary.residualJudged += 1;
          summary[relation] += 1;
          if (!dryRun) {
            await this.prisma.$executeRawUnsafe(
              `INSERT INTO entity_satisfies
                 (from_entity_id, to_entity_id, relation, prompt_version)
               VALUES ($1::uuid, $2::uuid, $3, $4)
               ON CONFLICT (from_entity_id, to_entity_id)
               DO UPDATE SET relation = EXCLUDED.relation,
                             prompt_version = EXCLUDED.prompt_version,
                             decided_at = CURRENT_TIMESTAMP`,
              concept.entity_id,
              candidate.entityId,
              relation,
              SATISFIES_PROMPT_VERSION,
            );
          }
        }
      }
    }

    this.logger.info('Satisfies pass complete', { ...summary, dryRun });
    return summary;
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
    const recalled = await this.entityTextSearch.retrieveCandidates(
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
            -- RUNG 2: word-boundary containment either way. Grammar (the
            -- head-final rule) already decides IS-A vs MENTIONS for these.
            (' ' || lower(c.name) || ' ') LIKE ('%' || ' ' || lower(a.name) || ' ' || '%')
            OR (' ' || lower(a.name) || ' ') LIKE ('%' || ' ' || lower(c.name) || ' ' || '%')
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
        responseSchema: RESPONSE_SCHEMA,
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
