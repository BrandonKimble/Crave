/**
 * @script-class: probe
 * @finding: banked per-run in the commit message of each prompt rederivation
 *   (2026-08-12: moderation v2, relevance-gate v2, poll-subject v2).
 *
 * GOLD-CASE A/B for the SMALL judge prompts (moderation, relevance gate, poll
 * subject) — the prompt-ab.ts pattern applied to the classifier lanes.
 *
 * prompt-ab.ts grades the collection prompt's `mentions`; nothing in it is
 * reusable for a boolean/enum classifier, and the canon requires that every
 * contested boundary be pinned by a REAL gold case on BOTH sides. This is that
 * harness for these three lanes: same shape (two prompt files, --repeat runs
 * per case, PASS/FLAKY/FAIL, explicit regression report), same law (goes
 * through LlmService — never a second Gemini client), never writes anything.
 *
 *   yarn workspace api ts-node scripts/prompt-gold.ts \
 *     --kind=moderation|relevance-gate|poll-subject \
 *     --case-file=scripts/fixtures/<kind>-gold-cases.json \
 *     --live=<path-to-old-prompt> --candidate=prompts/<kind>-prompt.md \
 *     [--repeat=3] [--only=<caseId>] [--out=<results.json>]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync, writeFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import {
  MODERATION_RESPONSE_JSON_SCHEMA,
  POLL_SUBJECT_RESPONSE_JSON_SCHEMA,
  RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
  jsonSchemaToTypedSchema,
} from '../src/modules/external-integrations/llm/prompts/llm-response-schemas';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const PROMPT_DIR = join(
  __dirname,
  '../src/modules/external-integrations/llm/prompts',
);

type Kind = 'moderation' | 'relevance-gate' | 'poll-subject';

type GoldCase = {
  id: string;
  /** Why this case exists — the boundary or fail-direction it pins. */
  why: string;
  /** moderation + poll-subject: the user text / poll question. */
  text?: string;
  /** relevance-gate: one post. */
  post?: { title: string; body?: string };
  expect: {
    allowed?: boolean;
    keep?: boolean;
    mode?: 'ranked' | 'discussion';
    targetType?: 'dish' | 'restaurant';
    constraintKind?: string;
    constraintValue?: string;
    anchor?: string | null;
    marketHint?: string | null;
  };
};

const CALLER: Record<Kind, string> = {
  moderation: 'moderation.classify',
  'relevance-gate': 'relevance-gate.judgeBatch',
  'poll-subject': 'poll.infer_subject',
};

function payload(kind: Kind, testCase: GoldCase): string {
  if (kind === 'moderation') return JSON.stringify({ text: testCase.text });
  if (kind === 'poll-subject')
    return JSON.stringify({ question: testCase.text });
  return `## Posts\n\n${JSON.stringify([
    {
      index: 0,
      title: testCase.post?.title ?? '',
      body: testCase.post?.body ?? '',
    },
  ])}`;
}

function schemaFor(kind: Kind): Record<string, unknown> {
  if (kind === 'moderation')
    return { responseJsonSchema: MODERATION_RESPONSE_JSON_SCHEMA };
  if (kind === 'poll-subject')
    return { responseJsonSchema: POLL_SUBJECT_RESPONSE_JSON_SCHEMA };
  return {
    responseSchema: jsonSchemaToTypedSchema(
      RELEVANCE_GATE_RESPONSE_JSON_SCHEMA,
    ),
  };
}

/** Enum comparison — underscores are SIGNIFICANT here (`restaurant_attribute`
 *  is not `restaurant attribute`); norm() below is for free-text values. */
function normEnum(value: unknown): string {
  return (typeof value === 'string' ? value : '').toLowerCase().trim();
}

