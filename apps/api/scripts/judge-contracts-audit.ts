/**
 * @script-class: invariant-check
 *
 * JUDGE-CONTRACT AUDIT — the registry's tooth (plans/llm-lane-primitive.md).
 *
 * Loads src/shared/judge-contracts/ and:
 *  (a) prints the coverage table: site × the 8 concerns (versioned bytes /
 *      rule release / ledger / reopen / schema / reason policy / cert suite /
 *      spend tags), each cell OK, DEBT (declared with reason), or VIOLATION;
 *  (b) exits 1 on any VIOLATION — a contract field that contradicts the
 *      code. What is verifiable statically is verified (file existence,
 *      grep-level presence); the rest is trusted as 'declared';
 *  (c) topologically sorts dependsOn and PRINTS the canonical sequencing
 *      order with each dependency's emptiness probe SQL (cycles fail) —
 *      the runbook order as a GENERATED artifact, the R6 lesson;
 *  (d) both-directions completeness: every claim-lane adapter in src has a
 *      contract, and every contract that claims the claim_verdicts ledger
 *      names a lane string that appears in src.
 *
 * NO DATABASE, NO NETWORK — pure static audit; the emptiness probes are
 * printed, never executed. Wired into `yarn invariants` via the registry's
 * prompt.judge-contract entry (mutation-proven: a contract whose lane names
 * a nonexistent lane must make this exit 1).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { topoSort, type JudgeContract } from '../src/shared/judge-contract';
import { JUDGE_CONTRACT_REGISTRY } from '../src/shared/judge-contracts';

const API_ROOT = join(__dirname, '..');
const SRC = join(API_ROOT, 'src');

type Cell = 'OK' | 'DEBT' | 'VIOLATION';
interface Violation {
  lane: string;
  concern: string;
  detail: string;
}
const violations: Violation[] = [];

function violate(lane: string, concern: string, detail: string): Cell {
  violations.push({ lane, concern, detail });
  return 'VIOLATION';
}

/** ripgrep for a literal string under src/, excluding the registry itself
 *  (a lane declared only by its own contract would otherwise self-certify). */
function foundInSrc(literal: string): boolean {
  try {
    const out = execFileSync(
      'grep',
      [
        '-rl',
        '--include=*.ts',
        '--exclude-dir=judge-contracts',
        '-F',
        literal,
        SRC,
      ],
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .some((f) => f.trim() !== '' && !f.endsWith('judge-contract.ts'));
  } catch {
    return false; // grep exit 1 = no match (exit 2 would throw too — absence either way is a red cell, never a silent pass)
  }
}

const PROMPTS_DIR = join(SRC, 'modules/external-integrations/llm/prompts');

function auditPromptKind(c: JudgeContract): Cell {
  if (typeof c.promptKind === 'string') {
    // Declared registry-versioned: the asset file must exist AND the prompt
    // registry must name the kind.
    if (!existsSync(join(PROMPTS_DIR, c.promptKind))) {
      return violate(
        c.lane,
        'versioned bytes',
        `promptKind '${c.promptKind}' names no file in llm/prompts/`,
      );
    }
    const registrySource = readFileSync(
      join(SRC, 'modules/external-integrations/llm/prompt-registry.service.ts'),
      'utf8',
    );
    if (!registrySource.includes(c.promptKind)) {
      return violate(
        c.lane,
        'versioned bytes',
        `promptKind '${c.promptKind}' is declared registry-versioned but prompt-registry.service.ts never names it`,
      );
    }
    return 'OK';
  }
  return 'DEBT';
}

function auditRule(c: JudgeContract): Cell {
  if ('releaseFile' in c.rule) {
    return existsSync(join(SRC, c.rule.releaseFile))
      ? 'OK'
      : violate(
          c.lane,
          'rule release',
          `rule.releaseFile '${c.rule.releaseFile}' does not exist`,
        );
  }
  return 'DEBT';
}

function auditLedger(c: JudgeContract): Cell {
  if (c.ledger === 'claim_verdicts') {
    // The lane string must appear in src, or the contract claims a ledger
    // the code never writes (the exact lie the brief forbids).
    return foundInSrc(`'${c.lane}'`)
      ? 'OK'
      : violate(
          c.lane,
          'ledger',
          `declares ledger claim_verdicts but the lane string '${c.lane}' appears nowhere in src`,
        );
  }
  if ('ownTable' in c.ledger) return 'DEBT'; // a declared divergence, not the ideal
  return 'DEBT';
}

function auditReopen(c: JudgeContract): Cell {
  if (typeof c.reopenOn === 'string') return 'OK';
  return c.reopenOn.final.startsWith('DECLARED DEBT') ? 'DEBT' : 'OK'; // an owner-ruled { final } IS the ideal shape
}

function auditSchema(c: JudgeContract): Cell {
  return 'source' in c.responseSchema ? 'OK' : 'DEBT';
}

function auditReason(c: JudgeContract): Cell {
  return 'required' in c.reasonPolicy ? 'OK' : 'DEBT';
}

function auditCert(c: JudgeContract): Cell {
  if ('script' in c.certSuite) {
    if (!existsSync(join(API_ROOT, c.certSuite.script))) {
      return violate(
        c.lane,
        'cert suite',
        `certSuite.script '${c.certSuite.script}' does not exist`,
      );
    }
    if (
      c.certSuite.fixtures &&
      !existsSync(join(API_ROOT, c.certSuite.fixtures))
    ) {
      return violate(
        c.lane,
        'cert suite',
        `certSuite.fixtures '${c.certSuite.fixtures}' does not exist`,
      );
    }
    return 'OK';
  }
  return 'DEBT';
}

const PROFILES_SOURCE = readFileSync(
  join(SRC, 'modules/external-integrations/llm/gemini-caller-profiles.ts'),
  'utf8',
);

function auditSpend(c: JudgeContract): Cell {
  for (const caller of [c.spend.caller, ...(c.spend.extraCallers ?? [])]) {
    if (!PROFILES_SOURCE.includes(`'${caller}'`)) {
      return violate(
        c.lane,
        'spend tags',
        `caller '${caller}' has no GEMINI_CALLER_PROFILES entry`,
      );
    }
  }
  return 'OK';
}

interface Row {
  lane: string;
  cells: Record<string, Cell>;
}

const CONCERNS = [
  'versioned bytes',
  'rule release',
  'ledger',
  'reopen',
  'schema',
  'reason policy',
  'cert suite',
  'spend tags',
] as const;

function auditContract(c: JudgeContract): Row {
  return {
    lane: c.lane,
    cells: {
      'versioned bytes': auditPromptKind(c),
      'rule release': auditRule(c),
      ledger: auditLedger(c),
      reopen: auditReopen(c),
      schema: auditSchema(c),
      'reason policy': auditReason(c),
      'cert suite': auditCert(c),
      'spend tags': auditSpend(c),
    },
  };
}

/**
 * (d) BOTH-DIRECTIONS COMPLETENESS.
 * Direction 1: every `extends BaseClaimLaneAdapter` / `implements
 * ClaimLaneAdapter` subclass in src resolves to a lane the registry knows.
 * Direction 2 is auditLedger above (every claim_verdicts contract's lane
 * string appears in src).
 */
function adapterLanesInSrc(): string[] {
  const files = execFileSync(
    'grep',
    [
      '-rl',
      '--include=*.ts',
      '-E',
      'extends (BaseClaimLaneAdapter|WordVocabularyLaneAdapter)|implements ClaimLaneAdapter',
      SRC,
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(
      (f) =>
        f.trim() !== '' &&
        !f.includes('.spec.') &&
        !f.endsWith('claim-lane-adapter.ts'),
    );
  const lanes = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Lane constants (`export const X_LANE = '...'`) in the adapter's file…
    for (const m of source.matchAll(
      /export const [A-Z0-9_]*LANE = '([^']+)'/g,
    )) {
      lanes.add(m[1]);
    }
    // …or literal lane strings on the adapter (`readonly lane = '...'`).
    for (const m of source.matchAll(/readonly lane = '([^']+)'/g)) {
      lanes.add(m[1]);
    }
  }
  if (lanes.size === 0) {
    throw new Error(
      'Adapter scan found ZERO lanes — the scan is blind (the vacuity mode this repo keeps re-finding). Fix the scan before trusting anything else here.',
    );
  }
  return [...lanes].sort();
}

