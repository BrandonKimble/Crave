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
 * CRONS_ENABLED=false is the global cron kill-switch: ScheduleModule.forRoot()
 * never loads, so every @Cron in the codebase — present and future — is inert.
 * Exists for environments that must never spend unattended (staging holds
 * dev vendor keys; a data load there would otherwise start the
 * embedding-reconciler and places-promotion crons within minutes).
 * Distinct from COLLECTION_SCHEDULER_ENABLED, which gates collection only.
 */
export const isSchedulerRuntime = (): boolean => {
  if ((process.env.CRONS_ENABLED ?? '').trim().toLowerCase() === 'false') {
    return false;
  }
  return isWorkerRuntime();
};
