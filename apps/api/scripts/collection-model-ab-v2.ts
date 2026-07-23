import 'dotenv/config';
// 'worker': AppModule no longer boots under role 'api' (CollectionSchedulerService
// depends on worker-gated CollectionJobSchedulerService). Scheduler stays inert:
// COLLECTION_SCHEDULER_ENABLED=false in .env.
process.env.PROCESS_ROLE ||= 'worker';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import type {
  LLMMention,
  LLMProcessingInput,
} from '../src/modules/external-integrations/llm/llm.types';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * collection-model-ab-v2.ts — MODEL QUALITY A/B for the collection pipeline.
 *
 * Unlike v1 (mention counts on 6 posts), this measures QUALITY on a 150-post
 * stratified sample of already-processed austinfood extraction inputs, with the
 * EXACT stored input payloads (collection_extraction_inputs.input_payload +
 * source_map), through the real interactive processContent path (same prompt,
 * schema, thinking, source_id enum). Model selection = LLM_MODEL env, exactly
 * how production config picks the content model (config/configuration.ts).
 *
 * Usage:
 *   # 1. generate one output file per model (deterministic shared sample)
 *   LLM_MODEL=gemini-3.5-flash        MODEL_TAG=g35 MODE=generate yarn ts-node scripts/collection-model-ab-v2.ts
 *   LLM_MODEL=gemini-3-flash-preview  MODEL_TAG=g3  MODE=generate yarn ts-node scripts/collection-model-ab-v2.ts
 *   # cheap probe: lite on the medium stratum only
 *   LLM_MODEL=gemini-3.1-flash-lite-preview MODEL_TAG=g31lite STRATA=medium MODE=generate yarn ts-node scripts/collection-model-ab-v2.ts
 *
 *   # 2. quality analysis (string metrics + blind LLM judge for fuzzy cases)
 *   MODE=analyze TAGS=g35,g3 LITE_TAG=g31lite yarn ts-node scripts/collection-model-ab-v2.ts
 *
 * Metrics: attribution correctness (60-mention/model blind-judged sample),
 * fabrication rate (restaurant absent from whole thread), canonicalization
 * dupes (token-subset variants per post), disagreement analysis (40-item
 * judged sample of one-model-only restaurants), source_id validity, and cost
 * per 1k posts at official batch rates.
 */

const OUT_DIR = path.join(__dirname, '../scratchpad');
const PER_STRATUM = Number(process.env.PER_STRATUM ?? 50);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const JUDGE_MODEL = 'gemini-3-flash-preview';
const ATTR_SAMPLE = Number(process.env.ATTR_SAMPLE ?? 60);
const DISAGREE_SAMPLE = Number(process.env.DISAGREE_SAMPLE ?? 40);

// Official batch prices, $/1M tokens (owner-provided 2026-07-11).
const BATCH_PRICES: Record<string, { in: number; out: number }> = {
  'gemini-3.5-flash': { in: 0.75, out: 4.5 },
  'gemini-3-flash-preview': { in: 0.25, out: 1.5 },
  'gemini-3.1-flash-lite-preview': { in: 0.125, out: 0.75 },
};

type Stratum = 'small' | 'medium' | 'large';

interface SampleRow {
  input_id: string;
  input_payload: unknown;
  source_map: unknown;
  n_comments: number;
  stratum: Stratum;
}

interface PostResult {
  inputId: string;
  stratum: Stratum;
  sourceRefs: string[];
  threadText: string;
  mentions: LLMMention[];
  tokens: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  } | null;
  error?: string;
}

interface RunFile {
  model: string;
  tag: string;
  strata: Stratum[];
  results: PostResult[];
}

const out = (m = '') => process.stdout.write(`${m}\n`);

// Deterministic PRNG so sampling is reproducible across runs/models.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample<T>(items: T[], n: number, seed: number): T[] {
  const rnd = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  '&',
  'at',
  'on',
  'in',
  'restaurant',
  'cafe',
  'bar',
  'grill',
  'kitchen',
  'atx',
  'austin',
  'tx',
  'co',
  'company',
]);

function nameTokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function threadTextOf(payload: unknown): string {
  const posts = (payload as { posts?: any[] })?.posts ?? [];
  const parts: string[] = [];
  for (const p of posts) {
    parts.push(p?.title ?? '', p?.content ?? '');
    for (const c of p?.comments ?? []) parts.push(c?.content ?? '');
  }
  return parts.join('\n');
}

/**
 * Containment tiers for "does this restaurant appear in the thread?"
 *  exact  — full normalized name (or surface) is a substring of the thread
 *  token  — every significant name token appears in the thread
 *  none   — no significant token appears at all (fabrication candidate)
 *  fuzzy  — in between (some tokens hit): needs the judge
 */
function containmentTier(
  mention: LLMMention,
  normThread: string,
): 'exact' | 'token' | 'fuzzy' | 'none' {
  const candidates = [mention.restaurant, mention.restaurant_surface ?? '']
    .map(normalize)
    .filter(Boolean);
  for (const c of candidates) {
    if (c && normThread.includes(c)) return 'exact';
  }
  const tokens = nameTokens(mention.restaurant ?? '');
  if (!tokens.length) return 'fuzzy';
  const hits = tokens.filter((t) => normThread.includes(t)).length;
  if (hits === tokens.length) return 'token';
  if (hits === 0) return 'none';
  return 'fuzzy';
}

// ---------------------------------------------------------------------------
// MODE=generate
// ---------------------------------------------------------------------------

async function fetchSample(
  prisma: PrismaService,
  strata: Stratum[],
): Promise<SampleRow[]> {
  // Deterministic: austinfood inputs with stored raw_output, ordered by
  // input_id, first PER_STRATUM per stratum. Same query => same sample for
  // every model run.
  const rows = await prisma.$queryRawUnsafe<SampleRow[]>(
    `WITH a AS (
       SELECT i.input_id::text, i.input_payload, i.source_map,
              jsonb_array_length(i.input_payload->'posts'->0->'comments') AS n_comments
       FROM collection_extraction_inputs i
       WHERE i.raw_output IS NOT NULL
         AND jsonb_array_length(i.input_payload->'posts') = 1
         AND EXISTS (
           SELECT 1 FROM collection_source_documents d
           WHERE d.source_id = i.source_map->'SRC001'->>'canonical_id'
             AND d.community = 'austinfood')
     ), b AS (
       SELECT *, CASE WHEN n_comments < 5 THEN 'small'
                      WHEN n_comments <= 20 THEN 'medium'
                      ELSE 'large' END AS stratum,
              row_number() OVER (
                PARTITION BY CASE WHEN n_comments < 5 THEN 'small'
                                  WHEN n_comments <= 20 THEN 'medium'
                                  ELSE 'large' END
                ORDER BY input_id) AS rn
       FROM a
     )
     SELECT input_id, input_payload, source_map, n_comments, stratum
     FROM b WHERE rn <= ${PER_STRATUM}
     ORDER BY input_id`,
  );
  return rows.filter((r) => strata.includes(r.stratum));
}

