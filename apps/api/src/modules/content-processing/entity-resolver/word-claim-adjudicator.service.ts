import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  addSurfaces,
  mintWordClaimVerdict,
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
 * The guard stays exactly as strict as before. This service is its appeal
 * court, run OFFLINE over the blocked backlog — never in a request path.
 */

// v2 (2026-08-08): every incumbent listed (v1 showed only the first),
// plus per-claimant context (sample aliases) — v1 mis-voted picante/café
// on bare name+type pairs, measured on the launch gate.
export const CLAIM_JUDGE_PROMPT_VERSION = 2;

/** Claims per LLM call. */
const PER_CALL = 10;

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
  /** Incumbent deprecated, newcomer banked. */
  incumbentEvicted: number;
  /** Newcomer written 'deprecated' — remembered wrong, never re-proposed. */
  newcomerRefused: number;
  /** Judge unavailable/failed — left blocked, re-offered next run. */
  unjudged: number;
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
      incumbentEvicted: 0,
      newcomerRefused: 0,
      unjudged: 0,
    };

    // One judgment per (folded word, target entity).
    const seen = new Set<string>();
    const unique = claims.filter((c) => {
      const key = `${canonicalFold(c.form)}|${c.entityId}`;
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
          incumbents: await this.incumbentsOf(
            canonicalFold(claim.form),
            claim.entityId,
          ),
        })),
      );

      const judgeable: typeof prepared = [];
      for (const p of prepared) {
        summary.considered += 1;
        if (!p.target || p.incumbents.length === 0) {
          // Nothing contests it anymore — bank directly.
          if (p.target) await this.bank(p.claim, dryRun);
          summary.bothUpheld += 1;
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

      let verdicts: Map<number, { target: boolean; others: boolean[] }>;
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
        if (!verdict.target) {
          await this.refuse(p.claim, dryRun);
          summary.newcomerRefused += 1;
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
        await this.bank(p.claim, dryRun);
        if (evictable.length) {
          summary.incumbentEvicted += 1;
        } else {
          summary.bothUpheld += 1;
        }
      }
    }

    this.logger.info('Word-claim adjudication complete', {
      ...summary,
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

  /** Every OTHER active entity currently holding the word, with provenance. */
  private async incumbentsOf(
    folded: string,
    exceptEntityId: string,
  ): Promise<Claimant[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        entity_id: string;
        name: string;
        type: string;
        source: string | null;
        surface_id: string | null;
        is_name: boolean;
      }>
    >`SELECT e.entity_id::text, e.name, e.type::text, NULL AS source,
             NULL::uuid AS surface_id, TRUE AS is_name
        FROM core_entities e
       WHERE e.identity_key = ${folded} AND e.status <> 'archived'
         AND e.entity_id <> ${exceptEntityId}::uuid
      UNION ALL
      SELECT e.entity_id::text, e.name, e.type::text, a.source,
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
      claimants.push({
        entityId: row.entity_id,
        name: row.name,
        type: row.type,
        context: await this.sampleSurfaces(row.entity_id),
        testimony: row.is_name || TESTIMONY_SOURCES.has(row.source ?? ''),
        aliasId: row.surface_id,
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
  ): Promise<Map<number, { target: boolean; others: boolean[] }>> {
    const card = (c: Claimant | null, label: string) =>
      `   ${label}: "${c?.name}" [${c?.type}]` +
      (c?.context.length ? ` — also known as: ${c.context.join(', ')}` : '');
    const prompt = [
      `You judge WORD OWNERSHIP for a food-discovery app's search index.`,
      `For each numbered case: ONE word is claimed by SEVERAL concepts. For`,
      `EVERY claimant, answer whether a real speaker of the word's language`,
      `genuinely uses THAT word to name THAT concept.`,
      ``,
      `Rules:`,
      `- Several claimants may all be right ("picante" names hot sauce in`,
      `  American English AND means spicy in Spanish). A word naming multiple`,
      `  concepts is a fact, not a conflict.`,
      `- Translation counts: if the word IS the claimant's name in the given`,
      `  locale ("café" is Spanish for coffee), that claimant owns it.`,
      `- A near-synonym or related concept does NOT own the word: "sopa"`,
      `  names soup, never a branded dish that merely contains soup.`,
      `- A proper noun / brand only owns a word that IS its name.`,
      `- Dietary and religious terms are never interchangeable.`,
      `- When genuinely unsure about a claimant, answer false for it.`,
      ``,
      ...items.map(({ claim, target, incumbents }, index) =>
        [
          `${index + 1}. WORD "${claim.form}" (locale ${claim.locale})`,
          card(target, 'claimant_a (new)'),
          ...incumbents.map((inc, k) => card(inc, `incumbent_${k + 1}`)),
        ].join('\n'),
      ),
      ``,
      `Return ONLY JSON: for each case, a_owns_word plus incumbents_own_word`,
      `— one boolean PER incumbent, in the order listed.`,
    ].join('\n');

    const text = await this.llm.generateForCaller({
      caller: 'aliases.claim_judge',
      prompt,
      generationConfig: {
        temperature: 0.1,
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
                },
                required: ['n', 'a_owns_word', 'incumbents_own_word'],
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
          },
        ]),
    );
  }

  /** Bank a won claim. The guard re-checks; with the incumbent deprecated it
   *  passes, so there is NO bypass flag — eviction IS the admission. */
  private async bank(claim: ContestedClaim, dryRun: boolean): Promise<void> {
    if (dryRun) return;
    await this.prisma.$transaction((tx) =>
      addSurfaces(
        tx,
        claim.entityId,
        [{ form: claim.form, locale: claim.locale, source: claim.source }],
        // The verdict IS the ownership ruling — a 'both win' is a sanctioned
        // collision, so the guard defers to it (it blocked every coexistence
        // verdict otherwise; 862-claim forever-loop, 2026-08-08).
        { adjudicated: mintWordClaimVerdict() },
      ),
    );
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
             updated_at = now()
       WHERE surface_id = ANY(${ids}::uuid[])`;
  }
}
