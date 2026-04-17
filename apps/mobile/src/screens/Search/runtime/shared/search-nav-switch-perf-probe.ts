type SearchNavSwitchPerfProbe = {
  seq: number;
  from: string;
  to: string;
  startedAtMs: number;
  untilMs: number;
};

let nextSearchNavSwitchPerfProbeSeq = 0;
let activeSearchNavSwitchPerfProbe: SearchNavSwitchPerfProbe | null = null;

export const getSearchNavSwitchNowMs = (): number => {
  const perfNow = globalThis.performance?.now?.();
  return typeof perfNow === 'number' && Number.isFinite(perfNow) ? perfNow : Date.now();
};

export const beginSearchNavSwitchPerfProbe = ({
  from,
  to,
  windowMs = 1200,
}: {
  from: string;
  to: string;
  windowMs?: number;
}): SearchNavSwitchPerfProbe => {
  nextSearchNavSwitchPerfProbeSeq += 1;
  activeSearchNavSwitchPerfProbe = {
    seq: nextSearchNavSwitchPerfProbeSeq,
    from,
    to,
    startedAtMs: getSearchNavSwitchNowMs(),
    untilMs: getSearchNavSwitchNowMs() + windowMs,
  };
  return activeSearchNavSwitchPerfProbe;
};

export const getActiveSearchNavSwitchPerfProbe = (): SearchNavSwitchPerfProbe | null => {
  if (!activeSearchNavSwitchPerfProbe) {
    return null;
  }
  if (getSearchNavSwitchNowMs() > activeSearchNavSwitchPerfProbe.untilMs) {
    activeSearchNavSwitchPerfProbe = null;
    return null;
  }
  return activeSearchNavSwitchPerfProbe;
};

export const getActiveSearchNavSwitchProbeAgeMs = (): number | null => {
  const probe = getActiveSearchNavSwitchPerfProbe();
  if (!probe) {
    return null;
  }
  return Number((getSearchNavSwitchNowMs() - probe.startedAtMs).toFixed(1));
};
