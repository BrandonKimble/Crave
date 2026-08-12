import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  addSurfaces,
  mintWordClaimVerdict,
  surfaceClaimKey,
  type SurfaceSource,
} from './entity-surface.service';
import { canonicalFold } from './entity-identity';

/**
 * THE WORD-CLAIM ADJUDICATOR — the judge behind the collision guard
 * (concept-graph §9.9, owner-ruled 2026-08-07: "build the claims registry").
 *
 * THE LAW IT ENFORCES. A word→concept claim carries provenance:
 *   testimony (observed: extraction/legacy/places — a person really said it)
 *     > judged (this service's verdicts)
 *     > inferred (vocabulary/knowledge_synthesis/seed/query_banking).
 * The collision guard (P0-b) refuses an inferred claim when ANY other entity
 * already holds the word. That is correct against testimony — an inference
 * never overrides evidence — but between two INFERENCES it is first-writer-
 * wins: a wrong early claim squats forever (`picante` on hot sauce blocked
 * spicy; measured cost: 4,698 blocked surfaces in one sweep). Both naive
 * alternatives were EXECUTED and falsified on the launch gate: allowing
 * cross-type coexistence blindly banked `helado` onto iced[attr] and beat
 * ice cream (gate 90.7→88.7, reverted in 69e6eeac7). So conflicts between
 * inferences go to a judge, per word, and the verdict is REMEMBERED:
 *   - a losing incumbent loses the WORD, never the label: a role='both' row
 *     degrades to role='display' (still rendered, no longer grounds), a
 *     role='recall' row is deprecated. Either way it cannot silently return;
 *   - a losing newcomer is written status='deprecated' (never re-proposed —
 *     the same remembered-wrong shape as R5-6b);
 *   - BOTH may win (`picante` = hot sauce to an American, spicy in Spanish)
 *     — a word naming two concepts is a fact the span scanner already
 *     carries; placement resolves per query.
 *
 * THE CASE IS ONE WORD, NOT ONE FOLD (2026-08-09). A conflict exists only
 * between claimants that want the IDENTICAL form (`surfaceClaimKey` — case and
 * punctuation fold, accents do not). The recall key `canonicalFold` drops
 * accents on purpose so 'bo' typed on a US keyboard still reaches bò, and
 * adjudicating on it meant every hearing between two Vietnamese words was a
 * FALSE CONFLICT: bò (beef), bơ (butter) and bó (bunch) arrived as one case,
 * and BOTH possible outcomes — refuse the newcomer, or evict the incumbent —
 * took a correct word→concept pairing away. Measured before the fix: 5 of 5
 * re-heard vi refusals would have evicted a correct incumbent, and the judge
 * flipped 60% of its own verdicts on re-ask. All of the regressions that built
 * this guard (caldo→soup, helado→iced, picante) are identical-form collisions
 * and are unaffected.
 *
 * The guard stays exactly as strict as before. This service is its appeal
 * court, run OFFLINE over the blocked backlog — never in a request path.
 */

/**
 * THE JUDGE'S RULE HAS A VERSION, AND A BUMP RE-OPENS EVERY VERDICT IT MADE
 * (2026-08-09). Every row a verdict writes is stamped
 * `entity_surface.claim_judge_version`, and `staleVerdictClaims` re-offers any
 * lost claim decided under an older rule. That is the whole reason this number
 * exists: when the RULE is found wrong, the corpus is corrected by re-hearing,
 * never by hand-editing rows. Two verdicts were hand-reverted on 2026-08-09
 * (`chả giò`, `chảy`) because there was no other lever; there is one now.
 */
// v3 (2026-08-09): THE RULE, not the formatting. v2 asked one flat question
// ("does this claimant use this word?") with a fail-closed "unsure → false",
// which made EVICTION the cheap answer and cost the corpus real food: `tôm`
// taken off shrimp and given to prawns, `chả giò` taken off spring roll and
// given to egg roll — pairs a searcher does not distinguish. v3 states the
// decision rule the outcomes are supposed to encode (evict only what is
// FACTUALLY WRONG; uphold BOTH for culinary near-synonyms), makes the doubt
// asymmetric (an unproven newcomer is refused, a doubted incumbent is kept —
// eviction is the destructive move), names the searcher as the deciding lens,
// and hands the judge the GRAPH ADJACENCY between the two concepts as
// evidence, so "near-synonym" is read off derived data instead of vibes.
// v2 (2026-08-08): every incumbent listed (v1 showed only the first),
// plus per-claimant context (sample aliases) — v1 mis-voted picante/café
// on bare name+type pairs, measured on the launch gate.
export const CLAIM_JUDGE_PROMPT_VERSION = 3;

