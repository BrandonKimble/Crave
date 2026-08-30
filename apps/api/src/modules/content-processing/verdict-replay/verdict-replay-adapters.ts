import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { ENTITY_MATCH_LANE } from '../entity-resolver/entity-match-lane';
import { ENTITY_DEDUPE_LANE } from '../entity-resolver/entity-dedupe-lane.adapter';
import { CONCEPT_SATISFIES_LANE } from '../entity-resolver/concept-satisfies-lane';
import {
  WORD_GENERICNESS_LANE,
  WORD_GENERICNESS_RULE_VERSION,
  WORD_NEGATION_LANE,
  WORD_NEGATION_RULE_VERSION,
  WORD_ROLE_LANE,
  WORD_ROLE_RULE_VERSION,
} from '../entity-resolver/word-vocabulary-lanes';
import { WordVocabularyJudgeService } from '../entity-resolver/word-vocabulary-judge.service';
import { ATTRIBUTE_MERGE_LANE } from '../../attribute-ontology/attribute-merge-lane.adapter';
import {
  fetchAttributeCarriers,
  type AttributeEntityType,
} from '../../attribute-ontology/attribute-ontology.service';
import {
  ReplayRowResult,
  StoredVerdictRow,
  VerdictReplayAdapter,
  VerdictReplayRegistry,
} from './verdict-replay.types';

/**
 * PER-LANE REPLAY ADAPTERS — each one answers the question only its lane
 * can: how to rebuild a hearing from the stored claim key + subject and
 * re-ask it under the current rule. All of them are compare-only; none can
 * reach `ClaimVerdictLedgerService.record`.
 *
 * PLACEMENT NOTE (2026-08-30): the bench-prober law says adapters live
 * WITH their lanes. These live here instead because every lane service
 * file (food-dedupe-merge, attribute-dedupe-merge, concept-satisfies,
 * entity-resolution) is owned by in-flight agents this week; co-locating
 * them is a mechanical follow-up move once those files are free. The word
 * lanes DO follow the law — their re-judge logic stays in
 * WordVocabularyJudgeService.replayClaims and the adapter here is a thin
 * shim.
 *
 * HONEST RECONSTRUCTION LIMITS, per lane, stated where they bite:
 *   - entity_match: the live hearing carried the verbatim mention and
 *     thread restaurant (D2 context); those are NOT in the stored subject,
 *     so the replay runs with term + current candidate evidence only. A
 *     flip may therefore mean "context was doing the work", which is
 *     itself signal (the ablation study's finding) — the report says so.
 *   - entity_dedupe / attribute_merge: home restaurants / carriers are
 *     re-derived from TODAY's corpus, exactly as a live re-hearing would.
 *   - any entity merged away or archived since the verdict: unreplayable,
 *     counted with its note.
 */

interface EntityMatchSubject {
  kind: 'place' | 'item' | 'ingredient';
  term: string;
  candidateEntityId: string;
  candidateName?: string;
}

interface DedupePairSubject {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
}

interface AttributeMergeSubject extends DedupePairSubject {
  type: AttributeEntityType;
}

interface SatisfiesSubject {
  fromEntityId: string;
  toEntityId: string;
}

interface Deps {
  prisma: PrismaService;
  llm: LLMService;
  wordJudge: WordVocabularyJudgeService;
}

/**
 * RULE MODULES ARE LOADED LAZILY, ON PURPOSE: each rule file resolves its
 * version from a fingerprint against a release ledger AT IMPORT TIME and
 * THROWS while its prompt text is mid-edit and unversioned. That refusal
 * is correct for the lane; it must not take the whole harness down for
 * every OTHER lane while one prompt is being iterated. So each adapter
 * resolves its version only when its own lane is actually replayed.
 */
const entityDedupeRuleVersion = (): number => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rule = require('../entity-resolver/entity-dedupe-rule') as {
    ENTITY_DEDUPE_RULE_VERSION: number;
  };
  return rule.ENTITY_DEDUPE_RULE_VERSION;
};

const satisfiesRule = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../entity-resolver/concept-satisfies-rule') as {
    SATISFIES_PROMPT_VERSION: number;
    buildSatisfiesPrompt: (
      anchorName: string,
      batch: ReadonlyArray<{ entityId: string; name: string }>,
    ) => string;
  };

