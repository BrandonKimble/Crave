/**
 * @script-class: probe
 *
 * QUERY-PROMPT A/B HARNESS (prompt-fleet rederivation 2026-08-11) — the
 * prompt-ab.ts pattern applied to query understanding: run the SAME queries
 * through two query-prompt files via the PRODUCTION path
 * (LLMService.interpretResidue with a systemPromptOverride — same model,
 * enforced schema, config, and parser), grade both against expectations, and
 * report per-case verdicts plus a head-to-head. Read-only: no DB writes, no
 * prompt activation, caches bypassed for both variants.
 *
 *   yarn workspace api ts-node scripts/query-ab.ts \
 *     --case-file=scripts/fixtures/query-ab-cases.json \
 *     [--live=query-prompt.md] [--candidate=query-prompt.candidate.md] \
 *     [--only=<caseId>] [--repeat=3] [--out=<results.json>]
 *
 * Gold-set provenance: every distinct real natural query in the local
 * corpus's on-demand log (collection_on_demand_requests
 * metadata.context.query — 6 distinct as of 2026-08-11: piza, mexican,
 * bakery, tacs, birria tacos, gelatera) plus the doctrine's contested
 * boundaries (wrapper heads, cuisine-only queries, ingredient-vs-dish,
 * negation, praise words). A case that passes some-but-not-all repeats is
 * FLAKY, not passing.
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

/** Per-array expectation: `include` is a list of anyOf-groups (each group
 *  must have at least one member present); `exclude` terms must be absent;
 *  `empty: true` requires the array to be empty. */
type ArrayExpect = {
  include?: string[][];
  exclude?: string[];
  empty?: boolean;
};

type Case = {
  id: string;
  /** Why this case exists — the boundary or real-log defect it pins. */
  why: string;
  query: string;
  expect: Partial<
    Record<
      | 'restaurants'
      | 'foods'
      | 'foodAttributes'
      | 'restaurantAttributes'
      | 'ingredients',
      ArrayExpect
    >
  >;
};

type Analysis = Record<string, unknown>;

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Singular-insensitive containment (same tolerance as prompt-ab.ts). */
function has(haystack: string[], needle: string): boolean {
  const n = norm(needle);
  return haystack.some((value) => {
    const v = norm(value);
    return v === n || v === `${n}s` || `${v}s` === n;
  });
}

const ARRAYS = [
  'restaurants',
  'foods',
  'foodAttributes',
  'restaurantAttributes',
  'ingredients',
] as const;

function grade(
  testCase: Case,
  analysis: Analysis,
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const field of ARRAYS) {
    const expect = testCase.expect[field];
    if (!expect) continue;
    const actual = Array.isArray(analysis[field])
      ? (analysis[field] as string[])
      : [];
    if (expect.empty && actual.length > 0) {
      failures.push(`${field} expected EMPTY, got [${actual.join(', ')}]`);
    }
    for (const group of expect.include ?? []) {
      if (!group.some((term) => has(actual, term))) {
        failures.push(
          `${field} missing any of [${group.join('|')}] (got [${actual.join(', ')}])`,
        );
      }
    }
    for (const term of expect.exclude ?? []) {
      if (has(actual, term)) {
        failures.push(`${field} FORBIDDEN "${term}"`);
      }
    }
  }
  return { pass: failures.length === 0, failures };
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

  const caseFile = arg(
    'case-file',
    join(__dirname, 'fixtures/query-ab-cases.json'),
  ) as string;
  const repeat = parseInt(arg('repeat', '3') as string, 10);
  const only = arg('only');
  const outFile = arg('out');

  const livePath = resolvePrompt(arg('live', 'query-prompt.md') as string);
  const candidatePath = resolvePrompt(
    arg('candidate', 'query-prompt.candidate.md') as string,
  );
  const prompts = {
    live: readFileSync(livePath, 'utf-8'),
    candidate: readFileSync(candidatePath, 'utf-8'),
  };
  let cases = JSON.parse(readFileSync(caseFile, 'utf-8')) as Case[];
  if (only) cases = cases.filter((c) => c.id === only);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);

  console.log(
    `\nQUERY A/B — ${cases.length} cases x ${repeat} runs x 2 prompts = ${cases.length * repeat * 2} calls`,
  );
  console.log(`live=${livePath}\ncandidate=${candidatePath}\n`);

  type Unit = { testCase: Case; variant: 'live' | 'candidate'; index: number };
  const units: Unit[] = [];
  for (const testCase of cases) {
    for (const variant of ['live', 'candidate'] as const) {
      for (let i = 0; i < repeat; i += 1)
        units.push({ testCase, variant, index: i });
    }
  }
  const outcomes = new Map<string, { analysis?: Analysis; error?: string }[]>();
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
          const analysis = (await llm.interpretResidue(
            unit.testCase.query,
            prompts[unit.variant],
          )) as unknown as Analysis;
          outcomes.get(k)!.push({ analysis });
        } catch (error) {
          outcomes.get(k)!.push({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  const results: Array<Record<string, unknown>> = [];
  const tally = { live: 0, candidate: 0, liveFlaky: 0, candidateFlaky: 0 };
  for (const testCase of cases) {
    const row: Record<string, unknown> = {
      id: testCase.id,
      query: testCase.query,
      why: testCase.why,
    };
    for (const variant of ['live', 'candidate'] as const) {
      const runs = outcomes.get(key(testCase.id, variant)) ?? [];
      const graded = runs.map((run) =>
        run.analysis
          ? grade(testCase, run.analysis)
          : { pass: false, failures: [`ERROR: ${run.error}`] },
      );
      const passes = graded.filter((g) => g.pass).length;
      const verdict =
        passes === runs.length ? 'PASS' : passes === 0 ? 'FAIL' : 'FLAKY';
      if (verdict === 'PASS') tally[variant] += 1;
      if (verdict === 'FLAKY')
        tally[variant === 'live' ? 'liveFlaky' : 'candidateFlaky'] += 1;
      row[variant] = {
        verdict,
        passes: `${passes}/${runs.length}`,
        failures: [...new Set(graded.flatMap((g) => g.failures))],
        sample: runs.find((r) => r.analysis)?.analysis ?? null,
      };
    }
    results.push(row);
    const lv = (row.live as { verdict: string }).verdict;
    const cv = (row.candidate as { verdict: string }).verdict;
    console.log(
      `${testCase.id.padEnd(28)} live=${lv.padEnd(6)} candidate=${cv.padEnd(6)}${
        lv !== cv ? '   <-- differs' : ''
      }`,
    );
    for (const variant of ['live', 'candidate'] as const) {
      const failures = (row[variant] as { failures: string[] }).failures;
      if (failures.length)
        console.log(`    ${variant}: ${failures.join(' ; ')}`);
    }
  }
  console.log(
    `\nTOTAL: live ${tally.live}/${cases.length} (${tally.liveFlaky} flaky), candidate ${tally.candidate}/${cases.length} (${tally.candidateFlaky} flaky)`,
  );
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`results written to ${outFile}`);
  }
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