function norm(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grade one raw model response against the case. */
function grade(
  kind: Kind,
  testCase: GoldCase,
  raw: Record<string, unknown>,
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const expect = testCase.expect;

  if (kind === 'moderation') {
    // Same default-allow reading the service uses (parseModerationResponse).
    const allowed = raw.allowed !== false;
    if (expect.allowed !== undefined && allowed !== expect.allowed)
      failures.push(
        `expected allowed=${expect.allowed}, got ${allowed} (reason="${norm(raw.reason)}")`,
      );
  } else if (kind === 'relevance-gate') {
    const verdicts = Array.isArray(raw)
      ? (raw as unknown[])
      : ((raw.verdicts as unknown[]) ?? []);
    const first = verdicts[0] as
      | { keep?: unknown; reason?: unknown }
      | undefined;
    if (!first) failures.push('no verdict returned');
    else {
      const keep = Boolean(first.keep);
      if (expect.keep !== undefined && keep !== expect.keep)
        failures.push(
          `expected keep=${expect.keep}, got ${keep} (reason="${norm(first.reason)}")`,
        );
    }
  } else {
    const mode = raw.mode === 'ranked' ? 'ranked' : 'discussion';
    if (expect.mode && mode !== expect.mode)
      failures.push(`expected mode=${expect.mode}, got ${mode}`);
    const axis = (raw.axis ?? null) as Record<string, unknown> | null;
    if (expect.targetType && normEnum(axis?.target_type) !== expect.targetType)
      failures.push(
        `expected target_type=${expect.targetType}, got ${norm(axis?.target_type)}`,
      );
    const constraint = (axis?.constraint ?? null) as Record<
      string,
      unknown
    > | null;
    if (
      expect.constraintKind &&
      normEnum(constraint?.kind) !== expect.constraintKind
    )
      failures.push(
        `expected constraint.kind=${expect.constraintKind}, got ${norm(constraint?.kind)}`,
      );
    if (
      expect.constraintValue &&
      !norm(constraint?.value).includes(norm(expect.constraintValue))
    )
      failures.push(
        `expected constraint.value~${expect.constraintValue}, got ${norm(constraint?.value)}`,
      );
    if (expect.anchor && !norm(axis?.anchor).includes(norm(expect.anchor)))
      failures.push(
        `expected anchor~${expect.anchor}, got ${norm(axis?.anchor)}`,
      );
    if (expect.anchor === null && axis?.anchor)
      failures.push(`expected anchor=null, got ${norm(axis?.anchor)}`);
    if (
      expect.marketHint &&
      !norm(axis?.market_hint).includes(norm(expect.marketHint))
    )
      failures.push(
        `expected market_hint~${expect.marketHint}, got ${norm(axis?.market_hint)}`,
      );
  }
  return { pass: failures.length === 0, failures };
}

async function runOnce(
  llm: LLMService,
  kind: Kind,
  systemPrompt: string,
  testCase: GoldCase,
): Promise<Record<string, unknown>> {
  const text = await llm.generateForCaller({
    caller: CALLER[kind],
    systemInstruction: systemPrompt,
    prompt: payload(kind, testCase),
    maxRetries: 0,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      ...schemaFor(kind),
    },
  });
  const start = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const from =
    start >= 0 && (arrayStart < 0 || start < arrayStart) ? start : arrayStart;
  return JSON.parse(from >= 0 ? text.slice(from) : text || '{}') as Record<
    string,
    unknown
  >;
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

  const kind = arg('kind') as Kind | undefined;
  if (!kind || !CALLER[kind])
    throw new Error(
      '--kind=moderation|relevance-gate|poll-subject is required',
    );
  const caseFile = arg('case-file');
  if (!caseFile) throw new Error('--case-file=<path> is required');
  const repeat = parseInt(arg('repeat', '3') as string, 10);
  const only = arg('only');
  const outFile = arg('out');

  const livePath = resolvePrompt(arg('live', `${kind}-prompt.md`) as string);
  const candidatePath = resolvePrompt(
    arg('candidate', `${kind}-prompt.md`) as string,
  );
  const prompts = {
    live: readFileSync(livePath, 'utf-8'),
    candidate: readFileSync(candidatePath, 'utf-8'),
  };
  let cases = JSON.parse(readFileSync(caseFile, 'utf-8')) as GoldCase[];
  if (only) cases = cases.filter((c) => c.id === only);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);

  console.log(
    `\nPROMPT GOLD (${kind}) — ${cases.length} cases x ${repeat} runs x 2 prompts = ${cases.length * repeat * 2} calls`,
  );
  console.log(`live=${livePath}\ncandidate=${candidatePath}\n`);

  type Unit = {
    testCase: GoldCase;
    variant: 'live' | 'candidate';
    run: number;
  };
  const units: Unit[] = [];
  for (const testCase of cases)
    for (const variant of ['live', 'candidate'] as const)
      for (let i = 0; i < repeat; i += 1)
        units.push({ testCase, variant, run: i });

  const key = (c: string, v: string) => `${c}::${v}`;
  const outcomes = new Map<
    string,
    { raw?: Record<string, unknown>; error?: string }[]
  >();
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
          const raw = await runOnce(
            llm,
            kind,
            prompts[unit.variant],
            unit.testCase,
          );
          outcomes.get(k)!.push({ raw });
        } catch (error) {
          outcomes.get(k)!.push({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  const results: Array<Record<string, unknown>> = [];
  for (const testCase of cases) {
    const row: Record<string, unknown> = { id: testCase.id, why: testCase.why };
    for (const variant of ['live', 'candidate'] as const) {
      let passes = 0;
      const allFailures: string[] = [];
      let sample: Record<string, unknown> | undefined;
      for (const outcome of outcomes.get(key(testCase.id, variant)) ?? []) {
        if (outcome.error) {
          allFailures.push(`ERROR: ${outcome.error}`);
          continue;
        }
        sample ??= outcome.raw;
        const graded = grade(kind, testCase, outcome.raw ?? {});
        if (graded.pass) passes += 1;
        else allFailures.push(...graded.failures);
      }
      row[variant] = {
        passes,
        of: repeat,
        verdict: passes === repeat ? 'PASS' : passes === 0 ? 'FAIL' : 'FLAKY',
        failures: Array.from(new Set(allFailures)).slice(0, 6),
        sample,
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
      `${testCase.id.padEnd(34)} live=${liveVerdict.padEnd(6)} candidate=${candVerdict.padEnd(6)}${arrow}`,
    );
    (row.candidate as { failures: string[] }).failures.forEach((f) =>
      console.log(`      candidate: ${f}`),
    );
    (row.live as { failures: string[] }).failures.forEach((f) =>
      console.log(`      live:      ${f}`),
    );
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
  if (regressions.length)
    console.log(
      `\n❌ ${regressions.length} REGRESSION(S): ${regressions.map((r) => r.id).join(', ')}`,
    );
  const wins = results.filter(
    (r) =>
      (r.live as { verdict: string }).verdict !== 'PASS' &&
      (r.candidate as { verdict: string }).verdict === 'PASS',
  );
  if (wins.length)
    console.log(
      `✅ ${wins.length} FIX(ES): ${wins.map((r) => r.id).join(', ')}`,
    );

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
