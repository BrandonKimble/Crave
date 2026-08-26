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
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

/**
 * Which naming contract a case grades against. `v16` reads the emitted
 * `place` field (prompt-chosen canonical name); `v17` reads `place_observed`
 * (the observed-span contract) and can additionally pin `place_source_id`.
 * Case-level, never global: certification runs mixed sets while both eras
 * coexist.
 */
type Contract = 'v16' | 'v17';

/** One graded scenario: real source text plus what must and must not appear. */
type Case = {
  id: string;
  /** Why this case exists — the defect class or the control it protects. */
  why: string;
  /** Naming contract this case grades against. Defaults to 'v16'. */
  contract?: Contract;
  /** A case whose rule does not exist in any prompt yet (e.g. the geography
   *  gate before S3 lands). Graded and reported, but excluded from the
   *  regression list and counted separately in the summary — it documents a
   *  future obligation, not a current one. The string says what it waits on. */
  pending?: string;
  /** Documents exactly as the pipeline would present them. */
  posts: Array<{
    id: string;
    title?: string;
    body?: string;
    extract_from_post?: boolean;
    comments?: Array<{ id: string; body: string; parent_id?: string }>;
  }>;
  expect: Expect;
};

type Expect = {
  /** No mention at all may be emitted. */
  emitsNothing?: boolean;
  /** Every listed restaurant must appear as some mention's name — compared
   *  MECHANICALLY (lowercase + whitespace collapse only; see mechName). */
  places?: string[];
  /** These foods must appear. */
  items?: string[];
  /** These must NOT appear as food anywhere. */
  notFoods?: string[];
  /** These must NOT appear in any attribute array. */
  notAttributes?: string[];
  /** These must NOT appear as a restaurant name (mechanical comparison). */
  notRestaurants?: string[];
  /** These must appear in some attribute array. */
  attributes?: string[];
  /** At least one mention must carry general_praise: true. */
  somePraise?: boolean;
  /** No mention may carry general_praise: true. */
  noPraise?: boolean;
  /** No mention may carry is_menu_item: true (v8 audit class 4 — the
   *  inherited-dish rule mandates false; a true here is the systematic
   *  overcall). */
  noMenuItemTrue?: boolean;
  /** Every general_praise:true mention must be restaurant-only (food null)
   *  — the F.1 one-carrier invariant (v8 audit class 5). */
  praiseOnlyRestaurantOnly?: boolean;
  /** v17 only: for each observed name (key, mechanical form), every mention
   *  carrying that name must declare this source id as its
   *  `place_source_id` — the observed-span contract's "WHERE did you read
   *  it" assertion. */
  placeSourceIds?: Record<string, string>;
  /** Per-source expectations (remaining-classes drain, 2026-08-12): a real
   *  thread's OTHER comments may legitimately emit the very thing the
   *  TARGET source must not (e.g. a parent that praises a place its child
   *  merely inherits). Each entry grades ONLY the mentions whose source_id
   *  matches, with the same sub-fields as the top level. */
  perSource?: Array<{ source: string } & Omit<Expect, 'perSource'>>;
};

/** The complete expectation vocabulary. An unknown key in a case file is a
 *  HARD ERROR at load: the previous grader/fixture drifted apart silently
 *  (the fixture said `notItems`/`notPlaces`-era names the grader no longer
 *  read) and 46 expectations were being skipped without a trace — the
 *  tool-absence-swallow class, in JSON form. */
const EXPECT_KEYS = new Set([
  'emitsNothing',
  'places',
  'items',
  'notFoods',
  'notAttributes',
  'notRestaurants',
  'attributes',
  'somePraise',
  'noPraise',
  'noMenuItemTrue',
  'praiseOnlyRestaurantOnly',
  'placeSourceIds',
  'perSource',
]);

function validateExpectKeys(caseId: string, expect: Record<string, unknown>) {
  for (const key of Object.keys(expect)) {
    if (key !== 'source' && !EXPECT_KEYS.has(key)) {
      throw new Error(
        `case "${caseId}": unknown expectation key "${key}" — ` +
          `it would be silently ignored. Known keys: ${[...EXPECT_KEYS].join(', ')}`,
      );
    }
  }
}

type Mention = Record<string, unknown>;