/** Claims per LLM call. */
const PER_CALL = 10;

/** The judge's rule, as a versioned .md asset (see the version note above).
 *  __dirname-relative like every prompt load — resolves under both src
 *  (ts-jest) and dist (nest-cli copies prompts/*.md as assets). */
const CLAIM_JUDGE_PROMPT = readFileSync(
  join(
    __dirname,
    '../../external-integrations/llm/prompts/claim-judge-prompt.md',
  ),
  'utf8',
);

const TESTIMONY_SOURCES: ReadonlySet<string> = new Set([
  'legacy',
  'merge_fold',
  'ontology_rename',
  'extraction',
  'places',
  'cuisine',
]);

export interface ContestedClaim {
  /** The word (verbatim surface) the target entity wants to claim. */
  form: string;
  locale: string;
  /** The entity trying to claim it. */
  entityId: string;
  source: SurfaceSource;
}

export interface AdjudicationSummary {
  considered: number;
  /** Skipped: incumbent is testimony or the entity's own name — no appeal. */
  testimonyUpheld: number;
  judged: number;
  /** Newcomer banked, incumbent kept (legit multi-claim). */
  bothUpheld: number;
  /**
   * SURFACES ACTUALLY BANKED BY THIS HEARING — counted at the `bank()` call
   * itself, which is the only honest place. It is NOT `bothUpheld +
   * incumbentEvicted`: the uncontested branch above increments `bothUpheld`
   * for a claim whose target entity no longer exists (`!p.target`) and banks
   * NOTHING. The label sweep reports its banked total from this number, so
   * an outcome counter that overcounts by one dead entity would inflate the
   * sweep's headline. Zero under dryRun, because nothing was written.
   */
  banked: number;
  /** Incumbent deprecated, newcomer banked. */
  incumbentEvicted: number;
  /** Newcomer written 'deprecated' — remembered wrong, never re-proposed. */
  newcomerRefused: number;
  /** Judge unavailable/failed — left blocked, re-offered next run. */
  unjudged: number;
  /** Every hearing that reached a verdict, with the judge's stated reason. */
  cases: JudgedCase[];
}

interface Claimant {
  entityId: string;
  name: string;
  type: string;
  /** Up to 3 sample active surfaces — the judge's context for what this
   *  concept actually is (v1's bare name+type mis-voted picante/café). */
  context: string[];
  /** True when the claim is testimony or the entity's own identity. */
  testimony: boolean;
  aliasId: string | null;
  /**
   * How this concept sits next to the CLAIMANT under judgment in the derived
   * concept graph — the near-synonym question, answered from data the corpus
   * already derives (`entity_satisfies`, `derived_entity_sibling_edges`)
   * instead of from the model's feel for two bare names. Null on the target
   * itself.
   */
  adjacency: string | null;
}

/** One case's outcome, as the judge stated it — kept so a verdict can be
 *  read back with its reason instead of inferred from row diffs. */
export interface JudgedCase {
  form: string;
  locale: string;
  entityId: string;
  targetName: string;
  outcome: 'bothUpheld' | 'incumbentEvicted' | 'newcomerRefused';
  /** Incumbents this hearing kept / took the word from, as "name[type]". */
  upheld: string[];
  evicted: string[];
  reason: string;
}

