/**
 * @script-class: probe
 * @finding: BANKED 2026-08-09 — see `similar-band-source-eval.result.json`.
 * Head-to-head on what should power search band 2 ("similar dishes"):
 *   A = the dense reciprocity cut (mutual_rank ≤ R ∧ forward_rank ≤ K ∧
 *       cosine ≥ floor, ceiling-normalized relevance) MINUS judged rejects
 *   B = judged-only (entity_satisfies satisfies+cousin, rung 4)
 *   C = A ∪ B (neutral round-robin merge — no invented score)
 * Ground truth is the PRODUCTION judge (buildSatisfiesPrompt +
 * llm.generateForCaller('concepts.satisfies')), run only on served pairs that
 * carry no stored verdict. Already-judged pairs keep their stored verdicts.
 *
 * READ-ONLY against the DB: this probe NEVER writes entity_satisfies. Writing
 * would destroy the experiment's repeatability — a second run would find every
 * A-only pair "judged" and B would inherit A's candidates.
 *
 *   yarn workspace api ts-node scripts/search-harness/similar-band-source-eval.ts
 *   EVAL_DRY=1 …    # print the pair count that WOULD be judged, then exit
 *   EVAL_CACHE=0 …  # ignore the banked result file's verdict cache
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { bootstrap, out } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LLMService } from '../../src/modules/external-integrations/llm/llm.service';
import { SearchSiblingExpansionService } from '../../src/modules/search/search-sibling-expansion.service';
import { buildSatisfiesPrompt } from '../../src/modules/content-processing/entity-resolver/concept-satisfies.service';

/** The production cut (SearchService.resolveDenseSiblingsCut defaults). */
const CUT = { minCosine: 0.75, forwardK: 25, mutualR: 20, maxAnchors: 3 };
/** One served band-2 page. */
const TOP_N = 10;
/** Same batch size as the production pass. */
const PAIRS_PER_CALL = 25;

const RESULT_PATH = path.join(
  __dirname,
  'similar-band-source-eval.result.json',
);

/**
 * 20 anchors, ALL drawn from the 192 concepts the satisfies pass has already
 * judged. That is deliberate and it is the FAIREST POSSIBLE test for B: on an
 * anchor the pass never reached, B is empty by construction and the comparison
 * would only measure pass backlog. Corpus-wide judged coverage is reported
 * separately as its own number.
 * Spread: thin dense neighbourhoods (2–5 surviving edges) → saturated (25),
 * attribute-heavy names, vi-named, es-named.
 */
const ANCHORS = [
  'al pastor tacos',
  'taco',
  'pizza pie',
  'ramen',
  'roast duck',
  'bun bo hue',
  'banh xeo',
  'banh mi',
  'pho',
  'pozole',
  'tres leches cake',
  'ceviche',
  'tortilla espanola',
  'chirashi bowl',
  'gyro',
  'monte cristo',
  'fried chicken sandwich',
  'dry aged burger',
  'basque style cheesecake',
  'cheesesteak',
];

type Label = 'satisfies' | 'cousin' | 'reject';
type Source = 'A' | 'B' | 'C';

interface Candidate {
  entityId: string;
  name: string;
  /** ceiling-normalized dense relevance, when the pair survives the cut */
  relevance?: number;
  /** stored verdict at eval time, if any */
  stored?: Label;
}

interface AnchorResult {
  anchor: string;
  anchorId: string;
  denseRaw: number;
  storedRejects: number;
  rejectsInRawRing: string[];
  sets: Record<Source, Candidate[]>;
}

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'number' }, verdict: { type: 'string' } },
        required: ['n', 'verdict'],
      },
    },
  },
  required: ['items'],
};

function pairKey(from: string, to: string): string {
  return `${from}|${to}`;
}

