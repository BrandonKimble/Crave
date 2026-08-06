/**
 * @script-class: probe
 * @finding: see plans/data-audit-2026-08.md "PHASE 4" — the candidate prompt's
 *   graded A/B against the live prompt on real documents.
 *
 * PROMPT A/B HARNESS (data-audit 2026-08, Phase 4).
 *
 * The reextract choreography (scripts/rig/reextract.sh) is the PRODUCTION
 * path: campaign-gated, batched, async, and correct for a real re-extraction.
 * It is far too slow a loop to ITERATE a prompt against. This probe is the
 * tight loop: it runs the SAME documents through two prompt files with one
 * synchronous Gemini call each, then grades both outputs against expectations
 * written from the forensic replay.
 *
 * It replicates the production call faithfully — same model, same enforced
 * response schema, same system-instruction-plus-payload shape — but never
 * writes to the database and never touches the prompt registry. Nothing here
 * can activate anything.
 *
 *   yarn workspace api ts-node scripts/prompt-ab.ts --case-file=<cases.json>
 *     [--live=prompts/collection-prompt.md]
 *     [--candidate=prompts/collection-prompt.candidate.md]
 *     [--only=<caseId>] [--repeat=3] [--out=<results.json>]
 *
 * --repeat runs each case N times per prompt: an LLM is stochastic, and a
 * one-shot pass is not evidence that a rule holds. A case that passes 2/3 is
 * reported as FLAKY, not as passing.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { GoogleGenAI } from '@google/genai';
import { COLLECTION_RESPONSE_JSON_SCHEMA } from '../src/modules/external-integrations/llm/prompts/llm-response-schemas';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);
const MODEL = process.env.LLM_MODEL || 'gemini-3-flash-preview';
const TEMPERATURE = 0.1;

/** One graded scenario: real source text plus what must and must not appear. */
type Case = {
  id: string;
  /** Why this case exists — the defect class or the control it protects. */
  why: string;
  /** Documents exactly as the pipeline would present them. */
  posts: Array<{
    id: string;
    title?: string;
    body?: string;
    extract_from_post?: boolean;
    comments?: Array<{ id: string; body: string; parent_id?: string }>;
  }>;
  expect: {
    /** No mention at all may be emitted. */
    emitsNothing?: boolean;
    /** Every listed restaurant must appear in some mention. */
    restaurants?: string[];
    /** These foods must appear. */
    foods?: string[];
    /** These must NOT appear as food anywhere. */
    notFoods?: string[];
    /** These must NOT appear in any attribute array. */
    notAttributes?: string[];
    /** These must NOT appear as a restaurant. */
    notRestaurants?: string[];
    /** These must appear in some attribute array. */
    attributes?: string[];
    /** At least one mention must carry general_praise: true. */
    somePraise?: boolean;
    /** No mention may carry general_praise: true. */
    noPraise?: boolean;
  };
};

type Mention = Record<string, unknown>;