async function generate(tag: string, strata: Stratum[]): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);
    out(`model=${llm.getContentModel()} tag=${tag} strata=${strata.join(',')}`);

    const sample = await fetchSample(prisma, strata);
    out(`sample: ${sample.length} inputs`);

    const results: PostResult[] = new Array(sample.length);
    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < sample.length) {
        const idx = cursor++;
        const row = sample[idx];
        const payload = row.input_payload as { posts: any[] };
        const sourceMap = row.source_map as Record<string, unknown>;
        const input = {
          ...payload,
          source_map: sourceMap,
        } as LLMProcessingInput;
        const base = {
          inputId: row.input_id,
          stratum: row.stratum,
          sourceRefs: Object.keys(sourceMap ?? {}),
          threadText: threadTextOf(payload),
        };
        try {
          const output = await llm.processContent(input);
          results[idx] = {
            ...base,
            mentions: output.mentions,
            tokens: (output.usageMetadata as PostResult['tokens']) ?? null,
          };
        } catch (e) {
          results[idx] = {
            ...base,
            mentions: [],
            tokens: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
        done++;
        if (done % 10 === 0) out(`  ${done}/${sample.length}`);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, sample.length) }, worker),
    );

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `model-ab-v2-${tag}.json`);
    const run: RunFile = { model: llm.getContentModel(), tag, strata, results };
    fs.writeFileSync(file, JSON.stringify(run, null, 2));
    const errs = results.filter((r) => r.error).length;
    out(`wrote ${file} (${results.length} posts, ${errs} errors)`);
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// MODE=analyze
// ---------------------------------------------------------------------------

function loadRun(tag: string): RunFile {
  return JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, `model-ab-v2-${tag}.json`), 'utf8'),
  ) as RunFile;
}

interface JudgeCase {
  id: string;
  thread: string;
  restaurant: string;
  food: string | null;
  question: 'attribution' | 'real_recommendation';
}

