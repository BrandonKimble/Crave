/**
 * @script-class: probe
 * @finding: see the RECORDED RESULT block at the bottom of this header.
 *
 * THE MARKET-LAUNCH GATE RUNNER (plans/multilingual.md, ROUND 3 "MARKET-
 * LAUNCH GATE" + ratified D3).
 *
 * D3 ruled ONE artifact serves both M4 dense calibration and the launch
 * gate: `gold-corpus/<lang>.json` — a stratified ~150-query set with
 * expectations authored against the mirror's REAL vocabulary. This file is
 * the mechanical half: it drives the PRODUCTION interpretation path
 * (SearchQueryInterpretationService.interpret — the same call the API
 * makes) once per gold entry and scores the parse against the four gate
 * thresholds.
 *
 * WHY THE PARSE, NOT THE RESULT SET: the gate's own words — "≥90%
 * constraint preservation measured on the PARSE". A ranked result list is
 * a function of corpus density and would move under us every reload; the
 * parse is the thing i18n actually owns. The LLM spot-check
 * (`--grade`, D3's second half) is what keeps the parse honest about
 * whether a Spanish speaker would be satisfied.
 *
 * THRESHOLDS (verbatim from the plan):
 *   ≥95% top-1 overall ................. aspiration
 *   100% negation non-inversion ........ HARD
 *   ≥90% constraint preservation ....... on the parse
 *   0 homograph mis-groundings @≥0.95 .. in the spine
 *
 * A RED IS A FINDING, NOT A FAILURE OF THE RUNNER. Every red prints its
 * own diagnostic (what grounded, what was excluded, what parked, what the
 * analyzer decided) so the owning plan item is readable off the output.
 *
 * READ-ONLY except for the run artifact it writes next to the corpus.
 * The dense tier makes real embedding calls (~free, fractions of a cent).
 *
 * USAGE
 *   yarn workspace api ts-node scripts/search-harness/run-launch-gate.ts
 *   ... --lang=es          (default es)
 *   ... --only=hg,ng       (stratum prefixes; comma-separated)
 *   ... --grade            (D3 LLM spot-check: ONE batched Flash-Lite call)
 *
 * RECORDED RESULT — FIRST GATE RUN, 2026-08-04, dev mirror crave_search
 * (full per-query detail in gold-corpus/es.result.json):
 *
 *   single_noun    40  24  60.0%      negation       20  20  100.0%
 *   compound       30  13  43.3%      attribute      20  14   70.0%
 *   homograph      20  13  65.0%      code_switched  20  20  100.0%
 *   OVERALL       150 104  69.3%
 *
 *   RED   top-1 (single-concept strata) ≥95% ....... 71.0%
 *   GREEN negation NON-INVERSION = 100% (HARD) ..... 100.0% (20/20)
 *   RED   constraint preservation ≥90% ............. 60.0%
 *   RED   homograph mis-grounding @≥0.95 = 0 ....... 2 (tuna, pie)
 *         ...plus 9 more via the FUZZY linker (different defect)
 *
 * THE LARGEST SINGLE FINDING (19 of 46 reds): the dense tier is gated on
 * `!linked`, so a FUZZY SPARSE SUBSTRING LINK PRE-EMPTS IT — "camarones"
 * links "camarones enchilados" and dense never fires, so it never reaches
 * shrimp. Dense only ran where sparse found literally nothing. The plan's
 * 15/15 embedding experiment measured the embeddings; this measures the
 * ADMISSION PATH, and they are not the same thing.
 *
 * D3 LLM spot check: 18 items, 1 batched Flash-Lite call, 100% agreement
 * with the mechanical verdicts (~$0.00045).
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { bootstrap, out } from './_shared';
import { SearchQueryInterpretationService } from '../../src/modules/search/search-query-interpretation.service';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EntityType } from '@prisma/client';
import { canonicalFold } from '../../src/modules/content-processing/entity-resolver/entity-identity';

type Stratum =
  | 'single_noun'
  | 'compound'
  | 'negation'
  | 'attribute'
  | 'homograph'
  | 'code_switched';

interface GoldEntry {
  id: string;
  query: string;
  stratum: Stratum;
  /** Per-entry override; otherwise the corpus-level locale. */
  locale?: string;
  expected: {
    concepts: string[];
    mustNotResolve: string[];
  };
  park: boolean;
  notes: string;
  /**
   * A translation-bridge single-noun (camarones→shrimp) whose CORRECT answer
   * is a source-faithful compositional dish ("camarones enchilados"), not the
   * abstract English concept. When set, a grounded FOOD whose folded name
   * CONTAINS the query lemma as a whole token satisfies the concept — see the
   * scoring branch for the type + whole-token guards that keep this honest.
   */
  allowCompositional?: boolean;
}