const unreplayable = (
  row: StoredVerdictRow,
  note: string,
): ReplayRowResult => ({
  claimKey: row.claimKey,
  storedOutcome: row.outcome,
  storedReason: row.reason,
  storedRuleVersion: row.ruleVersion,
  status: 'unreplayable',
  note,
});

const compared = (
  row: StoredVerdictRow,
  newOutcome: string,
  newReason?: string,
): ReplayRowResult => ({
  claimKey: row.claimKey,
  storedOutcome: row.outcome,
  storedReason: row.reason,
  storedRuleVersion: row.ruleVersion,
  status: newOutcome === row.outcome ? 'unchanged' : 'flipped',
  newOutcome,
  newReason,
});

async function activeEntities(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<Map<string, { name: string; type: string }>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<
    Array<{ entity_id: string; name: string; type: string }>
  >(Prisma.sql`
    SELECT entity_id::text, name, type::text FROM core_entities
     WHERE entity_id = ANY(${[...new Set(ids)]}::uuid[])
       AND status = 'active'`);
  return new Map(rows.map((r) => [r.entity_id, r]));
}

/** Home restaurants for food/ingredient entities — the same evidence the
 *  live dedupe hearing reads (food-dedupe-merge D2 context). */
async function foodHomes(
  prisma: PrismaService,
  ids: readonly string[],
  kind: 'item' | 'ingredient',
): Promise<Map<string, { placeIds: string[]; homes: string[] }>> {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const rows =
    kind === 'ingredient'
      ? await prisma.$queryRaw<
          Array<{ food_id: string; place_ids: string[]; homes: string[] }>
        >(Prisma.sql`
      SELECT x.ingredient_id::text AS food_id,
             array_agg(c.restaurant_id::text ORDER BY c.mention_count DESC)
               AS place_ids,
             (array_agg(r.name ORDER BY c.mention_count DESC))[1:3] AS homes
        FROM core_restaurant_items c
        JOIN LATERAL unnest(c.ingredients) AS x(ingredient_id) ON true
        JOIN core_entities r ON r.entity_id = c.restaurant_id
       WHERE x.ingredient_id = ANY(${unique}::uuid[])
       GROUP BY x.ingredient_id`)
      : await prisma.$queryRaw<
          Array<{ food_id: string; place_ids: string[]; homes: string[] }>
        >(Prisma.sql`
      SELECT c.food_id::text,
             array_agg(c.restaurant_id::text ORDER BY c.mention_count DESC)
               AS place_ids,
             (array_agg(r.name ORDER BY c.mention_count DESC))[1:3] AS homes
        FROM core_restaurant_items c
        JOIN core_entities r ON r.entity_id = c.restaurant_id
       WHERE c.food_id = ANY(${unique}::uuid[])
       GROUP BY c.food_id`);
  return new Map(
    rows.map((r) => [
      r.food_id,
      { placeIds: r.place_ids ?? [], homes: r.homes ?? [] },
    ]),
  );
}

class EntityMatchReplayAdapter implements VerdictReplayAdapter {
  readonly lane = ENTITY_MATCH_LANE;
  constructor(private readonly deps: Deps) {}

  // The entity-match judge shares the dedupe lane's rule (both render
  // entity-match-prompt.md — the live record site says so in as many
  // words), so its current version is that rule's.
  currentRuleVersion(): number {
    return entityDedupeRuleVersion();
  }

  async rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]> {
    const subjects = rows.map((row) => row.subject as EntityMatchSubject);
    const entities = await activeEntities(
      this.deps.prisma,
      subjects.map((s) => s.candidateEntityId),
    );
    const results: ReplayRowResult[] = [];
    const replayable: Array<{ row: StoredVerdictRow; s: EntityMatchSubject }> =
      [];
    for (let i = 0; i < rows.length; i += 1) {
      const s = subjects[i];
      if (!s?.term || !s.candidateEntityId || !s.kind) {
        results.push(unreplayable(rows[i], 'subject-missing-inputs'));
      } else if (!entities.has(s.candidateEntityId)) {
        results.push(unreplayable(rows[i], 'candidate-entity-gone'));
      } else {
        replayable.push({ row: rows[i], s });
      }
    }
    for (const kind of ['place', 'item', 'ingredient'] as const) {
      const slice = replayable.filter((r) => r.s.kind === kind);
      for (let i = 0; i < slice.length; i += 10) {
        const batch = slice.slice(i, i + 10);
        const verdicts = await this.deps.llm.matchEntitiesBatch({
          kind,
          items: batch.map(({ s }) => ({
            term: s.term,
            candidates: [
              {
                id: 0,
                name:
                  entities.get(s.candidateEntityId)?.name ??
                  s.candidateName ??
                  '',
              },
            ],
          })),
        });
        batch.forEach(({ row }, j) => {
          const v = verdicts[j];
          if (!v) {
            results.push(unreplayable(row, 'judge-returned-no-answer'));
            return;
          }
          // Stored outcomes are 'match' | 'new' on the (term, candidate)
          // pair; the judge can also say 'reject' (not a food at all).
          results.push(compared(row, v.decision, v.reason));
        });
      }
    }
    return results;
  }
}

