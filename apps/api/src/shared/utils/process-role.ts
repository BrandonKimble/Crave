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

export const isSchedulerRuntime = (): boolean => isWorkerRuntime();
