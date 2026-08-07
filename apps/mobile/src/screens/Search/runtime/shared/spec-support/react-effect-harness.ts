/**
 * An effect-COMMITTING React-hooks harness for the hermetic node lane.
 *
 * `react-hook-harness.ts` deliberately records effect slots without ever invoking them
 * (its header forbids "improving" it into a real effect runner, because a body-spec hook
 * must not fire effects). This is a SEPARATE tool with the opposite contract: it commits
 * `useLayoutEffect`/`useEffect`, runs their cleanups on dep change and on unmount, and lets
 * a test force re-renders. It exists for exactly one class of proof the other harness
 * cannot host: a defect whose mechanism is an EFFECT LIFETIME churning against a timer
 * (F7700 — the dismiss recovery deadline that a mid-dismiss re-render disarmed).
 *
 * It is still not a React implementation: renders are manual, there is no scheduler, and
 * effects flush synchronously (all layout effects, then all passive effects) at the end of
 * each render. That is enough to answer the one question the F7700 spec asks: after a live
 * dismiss arms its recovery deadline, does a forced re-render leave that deadline armed?
 */

type Cell = {
  deps: readonly unknown[] | null;
  value: unknown;
  cleanup: (() => void) | null;
};

type PendingEffect = {
  index: number;
  kind: 'layout' | 'passive';
  effect: () => void | (() => void);
  deps: readonly unknown[] | null;
  changed: boolean;
};

type Instance = {
  cells: Cell[];
  cursor: number;
  pending: PendingEffect[];
};

let currentInstance: Instance | null = null;

const requireInstance = (): Instance => {
  if (currentInstance == null) {
    throw new Error('react-effect-harness: hook called outside of render()');
  }
  return currentInstance;
};

const depsEqual = (left: readonly unknown[] | null, right: readonly unknown[] | null): boolean => {
  if (left == null || right == null) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => Object.is(entry, right[index]));
};

const nextCell = (): { instance: Instance; index: number; cell: Cell | undefined } => {
  const instance = requireInstance();
  const index = instance.cursor;
  instance.cursor += 1;
  return { instance, index, cell: instance.cells[index] };
};

const memoCell = <T>(factory: () => T, deps?: readonly unknown[]): T => {
  const { instance, index, cell } = nextCell();
  const nextDeps = deps ?? null;
  if (cell != null && depsEqual(cell.deps, nextDeps)) {
    return cell.value as T;
  }
  const value = factory();
  instance.cells[index] = { deps: nextDeps, value, cleanup: null };
  return value;
};

const useMemo = <T>(factory: () => T, deps?: readonly unknown[]): T => memoCell(factory, deps);
const useCallback = <T>(callback: T, deps?: readonly unknown[]): T =>
  memoCell(() => callback, deps);

const useRef = <T>(initial: T): { current: T } => {
  const { instance, index, cell } = nextCell();
  if (cell != null) {
    return cell.value as { current: T };
  }
  const ref = { current: initial };
  instance.cells[index] = { deps: null, value: ref, cleanup: null };
  return ref;
};

const useSyncExternalStore = <T>(
  _subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T
): T => {
  nextCell();
  return getSnapshot();
};

const createContext = <T>(defaultValue: T) => ({ Provider: null, Consumer: null, defaultValue });
const useContext = <T>(context: { defaultValue: T }): T => {
  nextCell();
  return context.defaultValue;
};

const scheduleEffect = (
  kind: 'layout' | 'passive',
  effect: () => void | (() => void),
  deps?: readonly unknown[]
): void => {
  const { instance, index, cell } = nextCell();
  const nextDeps = deps ?? null;
  const changed = cell == null || !depsEqual(cell.deps, nextDeps);
  if (cell == null) {
    instance.cells[index] = { deps: nextDeps, value: null, cleanup: null };
  } else {
    instance.cells[index] = { ...cell, deps: nextDeps };
  }
  instance.pending.push({ index, kind, effect, deps: nextDeps, changed });
};

const useLayoutEffect = (effect: () => void | (() => void), deps?: readonly unknown[]): void =>
  scheduleEffect('layout', effect, deps);
const useEffect = (effect: () => void | (() => void), deps?: readonly unknown[]): void =>
  scheduleEffect('passive', effect, deps);

export const reactEffectHarnessApi = {
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
};

export const createReactEffectHarnessModuleMock = () => ({
  __esModule: true,
  default: reactEffectHarnessApi,
  ...reactEffectHarnessApi,
});

export type EffectHookHarness<TResult> = {
  render: () => TResult;
  latest: () => TResult;
  unmount: () => void;
};

const flushEffects = (instance: Instance): void => {
  const run = (kind: 'layout' | 'passive'): void => {
    instance.pending
      .filter((entry) => entry.kind === kind)
      .forEach((entry) => {
        if (!entry.changed) {
          return;
        }
        const cell = instance.cells[entry.index];
        cell.cleanup?.();
        const cleanup = entry.effect();
        cell.cleanup = typeof cleanup === 'function' ? cleanup : null;
      });
  };
  run('layout');
  run('passive');
  instance.pending = [];
};

export const mountHook = <TResult>(run: () => TResult): EffectHookHarness<TResult> => {
  const instance: Instance = { cells: [], cursor: 0, pending: [] };
  let latest: TResult;
  const render = (): TResult => {
    const previous = currentInstance;
    currentInstance = instance;
    instance.cursor = 0;
    instance.pending = [];
    try {
      latest = run();
    } finally {
      currentInstance = previous;
    }
    flushEffects(instance);
    return latest;
  };
  render();
  return {
    render,
    latest: () => latest,
    unmount: () => {
      instance.cells.forEach((cell) => cell.cleanup?.());
    },
  };
};