interface GoldCorpus {
  locale: string;
  version: number;
  entries: GoldEntry[];
}

/** Buckets in the structured request, and the entity type each implies. */
const BUCKETS: Array<[string, string]> = [
  ['restaurants', 'restaurant'],
  ['food', 'food'],
  ['foodAttributes', 'food_attribute'],
  ['restaurantAttributes', 'restaurant_attribute'],
  ['ingredients', 'ingredient'],
];

const ATTRIBUTE_TYPES = new Set(['food_attribute', 'restaurant_attribute']);

const GAZETTEER_TYPES: EntityType[] = [
  'food',
  'ingredient',
  'food_attribute',
  'restaurant_attribute',
  'restaurant',
] as EntityType[];

interface Grounded {
  entityId: string;
  name: string;
  type: string;
  bucket: string;
  /** The query text that produced this grounding. */
  span: string;
  /**
   * HOW it grounded — the distinction the gate's homograph threshold turns
   * on. The plan counts "mis-groundings at confidence ≥0.95 in the spine":
   * a GAZETTEER hit is an exact-string claim at confidence 1.0 (placement
   * sets confidence: 1, resolutionTier 'exact'), and only the M3 locale
   * filter can stop it. A LINKED hit came from the residue lane's fuzzy /
   * dense probe, which is a FLOORS and type-admission problem (R5-4) —
   * different defect, different owner. The structured DTO carries neither,
   * so we re-derive by asking the gazetteer what it saw.
   */
  tier: 'gazetteer-exact' | 'linked';
  /** canonicalFold(name) — the folded token set the compositional check
   *  compares against, so accented query lemmas match and the comparison uses
   *  the same fold the gazetteer's N1 law does. */
  foldedName: string;
}

interface EntryResult {
  id: string;
  query: string;
  stratum: Stratum;
  locale: string;
  pass: boolean;
  /** Fraction of expected concepts present (constraint preservation). */
  preservation: number;
  reasons: string[];
  grounded: Grounded[];
  unresolved: string[];
  analysis: unknown;
  /** Homograph stratum only: names grounded outside the allowed set. */
  misGroundings: string[];
  notes: string;
}

