/**
 * THE GOLD-HARNESS SHELL, stated once (extracted 2026-09-03).
 *
 * entity-match-gold, attribute-merge-gold and attribute-placement-gold are
 * the same certification machine around three different judges: parse
 * --repeat/--only, load a {cases:[]} fixture, boot the Nest context with
 * crons stopped, tally per-case hits across runs, and grade PASS (n===repeat)
 * / FLAKY (0<n<repeat) / FAIL (0) with exit code 1 unless everything is
 * PASS. Only the judge call and the per-run output line are the script's
 * own. This module is that shell; the scripts keep the judges.
 *
 * Deliberately NOT used by prompt-gold.ts or widening-docket.ts — their
 * shells differ on purpose (grader semantics / docket accounting).
 */
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';

export interface GoldArgs {
  repeat: number;
  only: string | null;
}

/** --repeat=N (default 3) and --only=<case-id>; anything else throws. */
export function parseGoldArgs(argv = process.argv.slice(2)): GoldArgs {
  let repeat = 3;
  let only: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--repeat=')) repeat = Number(arg.split('=')[1]) || 3;
    else if (arg.startsWith('--only=')) only = arg.split('=')[1];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { repeat, only };
}

/** Loads a {cases:[]} fixture and applies the --only filter; an --only that
 *  matches nothing is an error, not an empty (vacuously green) run. */
export function loadGoldCases<T extends { id: string }>(
  fixturePath: string,
  only: string | null = null,
): T[] {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: T[];
  };
  const cases = only
    ? fixture.cases.filter((c) => c.id === only)
    : fixture.cases;
  if (!cases.length) throw new Error(`No cases matched --only=${only}`);
  return cases;
}

/** Nest application context with error/warn logging and crons stopped —
 *  a certification run must never start background work. */
export async function bootGoldApp(): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  return app;
}

export const out = (msg = ''): void => {
  process.stdout.write(`${msg}\n`);
};

/**
 * The ==== CERTIFICATION ==== block: grades every case, prints the verdict
 * line, and sets exit code 1 unless every case PASSed every run.
 * `failureHint` is the script-specific "what to do about it" tail of the
 * NOT CERTIFIED line.
 */
export function certify(
  caseIds: string[],
  hits: Map<string, number>,
  repeat: number,
  { failureHint }: { failureHint: string },
): void {
  out('\n==== CERTIFICATION ====');
  let allPass = true;
  for (const id of caseIds) {
    const n = hits.get(id) ?? 0;
    const grade = n === repeat ? 'PASS' : n > 0 ? 'FLAKY' : 'FAIL';
    if (grade !== 'PASS') allPass = false;
    out(`  ${grade.padEnd(6)} ${n}/${repeat}  ${id}`);
  }
  out(
    allPass
      ? `\nALL ${caseIds.length} CASES PASS x${repeat} — prompt certified`
      : `\nNOT CERTIFIED — ${failureHint}`,
  );
  if (!allPass) process.exitCode = 1;
}