/**
 * MECHANICAL name normalization — the only transform place-name grading is
 * allowed (v17 observed-span contract; applied to BOTH eras so the v16
 * baseline is measured with the same ruler): lowercase + whitespace collapse.
 * Diacritics, punctuation, and possessives are PRESERVED — `café crème` ≠
 * `cafe creme`, `lefty's` ≠ `leftys`. The two codepoint-only steps (NFC,
 * curly→straight apostrophes/quotes) unify different encodings of the SAME
 * written character, never different characters.
 */
function mechName(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact mechanical equality for place names. No token subsets, no plural
 *  fold: `franklin bbq` does not satisfy `franklin`, and vice versa. */
function hasName(haystack: string[], needle: string): boolean {
  const n = mechName(needle);
  return haystack.some((value) => mechName(value) === n);
}

function norm(value: string): string {
  // Unicode-aware (multilingual ruling R6, 2026-08-12): the gold suite now
  // carries vi/es cases, and the old ascii-only class reduced "thực đơn" to
  // the tokens {th,c,n} — un-gradeable and false-match-prone. Identical
  // behavior for ascii needles.
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tolerant containment for NON-NAME vocabulary only (foods, categories,
 * attributes): singular-insensitive ("taco" matches "tacos") and
 * token-subset tolerant ("shoestring fry" matches "crispy shoestring
 * fries"). Those fields are open descriptive vocabulary the prompt is free
 * to phrase — grading them exactly would grade phrasing, not extraction.
 * Place names NEVER go through this path (see mechName): under the
 * observed-span contract this very tolerance is what hid the violations the
 * contract exists to refuse (diacritic folds, token-superset blends).
 */
function has(haystack: string[], needle: string): boolean {
  const n = norm(needle);
  const wanted = n.split(' ').filter(Boolean);
  return haystack.some((value) => {
    const v = norm(value);
    if (v === n || v === `${n}s` || `${v}s` === n) return true;
    const present = v.split(' ').filter(Boolean);
    return wanted.every((w) =>
      present.some((t) => t === w || t === `${w}s` || `${t}s` === w),
    );
  });
}

function grade(
  testCase: Case,
  mentions: Mention[],
): { pass: boolean; failures: string[] } {
  const contract = testCase.contract ?? 'v16';
  const failures = gradeExpect(testCase.expect, mentions, contract);
  for (const per of testCase.expect.perSource ?? []) {
    const subset = mentions.filter((m) => m.source_id === per.source);
    failures.push(
      ...gradeExpect(per, subset, contract).map((f) => `[${per.source}] ${f}`),
    );
  }
  return { pass: failures.length === 0, failures };
}

function gradeExpect(
  expect: Omit<Expect, 'perSource'>,
  mentions: Mention[],
  contract: Contract,
): string[] {
  const failures: string[] = [];

  // The name field is era-specific: v16 emits `place` (prompt-canonical),
  // v17 emits `place_observed` (the span as written in the source).
  const nameField = contract === 'v17' ? 'place_observed' : 'place';
  const places = mentions.map((m) =>
    typeof m[nameField] === 'string' ? m[nameField] : '',
  );
  const items = mentions
    .map((m) => m.item)
    .filter((f): f is string => typeof f === 'string' && f.length > 0);
  const categories = mentions.flatMap((m) =>
    Array.isArray(m.item_categories) ? (m.item_categories as string[]) : [],
  );
  const attributes = mentions.flatMap((m) => [
    ...(Array.isArray(m.item_attributes)
      ? (m.item_attributes as string[])
      : []),
    ...(Array.isArray(m.place_attributes)
      ? (m.place_attributes as string[])
      : []),
  ]);

  if (expect.emitsNothing && mentions.length > 0) {
    failures.push(
      `expected NOTHING, got ${mentions.length}: ${places.join(', ')}`,
    );
  }
  for (const r of expect.places ?? []) {
    if (!hasName(places, r)) failures.push(`missing restaurant "${r}"`);
  }
  for (const r of expect.notRestaurants ?? []) {
    if (hasName(places, r)) failures.push(`FORBIDDEN restaurant "${r}"`);
  }
  for (const [observed, sourceId] of Object.entries(
    expect.placeSourceIds ?? {},
  )) {
    const carriers = mentions.filter(
      (m) =>
        typeof m.place_observed === 'string' &&
        mechName(m.place_observed) === mechName(observed),
    );
    for (const m of carriers) {
      if (m.place_source_id !== sourceId) {
        failures.push(
          `"${observed}" claims place_source_id=${String(m.place_source_id)}, expected ${sourceId}`,
        );
      }
    }
  }
  for (const f of expect.items ?? []) {
    if (!has(items, f) && !has(categories, f))
      failures.push(`missing food "${f}"`);
  }
  for (const f of expect.notFoods ?? []) {
    if (has(items, f) || has(categories, f))
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
  if (expect.noMenuItemTrue && mentions.some((m) => m.is_menu_item === true)) {
    failures.push('FORBIDDEN is_menu_item:true (inherited/family dish)');
  }
  if (
    expect.praiseOnlyRestaurantOnly &&
    mentions.some(
      (m) =>
        m.general_praise === true &&
        typeof m.item === 'string' &&
        m.item.length > 0,
    )
  ) {
    failures.push('general_praise:true on a mention that carries a dish');
  }
  return failures;
}

/**
 * ONE GATEWAY (gemini-gateway-lockdown): this probe must NOT construct its own
 * Gemini client. The first draft imported @google/genai directly and the lint
 * rule caught it — correctly, because a second client is a second spend gate to
 * forget, and this probe spends real money. It goes through LlmService like
 * every other caller; the only special thing it does is hand processContent the
 * system prompt to run, which is exactly what an A/B needs and nothing more.
 */
async function runOnce(
  llm: LLMService,
  systemPrompt: string,
  testCase: Case,
): Promise<Mention[]> {
  const input = {
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

  const parsed = await llm.processContent(input as never, systemPrompt);
  return Array.isArray(parsed?.mentions)
    ? (parsed.mentions as unknown as Mention[])
    : [];
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

  const prompts = {
    live: readFileSync(livePath, 'utf-8'),
    candidate: readFileSync(candidatePath, 'utf-8'),
  };
  let cases = JSON.parse(readFileSync(caseFile, 'utf-8')) as Case[];
  if (only) cases = cases.filter((c) => only.split(',').includes(c.id));
  for (const c of cases) {
    validateExpectKeys(c.id, c.expect as Record<string, unknown>);
    for (const per of c.expect.perSource ?? []) {
      validateExpectKeys(c.id, per as Record<string, unknown>);
    }
    if (c.contract && c.contract !== 'v16' && c.contract !== 'v17') {
      throw new Error(
        `case "${c.id}": unknown contract "${String(c.contract)}"`,
      );
    }
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);
  const results: Array<Record<string, unknown>> = [];

  console.log(
    `\nPROMPT A/B — ${cases.length} cases x ${repeat} runs x 2 prompts = ${cases.length * repeat * 2} calls`,
  );
  console.log(`live=${livePath}\ncandidate=${candidatePath}\n`);

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
            llm,
            prompts[unit.variant],
            unit.testCase,
          );
          outcomes.get(k)!.push({ mentions });
        } catch (error) {
          outcomes.get(k)!.push({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  for (const testCase of cases) {
    const row: Record<string, unknown> = {
      id: testCase.id,
      why: testCase.why,
      contract: testCase.contract ?? 'v16',
      ...(testCase.pending ? { pending: testCase.pending } : {}),
    };
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
      `${testCase.id.padEnd(30)} live=${liveVerdict.padEnd(6)} candidate=${candVerdict.padEnd(6)}${arrow}${testCase.pending ? `  [PENDING: ${testCase.pending}]` : ''}`,
    );
    const candFailures = (row.candidate as { failures: string[] }).failures;
    if (candFailures.length) {
      candFailures.forEach((f) => console.log(`      candidate: ${f}`));
    }
    results.push(row);
  }

  const summary = (variant: 'live' | 'candidate') => {
    const counts = { PASS: 0, FLAKY: 0, FAIL: 0, PENDING: 0 } as Record<
      string,
      number
    >;
    results.forEach((r) => {
      if (r.pending) counts.PENDING += 1;
      else counts[(r[variant] as { verdict: string }).verdict] += 1;
    });
    return counts;
  };
  console.log('\n--- SUMMARY ---');
  console.log('live     ', JSON.stringify(summary('live')));
  console.log('candidate', JSON.stringify(summary('candidate')));
  const regressions = results.filter(
    (r) =>
      !r.pending &&
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

  await app.close();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