function parseArgs(): { lang: string; only: string[]; grade: boolean } {
  const argv = process.argv.slice(2);
  const get = (flag: string) =>
    argv.find((a) => a.startsWith(`--${flag}=`))?.split('=')[1] ?? null;
  return {
    lang: get('lang') ?? 'es',
    only: (get('only') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    grade: argv.includes('--grade'),
  };
}

/** Canonical-name comparison is FOLDED on both sides — the same law the
 *  gazetteer follows (N1). "romántico" and "romantico" are one name. */
const norm = (s: string) => canonicalFold(s);

async function main(): Promise<void> {
  const args = parseArgs();
  const corpusPath = path.join(__dirname, 'gold-corpus', `${args.lang}.json`);
  if (!fs.existsSync(corpusPath)) {
    throw new Error(`No gold corpus at ${corpusPath}`);
  }
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as GoldCorpus;
  const entries = args.only.length
    ? corpus.entries.filter((e) =>
        args.only.some((p) => e.id.startsWith(p) || e.stratum.startsWith(p)),
      )
    : corpus.entries;

  const app = await bootstrap();
  const interpretation = app.get(SearchQueryInterpretationService);
  const entityTextSearch = app.get(EntityTextSearchService);
  const prisma = app.get(PrismaService);

  const results: EntryResult[] = [];
  const startedAt = Date.now();

  for (const entry of entries) {
    const locale = entry.locale ?? corpus.locale;
    let interpreted: Awaited<
      ReturnType<SearchQueryInterpretationService['interpret']>
    >;
    try {
      interpreted = await interpretation.interpret({
        query: entry.query,
        locale,
      } as never);
    } catch (error) {
      results.push({
        id: entry.id,
        query: entry.query,
        stratum: entry.stratum,
        locale,
        pass: false,
        preservation: 0,
        reasons: [
          `THREW: ${error instanceof Error ? error.message : String(error)}`,
        ],
        grounded: [],
        unresolved: [],
        analysis: null,
        misGroundings: [],
        notes: entry.notes,
      });
      continue;
    }

    // ── Resolve the parse into canonical names ──────────────────────────
    const raw = interpreted.structuredRequest.entities as
      | Record<
          string,
          Array<{ entityIds: string[]; originalText: string }> | undefined
        >
      | undefined;
    const pending: Array<{
      entityId: string;
      bucket: string;
      type: string;
      span: string;
    }> = [];
    for (const [bucket, type] of BUCKETS) {
      for (const item of raw?.[bucket] ?? []) {
        for (const entityId of item.entityIds ?? []) {
          pending.push({ entityId, bucket, type, span: item.originalText });
        }
      }
    }
    const ids = Array.from(new Set(pending.map((p) => p.entityId)));
    const nameById = new Map<string, string>();
    if (ids.length) {
      const rows = await prisma.$queryRawUnsafe<
        { entity_id: string; name: string }[]
      >(
        `SELECT entity_id::text, name FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
        ids,
      );
      for (const r of rows) nameById.set(r.entity_id, r.name);
    }
    // Which of these ids the GAZETTEER itself claimed (exact, confidence 1.0).
    const exactIds = new Set(
      (
        await entityTextSearch.scanForKnownEntityGroups(
          entry.query,
          GAZETTEER_TYPES,
          { requestLocale: locale },
        )
      ).flatMap((g) => g.entities.map((e) => e.entityId)),
    );
    const grounded: Grounded[] = pending.map((p) => ({
      ...p,
      name: nameById.get(p.entityId) ?? `<${p.entityId}>`,
      tier: exactIds.has(p.entityId)
        ? ('gazetteer-exact' as const)
        : ('linked' as const),
      foldedName: canonicalFold(nameById.get(p.entityId) ?? ''),
    }));
    const groundedNames = new Set(grounded.map((g) => norm(g.name)));
    const attributeNames = new Set(
      grounded
        .filter((g) => ATTRIBUTE_TYPES.has(g.type))
        .map((g) => norm(g.name)),
    );
    const unresolved = interpreted.unresolved.flatMap((u) => u.terms);

    // ── Score ───────────────────────────────────────────────────────────
    const want = entry.expected.concepts.map(norm);
    const present = want.filter((w) => groundedNames.has(w));
    const preservation = want.length ? present.length / want.length : 1;
    const reasons: string[] = [];
    let pass: boolean;
    let misGroundings: string[] = [];

    // The one assertion EVERY stratum shares: nothing forbidden may ground.
    const forbidden = entry.expected.mustNotResolve
      .map(norm)
      .filter((m) => groundedNames.has(m));
    if (forbidden.length) {
      reasons.push(`FORBIDDEN GROUNDING: ${forbidden.join(', ')}`);
    }

    if (entry.stratum === 'homograph') {
      // INVERTED RULE: the grounded set must be a SUBSET of what the entry
      // allows. Empty (a clean park) passes. Anything else is a confident
      // wrong-language grounding — the exact thing the gate counts.
      const allowed = new Set(want);
      misGroundings = Array.from(
        new Set(
          grounded
            .filter((g) => !allowed.has(norm(g.name)))
            .map((g) => `${g.name}[${g.tier}]`),
        ),
      );
      pass = misGroundings.length === 0;
      if (!pass) {
        reasons.push(
          `MIS-GROUNDED (outside allowed set): ${misGroundings.join(', ')}`,
        );
      } else if (!grounded.length) {
        reasons.push('clean park (safe)');
      }
    } else if (entry.stratum === 'negation') {
      // HARD CLAUSE (negation v2 = literal ignore): the mentioned word
      // grounds POSITIVELY (head preservation) and nothing on
      // mustNotResolve is grounded (non-inversion). No exclusion is ever
      // recorded — exclusions do not exist in the product.
      const headOk = entry.park || preservation === 1;
      if (!headOk) {
        reasons.push(
          `head not grounded: missing ${want.filter((w) => !groundedNames.has(w)).join(', ')}`,
        );
      }
      pass = forbidden.length === 0 && (headOk || entry.park);
    } else if (entry.stratum === 'attribute') {
      // Grounding the right WORD to a food entity of the same name is a
      // TYPE MISS, reported distinctly — "vegan" exists as food AND
      // food_attribute, and only the attribute is filterable.
      const missing = want.filter((w) => !attributeNames.has(w));
      pass = forbidden.length === 0 && missing.length === 0;
      if (missing.length) {
        const wrongType = missing.filter((m) => groundedNames.has(m));
        if (wrongType.length) {
          reasons.push(
            `TYPE MISS (grounded, not as an attribute): ${wrongType.join(', ')}`,
          );
        }
        const absent = missing.filter((m) => !groundedNames.has(m));
        if (absent.length) reasons.push(`NOT GROUNDED: ${absent.join(', ')}`);
      }
    } else {
      // single_noun / compound / code_switched: every expected concept must
      // be present in the parse. COMPOSITIONAL ACCEPTANCE (run-2 parent
      // ruling): for translation-bridge nouns, a grounded FOOD whose folded
      // name contains the query lemma is the right answer — a Spanish speaker
      // searching "camarones" who gets camarones dishes got shrimp.
      //
      // THREE guards keep this from being a fig leaf (i18n red team, agent 3):
      //   (1) TYPE — only a food/ingredient may satisfy it, never a
      //       restaurant/attribute. Without this a restaurant "Camarones El
      //       Güero" passed the shrimp query on its name.
      //   (2) WHOLE TOKEN — the query lemma must be a whole token of the
      //       grounded food's FOLDED name, not an arbitrary substring.
      //       Without this "repollo" (cabbage) passed "pollo" (chicken).
      //   (3) FOLDED both sides — compare canonicalFold(query) tokens against
      //       canonicalFold(name) tokens, so accented lemmas ("camarón") match
      //       and the fold is the gazetteer's N1 fold, not a raw lowercase.
      const COMPOSITIONAL_TYPES = new Set(['food', 'ingredient']);
      const queryLemmas = new Set(
        norm(entry.query)
          .split(' ')
          .filter((t) => t.length >= 4),
      );
      const compositionalHit =
        entry.allowCompositional === true &&
        queryLemmas.size > 0 &&
        grounded.some(
          (g) =>
            COMPOSITIONAL_TYPES.has(g.type) &&
            g.foldedName.split(' ').some((tok) => queryLemmas.has(tok)),
        );
      const missing = want.filter((w) => !groundedNames.has(w));
      const ok =
        missing.length === 0 ||
        compositionalHit ||
        (entry.park && grounded.length === 0);
      pass = forbidden.length === 0 && ok;
      if (missing.length && !ok)
        reasons.push(`NOT GROUNDED: ${missing.join(', ')}`);
      if (missing.length && ok) reasons.push('parked (allowed for this entry)');
    }

    results.push({
      id: entry.id,
      query: entry.query,
      stratum: entry.stratum,
      locale,
      pass,
      preservation,
      reasons,
      grounded,
      unresolved,
      analysis: interpreted.queryAnalysis,
      misGroundings,
      notes: entry.notes,
    });
  }

  await app.close();

  // ── SCOREBOARD ────────────────────────────────────────────────────────
  const strata: Stratum[] = [
    'single_noun',
    'compound',
    'negation',
    'attribute',
    'homograph',
    'code_switched',
  ];
  const pct = (n: number, d: number) => (d ? (100 * n) / d : 100);
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  out('');
  out(
    `=== LAUNCH GATE — ${args.lang} — ${results.length} queries — ${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s ===`,
  );
  out('');
  out('stratum          n   pass  rate     preservation');
  out('---------------------------------------------------');
  for (const s of strata) {
    const rows = results.filter((r) => r.stratum === s);
    if (!rows.length) continue;
    const p = rows.filter((r) => r.pass).length;
    const pres =
      rows.reduce((a, r) => a + r.preservation, 0) / (rows.length || 1);
    out(
      `${s.padEnd(15)} ${String(rows.length).padStart(3)}  ${String(p).padStart(4)}  ${fmtPct(
        pct(p, rows.length),
      ).padStart(6)}   ${fmtPct(100 * pres).padStart(6)}`,
    );
  }
  const totalPass = results.filter((r) => r.pass).length;
  out('---------------------------------------------------');
  out(
    `${'OVERALL'.padEnd(15)} ${String(results.length).padStart(3)}  ${String(
      totalPass,
    ).padStart(4)}  ${fmtPct(pct(totalPass, results.length)).padStart(6)}`,
  );

  // ── THRESHOLD VERDICTS ────────────────────────────────────────────────
  // Each is stated as (measured vs threshold) so a red is a NUMBER, never
  // an adjective.
  const singleConcept = results.filter((r) =>
    ['single_noun', 'attribute', 'homograph', 'code_switched'].includes(
      r.stratum,
    ),
  );
  const top1 = pct(
    singleConcept.filter((r) => r.pass).length,
    singleConcept.length,
  );
  const negation = results.filter((r) => r.stratum === 'negation');
  const inversions = negation.filter((r) =>
    r.reasons.some((x) => x.startsWith('FORBIDDEN GROUNDING')),
  );
  const nonInversion = pct(
    negation.length - inversions.length,
    negation.length,
  );
  const compounds = results.filter((r) => r.stratum === 'compound');
  const constraintPreservation =
    (100 * compounds.reduce((a, r) => a + r.preservation, 0)) /
    (compounds.length || 1);
  const homographMis = results
    .filter((r) => r.stratum === 'homograph')
    .flatMap((r) => r.misGroundings.map((m) => `${r.query}→${m}`));
  // The plan's threshold is specifically "@ conf ≥0.95" — a gazetteer-exact
  // hit IS confidence 1.0; a linked hit is not, and is a different bug.
  const homographMisExact = homographMis.filter((m) =>
    m.endsWith('[gazetteer-exact]'),
  );

  // Tri-state: an UNMEASURED clause (empty denominator — an --only filter, an
  // empty stratum) prints 'N/A ', never GREEN. pct(n,0)=100 would otherwise
  // paint a hard clause green on zero evidence, the exact "a metric that can
  // only show green is lying" failure the gate exists to prevent.
  const verdict = (
    label: string,
    measured: string,
    ok: boolean,
    measured_n: number,
  ) =>
    out(
      `${measured_n === 0 ? 'N/A ' : ok ? 'GREEN' : ' RED '}  ${label.padEnd(46)} ${measured}`,
    );

  out('');
  out('=== THRESHOLD VERDICTS ===');
  verdict(
    'top-1 overall (single-concept strata) ≥95%',
    `${fmtPct(top1)} (${singleConcept.filter((r) => r.pass).length}/${singleConcept.length})`,
    top1 >= 95,
    singleConcept.length,
  );
  verdict(
    'negation NON-INVERSION = 100% (HARD)',
    `${fmtPct(nonInversion)} (${negation.length - inversions.length}/${negation.length})`,
    nonInversion >= 100,
    negation.length,
  );
  verdict(
    'constraint preservation on the PARSE ≥90%',
    fmtPct(constraintPreservation),
    constraintPreservation >= 90,
    compounds.length,
  );
  verdict(
    'homograph mis-groundings @ conf≥0.95 = 0',
    `${homographMisExact.length}  [${homographMisExact.join(', ') || 'none'}]`,
    homographMisExact.length === 0,
    results.filter((r) => r.stratum === 'homograph').length,
  );
  out(
    `       ${'homograph mis-groundings via the FUZZY linker'.padEnd(46)} ${
      homographMis.length - homographMisExact.length
    } (R5-4 floors/type admission, not the M3 locale filter)`,
  );
  // Reported alongside the hard clause because they are DIFFERENT defects:
  // an inversion is wrong-and-confident; an unrecorded constraint is a
  // dropped constraint. The plan's 100% clause is the former.
  const unrecorded = negation.filter((r) =>
    r.reasons.some((x) => x.startsWith('CONSTRAINT NOT RECORDED')),
  );
  out(
    `       ${'negation constraints RECORDED (informational)'.padEnd(46)} ${
      negation.length - unrecorded.length
    }/${negation.length}`,
  );

  // ── FAILURE LIST ──────────────────────────────────────────────────────
  const failures = results.filter((r) => !r.pass);
  out('');
  out(`=== FAILURES (${failures.length}) ===`);
  for (const f of failures) {
    out('');
    out(`[${f.id}] ${f.stratum}  "${f.query}"  (locale ${f.locale})`);
    out(`  reasons   : ${f.reasons.join(' | ') || '(none recorded)'}`);
    out(
      `  grounded  : ${
        f.grounded.length
          ? f.grounded
              .map((g) => `${g.span}→${g.name}(${g.type},${g.tier})`)
              .join(', ')
          : '(nothing)'
      }`,
    );
    if (f.unresolved.length) out(`  unresolved: ${f.unresolved.join(', ')}`);
    out(`  analysis  : ${JSON.stringify(f.analysis)}`);
    out(`  gold note : ${f.notes}`);
  }

  const artifact = path.join(
    __dirname,
    'gold-corpus',
    `${args.lang}.result.json`,
  );
  fs.writeFileSync(
    artifact,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        lang: args.lang,
        corpusVersion: corpus.version,
        scoreboard: {
          overall: pct(totalPass, results.length),
          top1SingleConcept: top1,
          negationNonInversion: nonInversion,
          constraintPreservation,
          homographMisGroundings: homographMis,
          homographMisGroundingsExact: homographMisExact,
        },
        results,
      },
      null,
      2,
    )}\n`,
  );
  out('');
  out(`run artifact → ${artifact}`);

  if (args.grade) await gradeSpotCheck(results, artifact);
}

/**
 * D3's second half: an LLM SPOT CHECK, deliberately kept separate from the
 * mechanical assertions so the two can DISAGREE — agreement is the number
 * worth having. 20 random single-noun/compound results, ONE batched
 * Flash-Lite call, scored 0-100 with a one-line reason.
 *
 * Its question is NOT "did the parse match the gold file" (that is already
 * measured, and the grader would just re-derive it). It is "would a
 * Spanish speaker who typed this be satisfied with these concepts?" — the
 * only check that can catch a gold-set AUTHORING error.
 */
async function gradeSpotCheck(
  results: EntryResult[],
  artifactPath: string,
): Promise<void> {
  const pool = results.filter((r) =>
    ['single_noun', 'compound'].includes(r.stratum),
  );
  // Deterministic sample (the gate must be reproducible run to run).
  const sample = [...pool]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((_, i) => i % Math.ceil(pool.length / 20) === 0)
    .slice(0, 20);

  // Same env var the app's LLM config reads (`llm.apiKey` ← LLM_API_KEY).
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    out('');
    out('--grade requested but LLM_API_KEY is unset — skipping.');
    return;
  }

  const items = sample.map((r) => ({
    id: r.id,
    query: r.query,
    concepts: r.grounded.map((g) => `${g.name} (${g.type})`),
    unresolved: r.unresolved,
  }));

  const prompt = [
    'You are a native Spanish speaker evaluating a restaurant/dish search engine.',
    'For each item you get the SPANISH QUERY the user typed and the CONCEPTS the',
    'engine understood it as (English canonical names from its catalogue), plus any',
    'constraints it recorded as EXCLUDED and any words it left UNRESOLVED.',
    '',
    'Score 0-100: would a Spanish speaker who typed this query be satisfied that the',
    'engine understood them? 100 = understood exactly. 50 = partially (got the dish,',
    'dropped a constraint). 0 = understood something WRONG (a different food, or the',
    'opposite of what was asked). Leaving a word unresolved is BETTER than a confident',
    'wrong answer: score an honest miss ~40, a confident wrong answer ~0.',
    '',
    'Return ONLY a JSON array: [{"id":"...","score":0-100,"reason":"one line"}]',
    '',
    JSON.stringify(items, null, 1),
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    },
  );
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: Record<string, number>;
    error?: { message?: string };
  };
  if (body.error) {
    out(`--grade failed: ${body.error.message}`);
    return;
  }
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  let graded: Array<{ id: string; score: number; reason: string }> = [];
  try {
    graded = JSON.parse(text);
  } catch {
    out(`--grade: unparseable response: ${text.slice(0, 400)}`);
    return;
  }

  out('');
  out(`=== D3 LLM SPOT CHECK (${graded.length} items, 1 batched call) ===`);
  out('id      mech  llm  query / reason');
  let agree = 0;
  for (const g of graded) {
    const r = sample.find((s) => s.id === g.id);
    if (!r) continue;
    // AGREEMENT RULE: the mechanical verdict is binary, the LLM's is a
    // score. They agree when pass↔score≥70 and fail↔score<70.
    const llmPass = g.score >= 70;
    if (llmPass === r.pass) agree += 1;
    out(
      `${g.id.padEnd(7)} ${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${String(
        g.score,
      ).padStart(3)}  "${r.query}" — ${g.reason}`,
    );
  }
  out('');
  out(
    `agreement with mechanical assertions: ${agree}/${graded.length} (${(
      (100 * agree) /
      (graded.length || 1)
    ).toFixed(0)}%)`,
  );
  const usage = body.usageMetadata ?? {};
  out(
    `ledger estimate: 1 call, in=${usage.promptTokenCount ?? '?'} out=${
      usage.candidatesTokenCount ?? '?'
    } tokens (gemini-flash-lite) ≈ $${(
      ((usage.promptTokenCount ?? 0) * 0.1 +
        (usage.candidatesTokenCount ?? 0) * 0.4) /
      1_000_000
    ).toFixed(5)}`,
  );

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  artifact.llmSpotCheck = { graded, agreement: agree / (graded.length || 1) };
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