async function judgeBatch(
  genAI: GoogleGenAI,
  cases: JudgeCase[],
): Promise<Map<string, { verdict: boolean; reason: string }>> {
  const results = new Map<string, { verdict: boolean; reason: string }>();
  const chunks: JudgeCase[][] = [];
  for (let i = 0; i < cases.length; i += 8) chunks.push(cases.slice(i, i + 8));
  for (const chunk of chunks) {
    const prompt = [
      'You are auditing restaurant-mention extractions from Reddit food threads.',
      'For each case, answer the QUESTION strictly from the THREAD text.',
      '- attribution: does the thread actually name or clearly imply this restaurant',
      '  (and, if a food is given, associate that food with it)? Nicknames,',
      '  abbreviations, misspellings, and partial names in the thread count as naming it.',
      '- real_recommendation: is this restaurant genuinely mentioned/recommended in the',
      '  thread such that a correct extractor SHOULD have produced it (true), or is it',
      '  absent/hallucinated/only-negated (false)?',
      'Return STRICT JSON: [{"id":"...","verdict":true|false,"reason":"<10 words"}]',
      '',
      ...chunk.map((c) =>
        JSON.stringify({
          id: c.id,
          question: c.question,
          restaurant: c.restaurant,
          food: c.food,
          thread: c.thread.slice(0, 12000),
        }),
      ),
    ].join('\n');
    const resp = await genAI.models.generateContent({
      model: JUDGE_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    try {
      const parsed = JSON.parse(resp.text ?? '[]') as {
        id: string;
        verdict: boolean;
        reason: string;
      }[];
      for (const p of parsed)
        results.set(p.id, { verdict: !!p.verdict, reason: p.reason });
    } catch {
      out(`  judge parse failure on a chunk (${chunk.length} cases skipped)`);
    }
  }
  return results;
}

interface ModelQuality {
  tag: string;
  model: string;
  posts: number;
  errors: number;
  mentions: number;
  mentionsPerPost: number;
  sourceIdValidPct: number;
  fabricationPct: number; // tier 'none'
  exactContainmentPct: number;
  attributionSampled: number;
  attributionAccuracyPct: number;
  canonDupesPerPost: number;
  tokensInPerPost: number;
  tokensCachedPerPost: number;
  tokensOutPerPost: number; // candidates + thoughts
  costPer1kPostsBatch: number;
}

function baseQuality(run: RunFile): {
  q: Omit<ModelQuality, 'attributionSampled' | 'attributionAccuracyPct'>;
  fuzzyCases: { key: string; r: PostResult; m: LLMMention }[];
  allMentions: { r: PostResult; m: LLMMention; tier: string }[];
} {
  const ok = run.results.filter((r) => !r.error);
  const allMentions: { r: PostResult; m: LLMMention; tier: string }[] = [];
  let validSource = 0;
  let dupePairs = 0;
  const fuzzyCases: { key: string; r: PostResult; m: LLMMention }[] = [];

  for (const r of ok) {
    const normThread = normalize(r.threadText);
    const refs = new Set(r.sourceRefs);
    const restNames: string[] = [];
    for (let i = 0; i < r.mentions.length; i++) {
      const m = r.mentions[i];
      if (refs.has(m.source_id)) validSource++;
      const tier = containmentTier(m, normThread);
      allMentions.push({ r, m, tier });
      if (tier === 'fuzzy')
        fuzzyCases.push({ key: `${run.tag}:${r.inputId}:${i}`, r, m });
      if (m.restaurant) restNames.push(m.restaurant);
    }
    // canonicalization: distinct-name pairs where one token set is a strict
    // subset of the other (e.g. "Carmine's" vs "Carmine's Times Square")
    const uniq = [...new Set(restNames.map(normalize))];
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) {
        const a = new Set(nameTokens(uniq[i]));
        const b = new Set(nameTokens(uniq[j]));
        if (!a.size || !b.size) continue;
        const [small, big] = a.size <= b.size ? [a, b] : [b, a];
        if ([...small].every((t) => big.has(t))) dupePairs++;
      }
  }

  const nM = allMentions.length;
  const fabricated = allMentions.filter((x) => x.tier === 'none').length;
  const exact = allMentions.filter((x) => x.tier === 'exact').length;
  const tok = (f: (t: NonNullable<PostResult['tokens']>) => number) =>
    ok.reduce((s, r) => s + (r.tokens ? f(r.tokens) : 0), 0);
  const tIn = tok((t) => t.promptTokenCount ?? 0);
  const tCached = tok((t) => t.cachedContentTokenCount ?? 0);
  const tOut = tok(
    (t) => (t.candidatesTokenCount ?? 0) + (t.thoughtsTokenCount ?? 0),
  );
  const price = BATCH_PRICES[run.model] ?? { in: 0, out: 0 };
  const costPerPost =
    ((tIn / ok.length) * price.in + (tOut / ok.length) * price.out) / 1e6;

  return {
    q: {
      tag: run.tag,
      model: run.model,
      posts: ok.length,
      errors: run.results.length - ok.length,
      mentions: nM,
      mentionsPerPost: +(nM / ok.length).toFixed(2),
      sourceIdValidPct: nM ? +((validSource / nM) * 100).toFixed(1) : 100,
      fabricationPct: nM ? +((fabricated / nM) * 100).toFixed(2) : 0,
      exactContainmentPct: nM ? +((exact / nM) * 100).toFixed(1) : 0,
      canonDupesPerPost: +(dupePairs / ok.length).toFixed(3),
      tokensInPerPost: Math.round(tIn / ok.length),
      tokensCachedPerPost: Math.round(tCached / ok.length),
      tokensOutPerPost: Math.round(tOut / ok.length),
      costPer1kPostsBatch: +(costPerPost * 1000).toFixed(2),
    },
    fuzzyCases,
    allMentions,
  };
}

async function analyze(tags: string[], liteTag: string | null): Promise<void> {
  const apiKey =
    process.env.LLM_API_KEY?.trim() || process.env.LLM_API_KEY_DEV?.trim();
  if (!apiKey) throw new Error('LLM_API_KEY missing (needed for the judge)');
  const genAI = new GoogleGenAI({ apiKey });

  const runs = tags.map(loadRun);
  const liteRun = liteTag ? loadRun(liteTag) : null;
  const all = liteRun ? [...runs, liteRun] : runs;

  // --- base string metrics + attribution sample -----------------------------
  const qualities: ModelQuality[] = [];
  const judgeCases: JudgeCase[] = [];
  const perRunSample = new Map<
    string,
    { key: string; autoPass: boolean; r: PostResult; m: LLMMention }[]
  >();

  for (const run of all) {
    const { q, allMentions } = baseQuality(run);
    // attribution sample: seeded random ATTR_SAMPLE mentions; exact-containment
    // auto-passes, everything else goes to the blind judge.
    const sample = seededSample(allMentions, ATTR_SAMPLE, 42);
    const entries = sample.map((x, i) => {
      const key = `attr:${run.tag}:${i}`;
      const autoPass = x.tier === 'exact';
      if (!autoPass)
        judgeCases.push({
          id: key,
          thread: x.r.threadText,
          restaurant: x.m.restaurant ?? '',
          food: x.m.food ?? null,
          question: 'attribution',
        });
      return { key, autoPass, r: x.r, m: x.m };
    });
    perRunSample.set(run.tag, entries);
    qualities.push({
      ...q,
      attributionSampled: sample.length,
      attributionAccuracyPct: 0,
    });
  }

  // --- disagreement analysis (first two tags = the main A/B) ---------------
  const [A, B] = runs;
  const disagreements: {
    inputId: string;
    onlyIn: string;
    restaurant: string;
    food: string | null;
    thread: string;
  }[] = [];
  if (A && B) {
    const byInput = new Map(B.results.map((r) => [r.inputId, r]));
    for (const ra of A.results) {
      const rb = byInput.get(ra.inputId);
      if (!rb || ra.error || rb.error) continue;
      const restsA = new Map(
        ra.mentions
          .filter((m) => m.restaurant)
          .map((m) => [normalize(m.restaurant), m]),
      );
      const restsB = new Map(
        rb.mentions
          .filter((m) => m.restaurant)
          .map((m) => [normalize(m.restaurant), m]),
      );
      const tokensOf = (s: string) => new Set(nameTokens(s));
      const overlaps = (x: string, other: Map<string, LLMMention>) => {
        if (other.has(x)) return true;
        const tx = tokensOf(x);
        for (const y of other.keys()) {
          const ty = tokensOf(y);
          if (!tx.size || !ty.size) continue;
          const [sm, bg] = tx.size <= ty.size ? [tx, ty] : [ty, tx];
          if ([...sm].every((t) => bg.has(t))) return true;
        }
        return false;
      };
      for (const [k, m] of restsA)
        if (!overlaps(k, restsB))
          disagreements.push({
            inputId: ra.inputId,
            onlyIn: A.tag,
            restaurant: m.restaurant,
            food: m.food ?? null,
            thread: ra.threadText,
          });
      for (const [k, m] of restsB)
        if (!overlaps(k, restsA))
          disagreements.push({
            inputId: rb.inputId,
            onlyIn: B.tag,
            restaurant: m.restaurant,
            food: m.food ?? null,
            thread: rb.threadText,
          });
    }
  }
  const disagreeSample = seededSample(disagreements, DISAGREE_SAMPLE, 1337);
  disagreeSample.forEach((d, i) =>
    judgeCases.push({
      id: `dis:${i}`,
      thread: d.thread,
      restaurant: d.restaurant,
      food: d.food,
      question: 'real_recommendation',
    }),
  );

  // --- run the judge BLIND (shuffled, no model identity in the payload) ----
  out(`judge: ${judgeCases.length} cases on ${JUDGE_MODEL} (blind, shuffled)`);
  const shuffled = seededSample(judgeCases, judgeCases.length, 7);
  const verdicts = await judgeBatch(genAI, shuffled);

  // attribution accuracy per model
  for (const q of qualities) {
    const entries = perRunSample.get(q.tag) ?? [];
    let pass = 0;
    let judged = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.autoPass) {
        pass++;
        judged++;
      } else {
        const v = verdicts.get(`attr:${q.tag}:${i}`);
        if (v) {
          judged++;
          if (v.verdict) pass++;
        }
      }
    }
    q.attributionSampled = judged;
    q.attributionAccuracyPct = judged ? +((pass / judged) * 100).toFixed(1) : 0;
  }

  // disagreement classification
  const disByModel = new Map<
    string,
    { realMiss: number; noise: number; unjudged: number }
  >();
  const disDetail: any[] = [];
  disagreeSample.forEach((d, i) => {
    const v = verdicts.get(`dis:${i}`);
    // d appears only in `onlyIn`; verdict true => the OTHER model missed a real
    // mention (real-miss); false => `onlyIn` produced noise.
    const missedBy = d.onlyIn === A?.tag ? B?.tag : A?.tag;
    const bucket = (tag: string) =>
      disByModel.get(tag) ??
      disByModel.set(tag, { realMiss: 0, noise: 0, unjudged: 0 }).get(tag)!;
    if (!v) bucket(d.onlyIn).unjudged++;
    else if (v.verdict) bucket(missedBy ?? '?').realMiss++;
    else bucket(d.onlyIn).noise++;
    disDetail.push({
      restaurant: d.restaurant,
      food: d.food,
      onlyIn: d.onlyIn,
      verdict: v?.verdict ?? null,
      reason: v?.reason ?? null,
    });
  });

  // --- report ---------------------------------------------------------------
  out('');
  out(
    '=== MODEL QUALITY A/B (150 stratified austinfood posts, real processContent) ===',
  );
  const cols = qualities.map((q) => q.tag);
  const row = (label: string, f: (q: ModelQuality) => string | number) =>
    out(
      `${label.padEnd(28)}${cols.map((_, i) => String(f(qualities[i])).padStart(14)).join('')}`,
    );
  out(`${'metric'.padEnd(28)}${cols.map((c) => c.padStart(14)).join('')}`);
  row('model', (q) => q.model.replace('gemini-', ''));
  row('posts (errors)', (q) => `${q.posts} (${q.errors})`);
  row('mentions/post', (q) => q.mentionsPerPost);
  row('source_id valid %', (q) => q.sourceIdValidPct);
  row('exact containment %', (q) => q.exactContainmentPct);
  row('fabrication %', (q) => q.fabricationPct);
  row(
    'attribution acc % (n)',
    (q) => `${q.attributionAccuracyPct} (${q.attributionSampled})`,
  );
  row('canon dupes/post', (q) => q.canonDupesPerPost);
  row(
    'in tok/post (cached)',
    (q) => `${q.tokensInPerPost} (${q.tokensCachedPerPost})`,
  );
  row('out+think tok/post', (q) => q.tokensOutPerPost);
  row('$/1k posts (batch)', (q) => q.costPer1kPostsBatch);
  out('');
  out(
    `disagreements (restaurant-level, ${A?.tag} vs ${B?.tag}): ${disagreements.length} total, ${disagreeSample.length} judged`,
  );
  for (const [tag, v] of disByModel)
    out(
      `  ${tag.padEnd(10)} realMiss(by other)=${v.realMiss} noise(own)=${v.noise} unjudged=${v.unjudged}`,
    );

  fs.writeFileSync(
    path.join(OUT_DIR, 'model-ab-v2-analysis.json'),
    JSON.stringify(
      {
        qualities,
        disagreements: disDetail,
        totalDisagreements: disagreements.length,
      },
      null,
      2,
    ),
  );
  out(`wrote ${path.join(OUT_DIR, 'model-ab-v2-analysis.json')}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = process.env.MODE ?? 'generate';
  if (mode === 'analyze') {
    const tags = (process.env.TAGS ?? 'g35,g3').split(',').map((s) => s.trim());
    await analyze(tags, process.env.LITE_TAG?.trim() || null);
    return;
  }
  const tag = process.env.MODEL_TAG ?? 'default';
  const strata = (process.env.STRATA ?? 'small,medium,large')
    .split(',')
    .map((s) => s.trim()) as Stratum[];
  await generate(tag, strata);
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