class EntityDedupeReplayAdapter implements VerdictReplayAdapter {
  readonly lane = ENTITY_DEDUPE_LANE;
  constructor(private readonly deps: Deps) {}

  currentRuleVersion(): number {
    return entityDedupeRuleVersion();
  }

  async rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]> {
    const subjects = rows.map((row) => row.subject as DedupePairSubject);
    const entities = await activeEntities(
      this.deps.prisma,
      subjects.flatMap((s) => [s?.aId, s?.bId]).filter(Boolean),
    );
    const results: ReplayRowResult[] = [];
    const live: Array<{
      row: StoredVerdictRow;
      s: DedupePairSubject;
      kind: 'item' | 'ingredient';
    }> = [];
    for (let i = 0; i < rows.length; i += 1) {
      const s = subjects[i];
      if (!s?.aId || !s?.bId) {
        results.push(unreplayable(rows[i], 'subject-missing-inputs'));
        continue;
      }
      const a = entities.get(s.aId);
      const b = entities.get(s.bId);
      if (!a || !b) {
        // A judged 'merge' consumed one side; the pair no longer exists to
        // re-ask about. Honest count, not a silent skip.
        results.push(unreplayable(rows[i], 'entity-merged-or-archived'));
        continue;
      }
      live.push({
        row: rows[i],
        s,
        kind: a.type === 'ingredient' ? 'ingredient' : 'item',
      });
    }
    const homes = new Map([
      ...(await foodHomes(
        this.deps.prisma,
        live
          .filter((l) => l.kind === 'item')
          .flatMap((l) => [l.s.aId, l.s.bId]),
        'item',
      )),
      ...(await foodHomes(
        this.deps.prisma,
        live
          .filter((l) => l.kind === 'ingredient')
          .flatMap((l) => [l.s.aId, l.s.bId]),
        'ingredient',
      )),
    ]);
    // NO same_place on sweep-replay hearings — the sweep's own wire dropped
    // it (merge-batch audit 2026-08-30: footprint overlap masqueraded as
    // "same restaurant" on corpus-global pairs); the replay mirrors the
    // live wire exactly.
    for (const kind of ['item', 'ingredient'] as const) {
      const slice = live.filter((l) => l.kind === kind);
      for (let i = 0; i < slice.length; i += 10) {
        const batch = slice.slice(i, i + 10);
        const verdicts = await this.deps.llm.matchEntitiesBatch({
          kind,
          items: batch.map(({ s }) => ({
            term: entities.get(s.aId)?.name ?? s.aName,
            termHomePlaces: homes.get(s.aId)?.homes ?? undefined,
            candidates: [
              {
                id: 1,
                name: entities.get(s.bId)?.name ?? s.bName,
                homePlaces: homes.get(s.bId)?.homes ?? undefined,
              },
            ],
          })),
        });
        batch.forEach(({ row }, j) => {
          const v = verdicts[j];
          if (!v || !v.reason?.trim()) {
            results.push(unreplayable(row, 'judge-returned-no-answer'));
            return;
          }
          // The lane's outcome vocabulary: 'match' orders a merge,
          // anything else persists as 'hold'.
          results.push(
            compared(row, v.decision === 'match' ? 'merge' : 'hold', v.reason),
          );
        });
      }
    }
    return results;
  }
}

class AttributeMergeReplayAdapter implements VerdictReplayAdapter {
  readonly lane = ATTRIBUTE_MERGE_LANE;
  constructor(private readonly deps: Deps) {}

