/**
 * THE HOOK-ORDER GUARD (F1013 / F1012).
 *
 * F1013's finding: in the search runtime the WIRING IS THE HOOK CALL ORDER, and nothing
 * enforces it. F1012's ruling: the ceremonial per-concern hook families may be collapsed,
 * but collapsing changes how many hooks a composition calls and in what order — so the
 * collapse must not be attempted until an order regression is DETECTABLE.
 *
 * This spec is that detector, proven both GREEN (a stable composition passes) and RED
 * (a scratch composition that reorders two hooks on its second render throws, naming the
 * position and both kinds). A guard that cannot show RED is not a guard.
 */
import { mountHook, reactHookHarnessApi as mountHookReact } from './react-hook-harness';

const noopSubscribe = () => () => undefined;

describe('react-hook-harness hook-order guard', () => {
  it('records the hook kinds a composition calls, in call order', () => {
    const harness = mountHook(() => {
      const ref = mountHookReact.useRef(0);
      const value = mountHookReact.useMemo(() => 1, []);
      const callback = mountHookReact.useCallback(() => 2, []);
      const external = mountHookReact.useSyncExternalStore(noopSubscribe, () => 3);
      return { ref, value, callback, external };
    });

    expect(harness.hookSequence()).toEqual([
      'useRef',
      'useMemo',
      'useCallback',
      'useSyncExternalStore',
    ]);
    expect(harness.hookCount()).toBe(4);

    // A stable composition re-renders indefinitely without tripping the guard.
    harness.render();
    harness.render();
    expect(harness.hookSequence()).toEqual([
      'useRef',
      'useMemo',
      'useCallback',
      'useSyncExternalStore',
    ]);
  });

  it('RED PROOF: throws when a composition swaps the order of two hooks on a later render', () => {
    let renderIndex = 0;
    const harness = mountHook(() => {
      renderIndex += 1;
      // Render 1 calls useRef then useMemo; render 2 hoists the useMemo above the useRef —
      // exactly the "group the related hooks together" tidy F1013 warns about.
      if (renderIndex === 1) {
        mountHookReact.useRef(0);
        return mountHookReact.useMemo(() => 'a', []);
      }
      const value = mountHookReact.useMemo(() => 'a', []);
      mountHookReact.useRef(0);
      return value;
    });

    expect(harness.hookSequence()).toEqual(['useRef', 'useMemo']);
    expect(() => harness.render()).toThrow(/hook ORDER changed across renders at position 0/);
  });

  it('RED PROOF: throws when a composition calls a different NUMBER of hooks', () => {
    let renderIndex = 0;
    const harness = mountHook(() => {
      renderIndex += 1;
      const value = mountHookReact.useMemo(() => 'a', []);
      if (renderIndex > 1) {
        // A conditionally-called child hook — what an inlined ceremonial family becomes
        // if its collapse puts a child hook behind a guard clause.
        mountHookReact.useMemo(() => 'b', []);
      }
      return value;
    });

    expect(harness.hookCount()).toBe(1);
    expect(() => harness.render()).toThrow(/hook COUNT changed across renders/);
  });
});