function norm(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Singular-insensitive containment, so "taco" matches "tacos". */
function has(haystack: string[], needle: string): boolean {
  const n = norm(needle);
  return haystack.some((value) => {
    const v = norm(value);
    return v === n || v === `${n}s` || `${v}s` === n;
  });
}

function grade(
  testCase: Case,
  mentions: Mention[],
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const expect = testCase.expect;

  const restaurants = mentions.map((m) => String(m.restaurant ?? ''));
  const foods = mentions
    .map((m) => m.food)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  const categories = mentions.flatMap((m) =>
    Array.isArray(m.food_categories) ? (m.food_categories as string[]) : [],
  );
  const attributes = mentions.flatMap((m) => [
    ...(Array.isArray(m.food_attributes)
      ? (m.food_attributes as string[])
      : []),
    ...(Array.isArray(m.restaurant_attributes)
      ? (m.restaurant_attributes as string[])
      : []),
  ]);

  if (expect.emitsNothing && mentions.length > 0) {
    failures.push(
      `expected NOTHING, got ${mentions.length}: ${restaurants.join(', ')}`,
    );
  }
  for (const r of expect.restaurants ?? []) {
    if (!has(restaurants, r)) failures.push(`missing restaurant "${r}"`);
  }
  for (const r of expect.notRestaurants ?? []) {
    if (has(restaurants, r)) failures.push(`FORBIDDEN restaurant "${r}"`);
  }
  for (const f of expect.foods ?? []) {
    if (!has(foods, f) && !has(categories, f))
      failures.push(`missing food "${f}"`);
  }
  for (const f of expect.notFoods ?? []) {
    if (has(foods, f) || has(categories, f))
      failures.push(`FORBIDDEN food "${f}"`);
  }
  for (const a of expect.attributes ?? []) {
    if (!has(attributes, a)) failures.push(`missing attribute "${a}"`);
  }
  for (const a of expect.notAttributes ?? []) {
    if (has(attributes, a)) failures.push(`FORBIDDEN attribute "${a}"`);
  }
  if (expect.somePraise && !mentions.some((m) => m.general_praise === true)) {
    failures.push('expected general_praise:true somewhere');
  }
  if (expect.noPraise && mentions.some((m) => m.general_praise === true)) {
    failures.push('FORBIDDEN general_praise:true');
  }
  return { pass: failures.length === 0, failures };
}

async function runOnce(
  ai: GoogleGenAI,
  systemPrompt: string,
  testCase: Case,
): Promise<Mention[]> {
  const payload = {
    posts: testCase.posts.map((post) => ({
      id: post.id,
      title: post.title ?? '',
      content: post.body ?? '',
      extract_from_post: post.extract_from_post !== false,
      comments: (post.comments ?? []).map((comment) => ({
        id: comment.id,
        content: comment.body,
        parent_id: comment.parent_id ?? null,
      })),
    })),
  };

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: JSON.stringify(payload),
    config: {
      systemInstruction: systemPrompt,
      temperature: TEMPERATURE,
      responseMimeType: 'application/json',
      responseSchema: COLLECTION_RESPONSE_JSON_SCHEMA as never,
      maxOutputTokens: 32768,
    },
  });

  const text = response.text ?? '';
  try {
    const parsed = JSON.parse(text) as { mentions?: Mention[] };
    return Array.isArray(parsed.mentions) ? parsed.mentions : [];
  } catch {
    throw new Error(`unparseable response: ${text.slice(0, 300)}`);
  }
}