  // LAZY on purpose: attribute-merge-rule.ts THROWS at import time when its
  // prompt text is mid-edit and unversioned (the release-ledger law). The
  // harness must stay usable for every other lane while one lane's rule is
  // being iterated, so the version resolves only when this lane is replayed.
  currentRuleVersion(): number {
    const { ATTRIBUTE_MERGE_RULE_VERSION } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../attribute-ontology/attribute-merge-rule') as {
        ATTRIBUTE_MERGE_RULE_VERSION: number;
      };
    return ATTRIBUTE_MERGE_RULE_VERSION;
  }

  async rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]> {
    const subjects = rows.map((row) => row.subject as AttributeMergeSubject);
    const entities = await activeEntities(
      this.deps.prisma,
      subjects.flatMap((s) => [s?.aId, s?.bId]).filter(Boolean),
    );
    const results: ReplayRowResult[] = [];
    const live: Array<{ row: StoredVerdictRow; s: AttributeMergeSubject }> = [];
    for (let i = 0; i < rows.length; i += 1) {
      const s = subjects[i];
      if (!s?.aId || !s?.bId || !s?.type) {
        results.push(unreplayable(rows[i], 'subject-missing-inputs'));
      } else if (!entities.has(s.aId) || !entities.has(s.bId)) {
        results.push(unreplayable(rows[i], 'attribute-merged-or-archived'));
      } else {
        live.push({ row: rows[i], s });
      }
    }
    for (const type of ['place_attribute', 'item_attribute'] as const) {
      const slice = live.filter((l) => l.s.type === type);
      if (!slice.length) continue;
      const carriers = await fetchAttributeCarriers(this.deps.prisma, type, [
        ...new Set(slice.flatMap((l) => [l.s.aId, l.s.bId])),
      ]);
      for (let i = 0; i < slice.length; i += 25) {
        const batch = slice.slice(i, i + 25);
        const verdicts = await this.deps.llm.judgeAttributeMergesBatch({
          kind: type,
          pairs: batch.map(({ s }) => ({
            a: entities.get(s.aId)?.name ?? s.aName,
            b: entities.get(s.bId)?.name ?? s.bName,
            aUsedBy: carriers.get(s.aId),
            bUsedBy: carriers.get(s.bId),
          })),
        });
        batch.forEach(({ row }, j) => {
          const v = verdicts[j];
          const reason = v?.reason?.trim() ?? '';
          if (!v || !reason) {
            results.push(unreplayable(row, 'judge-returned-no-answer'));
            return;
          }
          results.push(
            compared(row, v.decision === 'merge' ? 'merge' : 'hold', reason),
          );
        });
      }
    }
    return results;
  }
}

/** The satisfies judge's response schema, mirrored from
 *  concept-satisfies.service.ts (the rule TEXT lives in the shared
 *  concept-satisfies-rule.ts; this is the wire format only). */
const SATISFIES_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'number' },
          verdict: {
            type: 'string',
            enum: ['satisfies', 'cousin', 'reject'],
          },
        },
        required: ['n', 'verdict'],
      },
    },
  },
  required: ['items'],
};

class ConceptSatisfiesReplayAdapter implements VerdictReplayAdapter {
  readonly lane = CONCEPT_SATISFIES_LANE;
  constructor(private readonly deps: Deps) {}

  currentRuleVersion(): number {
    return satisfiesRule().SATISFIES_PROMPT_VERSION;
  }

