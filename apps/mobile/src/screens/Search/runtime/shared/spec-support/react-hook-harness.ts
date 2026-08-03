/**
 * A minimal, faithful React-hooks harness for the hermetic node test project.
 *
 * The mobile jest project has no react-test-renderer and no @testing-library, so
 * hook-shaped runtime code could not be proven at all. This harness implements the
 * four hook primitives the search runtime's bus-reading hooks use, with React's
 * ACTUAL semantics — in particular `useMemo` does NOT re-run when its deps are
 * referentially equal, which is the exact property a "sampled once, never updates"
 * defect hides behind.
 *
 * It is deliberately not a React implementation: renders are manual (`render()`),
 * there is no scheduling, and a store notification only marks the instance dirty.
 * That is enough to answer the one question these specs ask: after the external
 * store changes and the component re-renders, does the hook report the new value?
 */

type Cell = { deps: readonly unknown[] | null; value: unknown };

type Instance = {
  cells: Cell[];
  cursor: number;
  cleanups: Array<() => void>;
  dirtyCount: number;
};

let currentInstance: Instance | null = null;

const requireInstance = (): Instance => {
  if (currentInstance == null) {
    throw new Error('react-hook-harness: hook called outside of render()');
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

const useMemo = <T>(factory: () => T, deps?: readonly unknown[]): T => {
  const instance = requireInstance();
  const index = instance.cursor;
  instance.cursor += 1;
  const cell = instance.cells[index];
  const nextDeps = deps ?? null;
  if (cell != null && depsEqual(cell.deps, nextDeps)) {
    return cell.value as T;
  }
  const value = factory();
  instance.cells[index] = { deps: nextDeps, value };
  return value;
};

const useCallback = <T>(callback: T, deps?: readonly unknown[]): T => useMemo(() => callback, deps);

const useRef = <T>(initial: T): { current: T } => {
  const instance = requireInstance();
  const index = instance.cursor;
  instance.cursor += 1;
  const cell = instance.cells[index];
  if (cell != null) {
    return cell.value as { current: T };
  }
  const ref = { current: initial };
  instance.cells[index] = { deps: null, value: ref };
  return ref;
};

const useSyncExternalStore = <T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T
): T => {
  const instance = requireInstance();
  const index = instance.cursor;
  instance.cursor += 1;
  const cell = instance.cells[index];
  if (cell == null || !Object.is((cell.value as { subscribe: unknown }).subscribe, subscribe)) {
    if (cell != null) {
      (cell.value as { unsubscribe: () => void }).unsubscribe();
    }
    const unsubscribe = subscribe(() => {
      instance.dirtyCount += 1;
    });
    instance.cells[index] = { deps: null, value: { subscribe, unsubscribe } };
    instance.cleanups.push(unsubscribe);
  }
  return getSnapshot();
};

/**
 * Context is not exercised by these specs, but modules under test create contexts at
 * module scope, so the mock must be able to construct one.
 */
const createContext = <T>(defaultValue: T) => ({ Provider: null, Consumer: null, defaultValue });

const useContext = <T>(context: { defaultValue: T }): T => context.defaultValue;

export const reactHookHarnessApi = {
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
  createContext,
  useContext,
};

export const createReactHookHarnessModuleMock = () => ({
  __esModule: true,
  default: reactHookHarnessApi,
  ...reactHookHarnessApi,
});

export type HookHarness<TResult> = {
  render: () => TResult;
  latest: () => TResult;
  dirtyCount: () => number;
  unmount: () => void;
};

export const mountHook = <TResult>(run: () => TResult): HookHarness<TResult> => {
  const instance: Instance = { cells: [], cursor: 0, cleanups: [], dirtyCount: 0 };
  let latest: TResult;
  const render = (): TResult => {
    const previousInstance = currentInstance;
    currentInstance = instance;
    instance.cursor = 0;
    try {
      latest = run();
    } finally {
      currentInstance = previousInstance;
    }
    return latest;
  };
  render();
  return {
    render,
    latest: () => latest,
    dirtyCount: () => instance.dirtyCount,
    unmount: () => {
      instance.cleanups.forEach((cleanup) => cleanup());
      instance.cleanups = [];
    },
  };
};