function loadCache(): Record<string, Label> {
  if (process.env.EVAL_CACHE === '0' || !fs.existsSync(RESULT_PATH)) return {};
  try {
    const prior = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8')) as {
      verdictCache?: Record<string, Label>;
    };
    return prior.verdictCache ?? {};
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);
    const widening = app.get(SearchSiblingExpansionService);

    // ---- anchors ----
    const anchorRows = await prisma.$queryRaw<
      Array<{ entityId: string; name: string }>
    >(Prisma.sql`
      SELECT entity_id::text AS "entityId", name FROM core_entities
       WHERE type = 'food'::entity_type AND status = 'active'::entity_status
         AND lower(name) = ANY(${ANCHORS}::text[])`);
    const byName = new Map(anchorRows.map((r) => [r.name.toLowerCase(), r]));
    const missing = ANCHORS.filter((a) => !byName.has(a));
    if (missing.length) {
      throw new Error(`anchors not in corpus: ${missing.join(', ')}`);
    }

    const results: AnchorResult[] = [];

    for (const anchorName of ANCHORS) {
      const anchor = byName.get(anchorName)!;

      // stored verdicts FROM this anchor
      const stored = await prisma.$queryRaw<
        Array<{ toId: string; name: string; relation: Label }>
      >(Prisma.sql`
        SELECT s.to_entity_id::text AS "toId", t.name, s.relation::text AS relation
          FROM entity_satisfies s
          JOIN core_entities t ON t.entity_id = s.to_entity_id
           AND t.type = 'food'::entity_type AND t.status = 'active'::entity_status
         WHERE s.from_entity_id = ${anchor.entityId}::uuid`);
      const storedBy = new Map(stored.map((r) => [r.toId, r.relation]));
      const rejects = new Set(
        stored.filter((r) => r.relation === 'reject').map((r) => r.toId),
      );

      // --- A: the production dense read, via the REAL service ---
      const dense = await widening.getSiblingFoodIds([anchor.entityId], CUT);
      const denseNames = await prisma.$queryRaw<
        Array<{ entityId: string; name: string }>
      >(Prisma.sql`
        SELECT entity_id::text AS "entityId", name FROM core_entities
         WHERE entity_id = ANY(${dense.map((d) => d.siblingId)}::uuid[])`);
      const nameById = new Map(denseNames.map((r) => [r.entityId, r.name]));
      const denseSorted = dense
        .map((d) => ({
          entityId: d.siblingId,
          name: nameById.get(d.siblingId) ?? '?',
          relevance: d.relevance,
          stored: storedBy.get(d.siblingId),
        }))
        .sort(
          (x, y) => y.relevance - x.relevance || x.name.localeCompare(y.name),
        );
      const rejectsInRawRing = denseSorted
        .slice(0, TOP_N)
        .filter((c) => c.stored === 'reject')
        .map((c) => c.name);
      const setA = denseSorted
        .filter((c) => !rejects.has(c.entityId))
        .slice(0, TOP_N);

      // --- B: judged-only. satisfies first, then cousin; within a relation,
      // by dense cosine (uncut) desc so the ordering is a measured quantity,
      // not alphabetical luck. ---
      const cosineByTo = await prisma.$queryRaw<
        Array<{ toId: string; cosine: number }>
      >(Prisma.sql`
        SELECT sibling_entity_id::text AS "toId", cosine
          FROM derived_entity_sibling_edges
         WHERE anchor_entity_id = ${anchor.entityId}::uuid`);
      const cos = new Map(cosineByTo.map((r) => [r.toId, Number(r.cosine)]));
      const setB: Candidate[] = stored
        .filter((r) => r.relation !== 'reject' && r.toId !== anchor.entityId)
        .sort(
          (x, y) =>
            (x.relation === 'satisfies' ? 0 : 1) -
              (y.relation === 'satisfies' ? 0 : 1) ||
            (cos.get(y.toId) ?? 0) - (cos.get(x.toId) ?? 0) ||
            x.name.localeCompare(y.name),
        )
        .slice(0, TOP_N)
        .map((r) => ({
          entityId: r.toId,
          name: r.name,
          relevance: cos.get(r.toId),
          stored: r.relation,
        }));

      // --- C: neutral round-robin merge of A and B. No invented cross-source
      // score exists, so none is invented: alternate, dedupe, cap at TOP_N. ---
      const setC: Candidate[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < TOP_N && setC.length < TOP_N; i += 1) {
        for (const list of [setA, setB]) {
          const c = list[i];
          if (!c || seen.has(c.entityId) || setC.length >= TOP_N) continue;
          seen.add(c.entityId);
          setC.push(c);
        }
      }

      results.push({
        anchor: anchor.name,
        anchorId: anchor.entityId,
        denseRaw: denseSorted.length,
        storedRejects: rejects.size,
        rejectsInRawRing,
        sets: { A: setA, B: setB, C: setC },
      });
    }

    // ---- ground truth ----
    const cache = loadCache();
    const verdicts = new Map<string, Label>(Object.entries(cache));
    const needed: Array<{ anchor: AnchorResult; candidate: Candidate }> = [];
    for (const r of results) {
      const uniq = new Map<string, Candidate>();
      for (const c of [...r.sets.A, ...r.sets.B, ...r.sets.C]) {
        uniq.set(c.entityId, c);
      }
      for (const c of uniq.values()) {
        const key = pairKey(r.anchorId, c.entityId);
        if (c.stored) {
          verdicts.set(key, c.stored);
          continue;
        }
        if (verdicts.has(key)) continue;
        needed.push({ anchor: r, candidate: c });
      }
    }
    out(`pairs needing a fresh judge: ${needed.length}`);
    if (process.env.EVAL_DRY === '1') return;

    const byAnchor = new Map<string, Candidate[]>();
    for (const n of needed) {
      const list = byAnchor.get(n.anchor.anchorId) ?? [];
      list.push(n.candidate);
      byAnchor.set(n.anchor.anchorId, list);
    }
    let judged = 0;
    let calls = 0;
    for (const [anchorId, list] of byAnchor) {
      const anchorName =
        results.find((r) => r.anchorId === anchorId)?.anchor ?? '';
      for (let i = 0; i < list.length; i += PAIRS_PER_CALL) {
        const batch = list.slice(i, i + PAIRS_PER_CALL);
        const text = await llm.generateForCaller({
          caller: 'concepts.satisfies',
          prompt: buildSatisfiesPrompt(anchorName, batch),
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA,
          },
        });
        calls += 1;
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        const parsed = JSON.parse(text.slice(start, end + 1)) as {
          items?: Array<{ n?: number; verdict?: string }>;
        };
        const map = new Map<number, string>(
          (parsed.items ?? [])
            .filter((it) => typeof it.n === 'number' && it.verdict)
            .map((it) => [it.n as number, String(it.verdict)]),
        );
        for (const [index, candidate] of batch.entries()) {
          const raw = map.get(index + 1)?.toLowerCase();
          if (raw === undefined) continue; // a missing verdict is NOT a reject
          const label: Label =
            raw === 'satisfies' || raw === 'cousin' ? raw : 'reject';
          verdicts.set(pairKey(anchorId, candidate.entityId), label);
          judged += 1;
        }
      }
    }
    out(`judged ${judged} pairs in ${calls} LLM calls`);

    // ---- metrics ----
    const label = (anchorId: string, c: Candidate): Label | undefined =>
      verdicts.get(pairKey(anchorId, c.entityId));
    const metrics: Record<string, unknown> = {};
    for (const source of ['A', 'B', 'C'] as Source[]) {
      let served = 0;
      let acceptable = 0;
      let satisfiesCount = 0;
      let unlabeled = 0;
      let coverage = 0;
      const perAnchor: Array<Record<string, unknown>> = [];
      for (const r of results) {
        const list = r.sets[source];
        let ok = 0;
        let sat = 0;
        for (const c of list) {
          served += 1;
          const l = label(r.anchorId, c);
          if (!l) {
            unlabeled += 1;
            continue;
          }
          if (l === 'satisfies') {
            sat += 1;
            ok += 1;
          } else if (l === 'cousin') ok += 1;
        }
        acceptable += ok;
        satisfiesCount += sat;
        if (ok >= 3) coverage += 1;
        perAnchor.push({
          anchor: r.anchor,
          served: list.length,
          acceptable: ok,
        });
      }
      metrics[source] = {
        served,
        acceptable,
        unlabeled,
        precision: served ? +(acceptable / served).toFixed(3) : 0,
        coverageAnchors: coverage,
        coverageRate: +(coverage / results.length).toFixed(3),
        yield: +(acceptable / results.length).toFixed(2),
        band1Promotions: satisfiesCount,
        perAnchor,
      };
    }

    // ---- report ----
    out('');
    out(
      'SOURCE | served | precision | coverage(>=3) | yield | band-1 (satisfies)',
    );
    for (const source of ['A', 'B', 'C'] as Source[]) {
      const m = metrics[source] as Record<string, number>;
      out(
        `  ${source}    | ${String(m.served).padStart(6)} | ${String(
          m.precision,
        ).padStart(9)} | ${String(
          `${m.coverageAnchors}/${results.length}`,
        ).padStart(
          13,
        )} | ${String(m.yield).padStart(5)} | ${m.band1Promotions}`,
      );
    }
    out('');
    for (const r of results) {
      out(
        `--- ${r.anchor} (denseRaw ${r.denseRaw}, storedRejects ${r.storedRejects})`,
      );
      if (r.rejectsInRawRing.length) {
        out(
          `    REJECTS IN TODAY'S SERVED RING: ${r.rejectsInRawRing.join(', ')}`,
        );
      }
      for (const source of ['A', 'B', 'C'] as Source[]) {
        out(
          `  ${source}: ${r.sets[source]
            .map((c) => `${c.name}[${label(r.anchorId, c) ?? '?'}]`)
            .join(', ')}`,
        );
      }
    }

    fs.writeFileSync(
      RESULT_PATH,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          cut: CUT,
          topN: TOP_N,
          anchors: ANCHORS,
          freshlyJudgedPairs: judged,
          llmCalls: calls,
          metrics,
          perAnchorSets: results.map((r) => ({
            anchor: r.anchor,
            denseRaw: r.denseRaw,
            storedRejects: r.storedRejects,
            rejectsInRawRing: r.rejectsInRawRing,
            sets: Object.fromEntries(
              (['A', 'B', 'C'] as Source[]).map((s) => [
                s,
                r.sets[s].map((c) => ({
                  name: c.name,
                  label: label(r.anchorId, c) ?? null,
                })),
              ]),
            ),
          })),
          verdictCache: Object.fromEntries(verdicts),
        },
        null,
        2,
      )}\n`,
    );
    out(`\nwrote ${RESULT_PATH}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