  async rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]> {
    // The subject carries the ordered pair; the claim key is its spelling
    // (from>to) — either reconstructs the question. Names come from
    // today's corpus.
    const pairs = rows.map((row) => {
      const s = row.subject as SatisfiesSubject | null;
      if (s?.fromEntityId && s?.toEntityId) return s;
      const [fromEntityId, toEntityId] = row.claimKey.split('>');
      return { fromEntityId, toEntityId };
    });
    const entities = await activeEntities(
      this.deps.prisma,
      pairs.flatMap((p) => [p.fromEntityId, p.toEntityId]).filter(Boolean),
    );
    const results: ReplayRowResult[] = [];
    const byAnchor = new Map<
      string,
      Array<{ row: StoredVerdictRow; p: SatisfiesSubject }>
    >();
    for (let i = 0; i < rows.length; i += 1) {
      const p = pairs[i];
      if (!p.fromEntityId || !p.toEntityId) {
        results.push(unreplayable(rows[i], 'subject-missing-inputs'));
      } else if (!entities.has(p.fromEntityId) || !entities.has(p.toEntityId)) {
        results.push(unreplayable(rows[i], 'entity-merged-or-archived'));
      } else {
        const list = byAnchor.get(p.fromEntityId) ?? [];
        list.push({ row: rows[i], p });
        byAnchor.set(p.fromEntityId, list);
      }
    }
    for (const [anchorId, list] of byAnchor) {
      const anchorName = entities.get(anchorId)?.name ?? '';
      for (let i = 0; i < list.length; i += 25) {
        const batch = list.slice(i, i + 25);
        const verdicts = await this.judge(
          anchorName,
          batch.map(({ p }) => ({
            entityId: p.toEntityId,
            name: entities.get(p.toEntityId)?.name ?? '',
          })),
        );
        batch.forEach(({ row }, j) => {
          const verdict = verdicts.get(j + 1);
          if (!verdict) {
            results.push(unreplayable(row, 'judge-returned-no-answer'));
            return;
          }
          results.push(compared(row, verdict));
        });
      }
    }
    return results;
  }

  /** Mirrors ConceptSatisfiesService.judge — same caller, same rule text,
   *  same temperature-0 classification discipline. */
  private async judge(
    anchorName: string,
    batch: ReadonlyArray<{ entityId: string; name: string }>,
  ): Promise<Map<number, string>> {
    const text = await this.deps.llm.generateForCaller({
      caller: 'concepts.satisfies',
      prompt: satisfiesRule().buildSatisfiesPrompt(anchorName, batch),
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: SATISFIES_RESPONSE_SCHEMA,
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return new Map();
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

class WordLaneReplayAdapter implements VerdictReplayAdapter {
  constructor(
    readonly lane: string,
    private readonly ruleVersion: number,
    private readonly deps: Deps,
  ) {}

  currentRuleVersion(): number {
    return this.ruleVersion;
  }

  async rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]> {
    const replayed = await this.deps.wordJudge.replayClaims(this.lane, rows);
    return replayed.map((r, i) =>
      r.newOutcome
        ? compared(rows[i], r.newOutcome, r.newReason)
        : unreplayable(rows[i], 'judge-returned-no-answer'),
    );
  }
}

/** The lane roster with reconstruction verdicts for the rest — every lane
 *  named in docs/llm-systems-map.md appears here, implemented or loudly
 *  not. */
export function buildVerdictReplayRegistry(deps: Deps): VerdictReplayRegistry {
  const registry = new VerdictReplayRegistry();
  registry.register(new EntityMatchReplayAdapter(deps));
  registry.register(new EntityDedupeReplayAdapter(deps));
  registry.register(new AttributeMergeReplayAdapter(deps));
  registry.register(new ConceptSatisfiesReplayAdapter(deps));
  registry.register(
    new WordLaneReplayAdapter(
      WORD_GENERICNESS_LANE,
      WORD_GENERICNESS_RULE_VERSION,
      deps,
    ),
  );
  registry.register(
    new WordLaneReplayAdapter(
      WORD_NEGATION_LANE,
      WORD_NEGATION_RULE_VERSION,
      deps,
    ),
  );
  registry.register(
    new WordLaneReplayAdapter(WORD_ROLE_LANE, WORD_ROLE_RULE_VERSION, deps),
  );
  registry.registerUnimplemented({
    lane: 'place_grounding',
    reason:
      'no adapter: the hearing chose among LIVE Google Places candidates ' +
      'that are not stored in the subject — rebuilding them costs fresh ' +
      'Places spend and yields a different candidate set, so the replay ' +
      'would not be a replay. Excluded deliberately.',
  });
  registry.registerUnimplemented({
    lane: 'restaurant_name',
    reason:
      'no adapter yet: the subject stores the EFFECT (surface demotion), ' +
      'not the hearing inputs; the docket context is rebuilt inside ' +
      'PlaceNameHearingService. Implementable, pending.',
  });
  registry.registerUnimplemented({
    lane: 'word_claim',
    reason:
      'no adapter yet: collision hearings rebuild their context from the ' +
      'live entity_surface graph inside the adjudicator. Implementable, ' +
      'pending.',
  });
  registry.registerUnimplemented({
    lane: 'dish.knowledge_synthesize',
    reason:
      'no adapter: generative synthesis, not a classification — a replay ' +
      'is a full re-synthesis with no scalar outcome to diff; drift there ' +
      'is guarded by its own gold gate. Excluded deliberately. (Also the ' +
      'documented orphan lane: no *_LANE constant or adapter exists.)',
  });
  return registry;
}