function resolvePrompt(value: string): string {
  return isAbsolute(value)
    ? value
    : join(PROMPT_DIR, value.replace(/^prompts\//, ''));
}

async function main(): Promise<void> {
  const arg = (name: string, fallback?: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : fallback;
  };

  const caseFile = arg('case-file');
  if (!caseFile) throw new Error('--case-file=<path> is required');
  const repeat = parseInt(arg('repeat', '3') as string, 10);
  const only = arg('only');
  const outFile = arg('out');

  const livePath = resolvePrompt(arg('live', 'collection-prompt.md') as string);
  const candidatePath = resolvePrompt(
    arg('candidate', 'collection-prompt.candidate.md') as string,
  );

  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY (or LLM_API_KEY) is required');

  const prompts = {
    live: readFileSync(livePath, 'utf-8'),
    candidate: readFileSync(candidatePath, 'utf-8'),
  };
  let cases = JSON.parse(readFileSync(caseFile, 'utf-8')) as Case[];
  if (only) cases = cases.filter((c) => c.id === only);

  const ai = new GoogleGenAI({ apiKey });
  const results: Array<Record<string, unknown>> = [];

  console.log(
    `\nPROMPT A/B — ${cases.length} cases x ${repeat} runs x 2 prompts = ${cases.length * repeat * 2} calls`,
  );
  console.log(
    `model=${MODEL}  live=${livePath}\n           candidate=${candidatePath}\n`,
  );

  // One unit of work per (case, variant, run). Sequential execution made a
  // 96-call round exceed ten minutes; the vendor happily takes these in
  // parallel and the harness is worthless if it is too slow to iterate with.
  type Unit = { testCase: Case; variant: 'live' | 'candidate'; index: number };
  const units: Unit[] = [];
  for (const testCase of cases) {
    for (const variant of ['live', 'candidate'] as const) {
      for (let i = 0; i < repeat; i += 1)
        units.push({ testCase, variant, index: i });
    }
  }
  const outcomes = new Map<
    string,
    { mentions?: Mention[]; error?: string }[]
  >();
  const key = (c: string, v: string) => `${c}::${v}`;
  units.forEach((u) => {
    const k = key(u.testCase.id, u.variant);
    if (!outcomes.has(k)) outcomes.set(k, []);
  });

  const CONCURRENCY = 6;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const unit = units[cursor++];
        if (!unit) return;
        const k = key(unit.testCase.id, unit.variant);
        try {
          const mentions = await runOnce(
            ai,
            prompts[unit.variant],
            unit.testCase,
          );
          outcomes.get(k)!.push({ mentions });
        } catch (error) {
          outcomes
            .get(k)!
            .push({
              error: error instanceof Error ? error.message : String(error),
            });
        }
      }
    }),
  );

  for (const testCase of cases) {
    const row: Record<string, unknown> = { id: testCase.id, why: testCase.why };
    for (const variant of ['live', 'candidate'] as const) {
      let passes = 0;
      const allFailures: string[] = [];
      const samples: Mention[][] = [];
      for (const outcome of outcomes.get(key(testCase.id, variant)) ?? []) {
        if (outcome.error) {
          allFailures.push(`ERROR: ${outcome.error}`);
          continue;
        }
        samples.push(outcome.mentions ?? []);
        const graded = grade(testCase, outcome.mentions ?? []);
        if (graded.pass) passes += 1;
        else allFailures.push(...graded.failures);
      }
      row[variant] = {
        passes,
        of: repeat,
        verdict: passes === repeat ? 'PASS' : passes === 0 ? 'FAIL' : 'FLAKY',
        failures: Array.from(new Set(allFailures)).slice(0, 8),
        sample: samples[0] ?? [],
      };
    }
    const liveVerdict = (row.live as { verdict: string }).verdict;
    const candVerdict = (row.candidate as { verdict: string }).verdict;
    const arrow =
      liveVerdict === candVerdict
        ? '  ='
        : candVerdict === 'PASS'
          ? ' ✅'
          : liveVerdict === 'PASS'
            ? ' ❌REGRESSION'
            : '  ~';
    console.log(
      `${testCase.id.padEnd(30)} live=${liveVerdict.padEnd(6)} candidate=${candVerdict.padEnd(6)}${arrow}`,
    );
    const candFailures = (row.candidate as { failures: string[] }).failures;
    if (candFailures.length) {
      candFailures.forEach((f) => console.log(`      candidate: ${f}`));
    }
    results.push(row);
  }

  const summary = (variant: 'live' | 'candidate') => {
    const counts = { PASS: 0, FLAKY: 0, FAIL: 0 } as Record<string, number>;
    results.forEach((r) => {
      counts[(r[variant] as { verdict: string }).verdict] += 1;
    });
    return counts;
  };
  console.log('\n--- SUMMARY ---');
  console.log('live     ', JSON.stringify(summary('live')));
  console.log('candidate', JSON.stringify(summary('candidate')));
  const regressions = results.filter(
    (r) =>
      (r.live as { verdict: string }).verdict === 'PASS' &&
      (r.candidate as { verdict: string }).verdict !== 'PASS',
  );
  if (regressions.length) {
    console.log(
      `\n❌ ${regressions.length} REGRESSION(S): ${regressions.map((r) => r.id).join(', ')}`,
    );
  }

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${outFile}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