function run(): number {
  const registry = JUDGE_CONTRACT_REGISTRY;
  const rows = registry.contracts.map(auditContract);

  // Coverage table
  const laneWidth = Math.max(...rows.map((r) => r.lane.length), 4) + 2;
  console.log('JUDGE CONTRACT COVERAGE — site × concern\n');
  console.log(
    'lane'.padEnd(laneWidth) + CONCERNS.map((c) => c.padEnd(17)).join(''),
  );
  for (const row of rows) {
    console.log(
      row.lane.padEnd(laneWidth) +
        CONCERNS.map((c) => row.cells[c].padEnd(17)).join(''),
    );
  }
  const counts: Record<Cell, number> = { OK: 0, DEBT: 0, VIOLATION: 0 };
  for (const row of rows) for (const c of CONCERNS) counts[row.cells[c]] += 1;
  console.log(
    `\ncells: ${counts.OK} OK · ${counts.DEBT} DECLARED-DEBT · ${counts.VIOLATION} VIOLATION\n`,
  );

  // (d) direction 1: adapters without contracts
  const declared = new Set(registry.contracts.map((c) => c.lane));
  for (const lane of adapterLanesInSrc()) {
    if (!declared.has(lane)) {
      violations.push({
        lane,
        concern: 'completeness',
        detail: `claim-lane adapter lane '${lane}' has NO JudgeContract — a lane exists the registry does not know`,
      });
    }
  }

  // (c) sequencing DAG
  console.log('CANONICAL SEQUENCING ORDER (dependency-first, generated):\n');
  let order: readonly string[] = [];
  try {
    const topo = topoSort(registry);
    if (topo.cycle.length > 0) {
      violations.push({
        lane: topo.cycle.join(' → '),
        concern: 'sequencing',
        detail: 'dependsOn DAG has a cycle',
      });
    }
    order = topo.order;
  } catch (error) {
    violations.push({
      lane: '(registry)',
      concern: 'sequencing',
      detail: (error as Error).message,
    });
  }
  const probes = new Map<string, { on: string; sql: string }[]>();
  for (const c of registry.contracts) {
    if (c.dependsOn?.length)
      probes.set(
        c.lane,
        c.dependsOn.map((d) => ({ on: d.on, sql: d.emptinessProbeSql })),
      );
  }
  for (const c of registry.consumers) {
    if (c.dependsOn.length)
      probes.set(
        c.id,
        c.dependsOn.map((d) => ({ on: d.on, sql: d.emptinessProbeSql })),
      );
  }
  order.forEach((id, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${id}`);
    for (const probe of probes.get(id) ?? []) {
      console.log(`        needs ${probe.on} non-empty: ${probe.sql}`);
    }
  });

  if (violations.length > 0) {
    console.log(`\n${violations.length} VIOLATION(S):\n`);
    for (const v of violations) {
      console.log(`  [${v.lane}] ${v.concern}: ${v.detail}`);
    }
    return 1;
  }
  console.log(
    '\nEvery declaration matches the code, every adapter has a contract, the DAG is acyclic.',
  );
  return 0;
}

process.exit(run());