@Injectable()
export class WordClaimAdjudicatorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('WordClaimAdjudicatorService');
  }

  async adjudicate(
    claims: ContestedClaim[],
    options: { dryRun?: boolean } = {},
  ): Promise<AdjudicationSummary> {
    const dryRun = options.dryRun ?? false;
    const summary: AdjudicationSummary = {
      considered: 0,
      testimonyUpheld: 0,
      judged: 0,
      bothUpheld: 0,
      banked: 0,
      incumbentEvicted: 0,
      newcomerRefused: 0,
      unjudged: 0,
      cases: [],
    };

    // One judgment per (word, target entity).
    const seen = new Set<string>();
    const unique = claims.filter((c) => {
      // Keyed by the CLAIM unit (the word), not the recall fold: bò and bơ on
      // one entity are two claims, and folding them together silently dropped
      // the second one unheard.
      const key = `${surfaceClaimKey(c.form)}|${c.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (let i = 0; i < unique.length; i += PER_CALL) {
      const batch = unique.slice(i, i + PER_CALL);
      const prepared = await Promise.all(
        batch.map(async (claim) => ({
          claim,
          target: await this.entityCard(claim.entityId),
          incumbents: await this.incumbentsOf(claim.form, claim.entityId),
        })),
      );

      const judgeable: typeof prepared = [];
      for (const p of prepared) {
        summary.considered += 1;
        if (!p.target || p.incumbents.length === 0) {
          // Nothing contests it anymore — bank directly. This is also how a
          // FALSE CONFLICT is undone: a claim refused when the hearing was
          // held on the accent-blind fold has no same-word incumbent at all,
          // so the re-hearing finds no case to answer and the word goes back.
          if (p.target && (await this.bank(p.claim, dryRun))) {
            summary.banked += 1;
          }
          summary.bothUpheld += 1;
          if (p.target) {
            summary.cases.push({
              form: p.claim.form,
              locale: p.claim.locale,
              entityId: p.claim.entityId,
              targetName: `${p.target.name}[${p.target.type}]`,
              outcome: 'bothUpheld',
              upheld: [],
              evicted: [],
              reason: 'uncontested — no other concept claims this word',
            });
          }
          continue;
        }
        // TESTIMONY MAKES AN INCUMBENT UNEVICTABLE — it does NOT bar a
        // co-claim. `cafe` the venue type owns the string as its NAME, and
        // "café" is STILL the Spanish word for coffee: the newcomer's own
        // merit gets a hearing; only eviction is off the table. (First
        // version refused without a hearing and cost café→coffee,
        // picante→spicy on the launch gate — measured, corrected.)
        judgeable.push(p);
      }
      if (!judgeable.length) continue;

      let verdicts: Map<
        number,
        { target: boolean; others: boolean[]; reason: string }
      >;
      try {
        verdicts = await this.judge(judgeable);
      } catch (error) {
        summary.unjudged += judgeable.length;
        this.logger.warn('Claim judge failed (claims left blocked)', {
          size: judgeable.length,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        continue;
      }

      for (let n = 0; n < judgeable.length; n += 1) {
        const p = judgeable[n];
        const verdict = verdicts.get(n + 1);
        if (!verdict) {
          summary.unjudged += 1;
          continue;
        }
        summary.judged += 1;
        const label = (c: Claimant) => `${c.name}[${c.type}]`;
        if (!verdict.target) {
          await this.refuse(p.claim, dryRun);
          summary.newcomerRefused += 1;
          summary.cases.push({
            form: p.claim.form,
            locale: p.claim.locale,
            entityId: p.claim.entityId,
            targetName: p.target ? label(p.target) : p.claim.entityId,
            outcome: 'newcomerRefused',
            upheld: p.incumbents.map(label),
            evicted: [],
            reason: verdict.reason,
          });
          continue;
        }
        // PER-INCUMBENT verdicts (v2): evict exactly the incumbents the
        // judge rejected — never a testimony claim (unevictable by law).
        const evictable = p.incumbents.filter(
          (inc, k) => verdict.others[k] === false && !inc.testimony,
        );
        if (!dryRun && evictable.length) {
          await this.evictIncumbents(evictable);
        }
        if (await this.bank(p.claim, dryRun)) {
          summary.banked += 1;
        }
        if (evictable.length) {
          summary.incumbentEvicted += 1;
        } else {
          summary.bothUpheld += 1;
        }
        const evictedSet = new Set(evictable.map((inc) => inc.entityId));
        summary.cases.push({
          form: p.claim.form,
          locale: p.claim.locale,
          entityId: p.claim.entityId,
          targetName: p.target ? label(p.target) : p.claim.entityId,
          outcome: evictable.length ? 'incumbentEvicted' : 'bothUpheld',
          upheld: p.incumbents
            .filter((inc) => !evictedSet.has(inc.entityId))
            .map(label),
          evicted: evictable.map(label),
          reason: verdict.reason,
        });
      }
    }

    this.logger.info('Word-claim adjudication complete', {
      ...summary,
      cases: summary.cases.length,
      dryRun,
    });
    return summary;
  }

  private async entityCard(entityId: string): Promise<Claimant | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string; type: string }>
    >`SELECT entity_id::text, name, type::text FROM core_entities
       WHERE entity_id = ${entityId}::uuid AND status = 'active'`;
    const row = rows[0];
    if (!row) return null;
    return {
      entityId: row.entity_id,
      name: row.name,
      type: row.type,
      context: await this.sampleSurfaces(row.entity_id),
      testimony: false,
      aliasId: null,
      adjacency: null,
    };
  }

  private async sampleSurfaces(entityId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ form: string }>>`
      SELECT form FROM entity_surface
       WHERE entity_id = ${entityId}::uuid AND status = 'active'
         -- Recall surfaces only: this is "what do people CALL it", the
         -- judge's context for what the concept actually is.
         AND role <> 'display'
       ORDER BY created_at ASC LIMIT 3`;
    return rows.map((r) => r.form);
  }

  /**
   * Every OTHER active entity currently holding THE SAME WORD, with provenance.
   *
   * THE HEARING IS PER FORM (2026-08-09). The fold still FETCHES the candidate
   * set — it is the indexed column, and a superset of the real conflicts — but
   * an incumbent only contests the claim when it wants the identical word,
   * accents included (`surfaceClaimKey`). Before this the judge was handed
   * bò/bơ/bó as one case and asked which concept owns `bo`: an unanswerable
   * question it answered differently 60% of the time on re-ask, and whose every
   * outcome was wrong — 5 of 5 refused vi claims would, re-heard, have evicted
   * a CORRECT incumbent. A question that cannot be answered must not be asked.
   */
  private async incumbentsOf(
    form: string,
    exceptEntityId: string,
  ): Promise<Claimant[]> {
    const folded = canonicalFold(form);
    const claimKey = surfaceClaimKey(form);
    const rows = await this.prisma.$queryRaw<
      Array<{
        entity_id: string;
        name: string;
        type: string;
        form: string;
        source: string | null;
        surface_id: string | null;
        is_name: boolean;
      }>
    >`SELECT e.entity_id::text, e.name, e.type::text, e.name AS form,
             NULL AS source, NULL::uuid AS surface_id, TRUE AS is_name
        FROM core_entities e
       WHERE e.identity_key = ${folded} AND e.status <> 'archived'
         AND e.entity_id <> ${exceptEntityId}::uuid
      UNION ALL
      SELECT e.entity_id::text, e.name, e.type::text, a.form, a.source,
             a.surface_id, FALSE
        FROM entity_surface a
        JOIN core_entities e ON e.entity_id = a.entity_id
       WHERE a.form_folded = ${folded} AND a.status = 'active'
         -- An INCUMBENT is an entity that HOLDS the word for recall. A
         -- role='display' row makes no recall claim (its own was refused or
         -- withheld), so it contests nothing.
         AND a.role <> 'display'
         AND e.status = 'active'
         AND a.entity_id <> ${exceptEntityId}::uuid`;
    const claimants: Claimant[] = [];
    for (const row of rows) {
      // Same fold, different word (bò vs bơ) — not a conflict, no hearing.
      if (surfaceClaimKey(row.form) !== claimKey) continue;
      claimants.push({
        entityId: row.entity_id,
        name: row.name,
        type: row.type,
        context: await this.sampleSurfaces(row.entity_id),
        testimony: row.is_name || TESTIMONY_SOURCES.has(row.source ?? ''),
        aliasId: row.surface_id,
        adjacency: await this.adjacencyOf(exceptEntityId, row.entity_id),
      });
    }
    return claimants;
  }

  private async judge(
    items: Array<{
      claim: ContestedClaim;
      target: Claimant | null;
      incumbents: Claimant[];
    }>,
  ): Promise<
    Map<number, { target: boolean; others: boolean[]; reason: string }>
  > {
    const card = (c: Claimant | null, label: string) =>
      `   ${label}: "${c?.name}" [${c?.type}]` +
      (c?.context.length ? ` — also known as: ${c.context.join(', ')}` : '') +
      (c?.adjacency ? `\n      graph: ${c.adjacency}` : '');
    // THE RULE lives in prompts/claim-judge-prompt.md (promoted from an
    // inline block, prompt-fleet audit 2026-08-11 — same v3 text verbatim,
    // so CLAIM_JUDGE_PROMPT_VERSION stays 3: a placement change re-hears
    // nothing). Only the dynamic case cards are built here.
    const prompt = items
      .map(({ claim, target, incumbents }, index) =>
        [
          `${index + 1}. WORD "${claim.form}" (locale ${claim.locale})`,
          card(target, 'claimant_a (new)'),
          ...incumbents.map((inc, k) => card(inc, `incumbent_${k + 1}`)),
        ].join('\n'),
      )
      .join('\n');

    const text = await this.llm.generateForCaller({
      caller: 'aliases.claim_judge',
      systemInstruction: CLAIM_JUDGE_PROMPT,
      prompt,
      generationConfig: {
        // ZERO, not 0.1 (2026-08-11) — same measured rationale as the
        // vocabulary pass (vocabulary-generator.ts): ownership verdicts are
        // persisted rulings over a fixed claimant set; a re-ask must return
        // the same answer, and sampling variety was measurable harm there.
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  n: { type: 'number' },
                  a_owns_word: { type: 'boolean' },
                  incumbents_own_word: {
                    type: 'array',
                    items: { type: 'boolean' },
                  },
                  reason: { type: 'string' },
                },
                required: ['n', 'a_owns_word', 'incumbents_own_word', 'reason'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      items?: Array<{
        n?: number;
        a_owns_word?: boolean;
        incumbents_own_word?: boolean[];
        reason?: string;
      }>;
    };
    return new Map(
      (parsed.items ?? [])
        .filter((item) => typeof item.n === 'number')
        .map((item) => [
          item.n as number,
          {
            target: item.a_owns_word === true,
            others: item.incumbents_own_word ?? [],
            reason: (item.reason ?? '').trim(),
          },
        ]),
    );
  }

  /**
   * HOW THESE TWO CONCEPTS SIT IN THE GRAPH — the near-synonym question,
   * answered from derived data.
   *
   * `entity_satisfies` is an explicit judgment the corpus already made about
   * substitutability ('satisfies' / 'cousin' / 'reject'), and
   * `derived_entity_sibling_edges` carries embedding neighbourhood with a
   * mutual rank. Shrimp and prawns, for instance, are a satisfies edge AND
   * each other's rank-1 mutual sibling — which is exactly the evidence that
   * makes "a searcher would accept either" a fact rather than a hunch. Handing
   * the judge nothing forced it to decide near-synonymy from two bare names,
   * and it decided wrong (tôm, chả giò).
   */
  private async adjacencyOf(
    entityId: string,
    otherId: string,
  ): Promise<string | null> {
    const [relations, siblings] = await Promise.all([
      this.prisma.$queryRaw<Array<{ relation: string }>>`
        SELECT relation FROM entity_satisfies
         WHERE (from_entity_id = ${entityId}::uuid AND to_entity_id = ${otherId}::uuid)
            OR (from_entity_id = ${otherId}::uuid AND to_entity_id = ${entityId}::uuid)`,
      this.prisma.$queryRaw<Array<{ forward_rank: number }>>`
        SELECT forward_rank FROM derived_entity_sibling_edges
         WHERE (anchor_entity_id = ${entityId}::uuid AND sibling_entity_id = ${otherId}::uuid)
            OR (anchor_entity_id = ${otherId}::uuid AND sibling_entity_id = ${entityId}::uuid)
         ORDER BY forward_rank ASC LIMIT 1`,
    ]);
    const parts: string[] = [];
    for (const row of relations) parts.push(`${row.relation} edge`);
    if (siblings[0]) {
      parts.push(`semantic sibling (rank ${siblings[0].forward_rank})`);
    }
    // SILENCE IS NOT EVIDENCE OF DISTANCE. An absent edge can mean "judged
    // unrelated" or "never derived for this pair", and the two are not the
    // same claim — so nothing is said when nothing is known.
    return parts.length ? parts.join(', ') : null;
  }

  /**
   * THE CLAIMS DUE A FRESH HEARING — the mechanism that replaces hand-reverts.
   *
   * A lost claim is remembered two ways, and both are selected here: a REFUSED
   * newcomer (status='deprecated') and an EVICTED or refused label claim
   * (role='display' on an inferred row, which is only ever how a lost recall
   * claim is encoded). A row is due when the rule that settled it is older
   * than the current one — including NULL, which is every verdict minted
   * before verdicts were versioned at all, and which is the honest reading of
   * them: the pre-2026-08-09 judge decided on the accent-destroying recall
   * fold, so `chảy` was refused against `chay` — two different Vietnamese
   * words — and the question it answered was never real.
   *
   * Only INFERRED sources are re-offered. Testimony is not a claim anyone
   * judged, and a display row from a human is a label, not a lost hearing.
   */
  async staleVerdictClaims(
    locale: string,
    options: { limit?: number; forms?: readonly string[] } = {},
  ): Promise<ContestedClaim[]> {
    const limit = options.limit ?? 200;
    const forms = (options.forms ?? []).map((f) => canonicalFold(f));
    const rows = await this.prisma.$queryRaw<
      Array<{ form: string; locale: string; entity_id: string; source: string }>
    >`
      SELECT s.form, s.locale, s.entity_id::text, s.source
        FROM entity_surface s
        JOIN core_entities e ON e.entity_id = s.entity_id
       WHERE e.status = 'active'
         AND s.locale = ${locale}
         AND s.source IN ('vocabulary', 'sweep', 'knowledge_synthesis',
                          'seed', 'query_banking', 'synthesis')
         AND (s.status = 'deprecated' OR s.role = 'display')
         AND (s.claim_judge_version IS NULL
              OR s.claim_judge_version < ${CLAIM_JUDGE_PROMPT_VERSION})
         AND (${forms.length === 0} OR s.form_folded = ANY(${forms}::text[]))
       ORDER BY s.updated_at ASC
       LIMIT ${limit}`;
    return rows.map((row) => ({
      form: row.form,
      locale: row.locale,
      entityId: row.entity_id,
      source: row.source as SurfaceSource,
    }));
  }

  /** Bank a won claim. The guard re-checks; with the incumbent deprecated it
   *  passes, so there is NO bypass flag — eviction IS the admission.
   *
   *  Returns whether a row was actually written, so callers tally what
   *  HAPPENED rather than what an outcome counter implies. */
  private async bank(claim: ContestedClaim, dryRun: boolean): Promise<boolean> {
    if (dryRun) return false;
    await this.prisma.$transaction((tx) =>
      addSurfaces(
        tx,
        claim.entityId,
        [
          {
            form: claim.form,
            locale: claim.locale,
            source: claim.source,
            claimJudgeVersion: CLAIM_JUDGE_PROMPT_VERSION,
          },
        ],
        // The verdict IS the ownership ruling — a 'both win' is a sanctioned
        // collision, so the guard defers to it (it blocked every coexistence
        // verdict otherwise; 862-claim forever-loop, 2026-08-08).
        { adjudicated: mintWordClaimVerdict() },
      ),
    );
    return true;
  }

  /** A losing newcomer is REMEMBERED as wrong (status 'deprecated'), so no
   *  future sweep re-proposes it — R5-6b applied to claims. */
  private async refuse(claim: ContestedClaim, dryRun: boolean): Promise<void> {
    if (dryRun) return;
    await this.prisma.$transaction((tx) =>
      addSurfaces(tx, claim.entityId, [
        {
          form: claim.form,
          locale: claim.locale,
          source: claim.source,
          status: 'deprecated',
          claimJudgeVersion: CLAIM_JUDGE_PROMPT_VERSION,
        },
      ]),
    );
  }

  /**
   * EVICTION TAKES THE WORD, NOT THE LABEL.
   *
   * A losing incumbent loses its RECALL claim. If that row is also the label
   * a user reads (role='both' — 13,734 of them are somebody's rendered
   * `is_default` name), deprecating it would silently revert that user's
   * localized label to English because every display read requires
   * status='active'. So eviction DEGRADES a 'both' row to 'display': the
   * label survives, the recall claim is dead (every recall arm reads
   * `role <> 'display'`), and the row itself is the memory that it lost —
   * exactly the encoding `addSurfaces` uses when the guard refuses a claim at
   * write time. A pure 'recall' row has no display life to keep, so it is
   * deprecated as before.
   *
   * THE DEGRADED ROW CANNOT RE-LITIGATE. It contests nothing (the collision
   * probe and `incumbentsOf` both skip role='display'), it cannot widen back
   * to 'both' on any unadjudicated write (insertSurfaceRows pins it), and it
   * still satisfies the sweep's "this concept is labelled" watermark, so no
   * nightly pass re-offers it. Only a fresh hearing can give the word back.
   */
  private async evictIncumbents(incumbents: Claimant[]): Promise<void> {
    const ids = incumbents
      .map((inc) => inc.aliasId)
      .filter((id): id is string => id !== null);
    if (!ids.length) return;
    await this.prisma.$executeRaw`
      UPDATE entity_surface
         SET role   = CASE WHEN role = 'both' THEN 'display' ELSE role END,
             status = CASE WHEN role = 'both' THEN status ELSE 'deprecated' END,
             -- The loser's row records WHICH rule took its word, so a later
             -- bump re-opens this eviction the same way it re-opens a refusal.
             claim_judge_version = ${CLAIM_JUDGE_PROMPT_VERSION},
             updated_at = now()
       WHERE surface_id = ANY(${ids}::uuid[])`;
  }
}
