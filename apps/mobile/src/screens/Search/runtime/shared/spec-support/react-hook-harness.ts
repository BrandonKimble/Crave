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

type HookKind =
  | 'useMemo'
  | 'useCallback'
  | 'useRef'
  | 'useSyncExternalStore'
  | 'useContext'
  | 'useEffect'
  | 'useLayoutEffect';

type Cell = { deps: readonly unknown[] | null; value: unknown };

type Instance = {
  cells: Cell[];
  cursor: number;
  cleanups: Array<() => void>;
  dirtyCount: number;
  /** Hook kinds recorded during the render currently in flight. */
  sequence: HookKind[];
  /** The sequence recorded by the FIRST render — the contract every later render must match. */
  baselineSequence: HookKind[] | null;
  renderCount: number;
};

let currentInstance: Instance | null = null;

const requireInstance = (): Instance => {
  if (currentInstance == null) {
    throw new Error('react-hook-harness: hook called outside of render()');
  }
  return currentInstance;
};

/**
 * Reserve the next hook slot and RECORD ITS KIND.
 *
 * The recording is the whole point of the hook-order guard (F1013): the wiring of the
 * search runtime is the hook CALL ORDER, and nothing in the type system enforces it.
 * A composition that calls its child hooks in a different order — or a different number
 * of them — on a later render is the exact defect class that collapsing ceremonial
 * per-concern hook files can introduce. React catches this at runtime with an opaque
 * "Rendered more hooks than during the previous render"; here it is caught in a spec,
 * with the position and both kinds named.
 */
const allocateCell = (kind: HookKind): { instance: Instance; index: number } => {
  const instance = requireInstance();
  const index = instance.cursor;
  instance.cursor += 1;
  instance.sequence.push(kind);
  return { instance, index };
};

class HookOrderViolationError extends Error {}

const assertStableHookSequence = (instance: Instance): void => {
  const baseline = instance.baselineSequence;
  const observed = instance.sequence;
  if (baseline == null) {
    instance.baselineSequence = [...observed];
    return;
  }
  if (baseline.length !== observed.length) {
    throw new HookOrderViolationError(
      `react-hook-harness: hook COUNT changed across renders — render #${instance.renderCount} ` +
        `called ${observed.length} hooks, the first render called ${baseline.length}.\n` +
        `  first:  ${baseline.join(' -> ')}\n  now:    ${observed.join(' -> ')}`
    );
  }
  const divergence = observed.findIndex((kind, index) => kind !== baseline[index]);
  if (divergence !== -1) {
    throw new HookOrderViolationError(
      `react-hook-harness: hook ORDER changed across renders at position ${divergence} — ` +
        `render #${instance.renderCount} called ${observed[divergence]}, ` +
        `the first render called ${baseline[divergence]}.\n` +
        `  first:  ${baseline.join(' -> ')}\n  now:    ${observed.join(' -> ')}`
    );
  }
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

const memoCell = <T>(kind: HookKind, factory: () => T, deps?: readonly unknown[]): T => {
  const { instance, index } = allocateCell(kind);
  const cell = instance.cells[index];
  const nextDeps = deps ?? null;
  if (cell != null && depsEqual(cell.deps, nextDeps)) {
    return cell.value as T;
  }
  const value = factory();
  instance.cells[index] = { deps: nextDeps, value };
  return value;
};

const useMemo = <T>(factory: () => T, deps?: readonly unknown[]): T =>
  memoCell('useMemo', factory, deps);

const useCallback = <T>(callback: T, deps?: readonly unknown[]): T =>
  memoCell('useCallback', () => callback, deps);

const useRef = <T>(initial: T): { current: T } => {
  const { instance, index } = allocateCell('useRef');
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
  const { instance, index } = allocateCell('useSyncExternalStore');
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

const useContext = <T>(context: { defaultValue: T }): T => {
  allocateCell('useContext');
  return context.defaultValue;
};

/**
 * `useEffect` occupies a hook SLOT and nothing more.
 *
 * The harness never commits, so the effect body is NEVER invoked — that is deliberate and
 * matches this repo's standing law that body-spec hooks do not fire effects. The slot must
 * still be recorded, because a composition that owns controller LIFETIMES (the
 * `use-search-runtime-controller-runtime` family) calls `useEffect` for disposal, and its
 * position is part of the F1013 wiring contract just like every other hook.
 *
 * Do NOT "improve" this into a real effect runner without also deciding what unmount means;
 * a half-real effect is worse than an honestly absent one.
 */
const useEffect = (_effect: () => void | (() => void), _deps?: readonly unknown[]): void => {
  allocateCell('useEffect');
};

/** Same contract as `useEffect` above: a recorded slot, never invoked. */
const useLayoutEffect = (_effect: () => void | (() => void), _deps?: readonly unknown[]): void => {
  allocateCell('useLayoutEffect');
};

export const reactHookHarnessApi = {
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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
  /** The hook kinds the most recent render called, in order. */
  hookSequence: () => readonly HookKind[];
  /** How many hooks the composition calls per render — the F1013 wiring contract, as a number. */
  hookCount: () => number;
  unmount: () => void;
};

export const mountHook = <TResult>(run: () => TResult): HookHarness<TResult> => {
  const instance: Instance = {
    cells: [],
    cursor: 0,
    cleanups: [],
    dirtyCount: 0,
    sequence: [],
    baselineSequence: null,
    renderCount: 0,
  };
  let latest: TResult;
  const render = (): TResult => {
    const previousInstance = currentInstance;
    currentInstance = instance;
    instance.cursor = 0;
    instance.sequence = [];
    instance.renderCount += 1;
    try {
      latest = run();
    } finally {
      currentInstance = previousInstance;
    }
    assertStableHookSequence(instance);
    return latest;
  };
  render();
  return {
    render,
    latest: () => latest,
    dirtyCount: () => instance.dirtyCount,
    hookSequence: () => [...instance.sequence],
    hookCount: () => instance.sequence.length,
    unmount: () => {
      instance.cleanups.forEach((cleanup) => cleanup());
      instance.cleanups = [];
    },
  };
};
