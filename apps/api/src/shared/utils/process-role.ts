import { isEnvFlagEnabled } from '../config/env-flag';

export type ProcessRole = 'all' | 'api' | 'worker';

const DEFAULT_PROCESS_ROLE: ProcessRole = 'all';

let cachedProcessRole: ProcessRole | null = null;

const normalizeRole = (raw: string | undefined): ProcessRole | null => {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'api' || normalized === 'worker') {
    return normalized;
  }
  return null;
};

export const resolveProcessRole = (): ProcessRole => {
  if (cachedProcessRole) {
    return cachedProcessRole;
  }
  cachedProcessRole =
    normalizeRole(process.env.PROCESS_ROLE) ?? DEFAULT_PROCESS_ROLE;
  return cachedProcessRole;
};

export const isApiRuntime = (): boolean => {
  const role = resolveProcessRole();
  return role === 'all' || role === 'api';
};

export const isWorkerRuntime = (): boolean => {
  const role = resolveProcessRole();
  return role === 'all' || role === 'worker';
};

/**
 * CRONS_ENABLED is the global cron kill-switch: turn it off and
 * ScheduleModule.forRoot() never loads, so every @Cron in the codebase —
 * present and future — is inert. Exists for environments that must never spend
 * unattended (staging holds dev vendor keys; a data load there would otherwise
 * start the embedding-reconciler and places-promotion crons within minutes).
 * Distinct from COLLECTION_SCHEDULER_ENABLED, which gates collection only.
 *
 * ABSENT ⇒ ON (crons are the default in a worker runtime); every off-spelling
 * the codebase's canonical reader accepts turns them OFF.
 *
 * WHY THE CANONICAL READER (audit 2026-08-02, F401). This used to test
 * `=== 'false'` by hand, so ONLY the literal `false`/`FALSE` disabled crons:
 * an operator typing `CRONS_ENABLED=0`, `no` or `off` got the crons RUNNING —
 * unattended vendor spend, from the switch whose whole job is preventing it.
 * `env-flag.ts` lists that exact `=== 'false'` dialect as one of the four it
 * was written to exterminate. Prod's current `CRONS_ENABLED=false` spelling is
 * unaffected: it meant off before and means off now.
 */
export const isSchedulerRuntime = (): boolean => {
  if (!isEnvFlagEnabled(process.env.CRONS_ENABLED, true)) {
    return false;
  }
  return isWorkerRuntime();
};
