/**
 * F1327(b) — THE FALSIFIER THE ROW ASKED FOR.
 *
 * The row said: "prove it on a StrictMode run before calling it benign." This is
 * that run. `useSnapshotAuthority` used to detect change DURING RENDER
 * (`didChange = !isEqual(prev, snapshot)` followed by writing `snapshotRef`),
 * and consume that edge in a `useLayoutEffect`. Render-phase mutation is not
 * idempotent: React's double-invoked render (StrictMode, dev) runs the body
 * twice per commit, the first pass advances `snapshotRef`, the second pass
 * therefore computes `didChange === false`, and the effect SKIPS the notify.
 * Every subscriber of every `*-authority-runtime` built on this primitive
 * silently loses that update.
 *
 * The fix separates the two jobs the one ref was doing: `snapshotRef` still
 * tracks the live value for `getSnapshot` (an unconditional, therefore
 * idempotent, assignment) while a second ref advanced ONLY inside the effect
 * marks what has actually been notified. A repeated render cannot consume an
 * edge it does not write.
 *
 * Runs in the hermetic node lane — react-test-renderer needs no simulator.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import { useSnapshotAuthority, type SnapshotAuthority } from './use-snapshot-authority';

type Snapshot = { value: number };

const renderAuthority = (strict: boolean) => {
  const notifications: number[] = [];
  let authority: SnapshotAuthority<Snapshot> | null = null;
  let setValue: ((next: number) => void) | null = null;

  const Probe = (): null => {
    const [value, setLocal] = React.useState(0);
    setValue = setLocal;
    const snapshot = React.useMemo<Snapshot>(() => ({ value }), [value]);
    authority = useSnapshotAuthority<Snapshot>(snapshot, {
      isEqual: (left, right) => left.value === right.value,
    });
    return null;
  };

  const element = React.createElement(Probe);
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      strict ? React.createElement(React.StrictMode, null, element) : element
    );
  });

  // Subscribe AFTER mount so only post-subscription edges are counted.
  const unsubscribe = authority!.subscribe(() => {
    notifications.push(authority!.getSnapshot().value);
  });

  return {
    get authority(): SnapshotAuthority<Snapshot> {
      return authority!;
    },
    notifications,
    push: (next: number) => {
      act(() => {
        setValue!(next);
      });
    },
    getSnapshot: () => authority!.getSnapshot(),
    teardown: () => {
      unsubscribe();
      act(() => {
        renderer!.unmount();
      });
    },
  };
};

describe('useSnapshotAuthority', () => {
  it.each([
    ['without StrictMode', false],
    ['under StrictMode double-render', true],
  ])('delivers every snapshot edge to subscribers (%s)', (_label, strict) => {
    const probe = renderAuthority(strict as boolean);

    probe.push(1);
    probe.push(2);
    probe.push(3);

    // THE ASSERTION THAT GOES RED ON THE RENDER-PHASE EDGE CONSUMPTION.
    // Not `.length > 0` — an every()/non-empty shape would pass on a partial
    // delivery, which is exactly the bug. Each edge, in order, exactly once.
    expect(probe.notifications).toEqual([1, 2, 3]);
    expect(probe.getSnapshot()).toEqual({ value: 3 });

    probe.teardown();
  });

  it('does not re-notify when the snapshot is equal by the supplied comparator', () => {
    const probe = renderAuthority(false);

    probe.push(1);
    probe.push(1);
    probe.push(2);

    expect(probe.notifications).toEqual([1, 2]);

    probe.teardown();
  });

  it('delivers selector subscriptions on every edge, under StrictMode too', () => {
    const probe = renderAuthority(true);
    const seen: number[] = [];
    // subscribeSelector is optional on the TYPE but always present on an
    // authority minted by this hook; assert that rather than optional-chaining
    // past it — an absent implementation must fail loudly, not skip the test.
    expect(typeof probe.authority.subscribeSelector).toBe('function');
    let selected = probe.authority.getSnapshot().value;
    probe.authority.subscribeSelector!(
      (snapshot) => snapshot.value,
      () => {
        selected = probe.authority.getSnapshot().value;
        seen.push(selected);
      },
      undefined,
      'spec-label'
    );

    probe.push(1);
    probe.push(2);

    expect(seen).toEqual([1, 2]);

    probe.teardown();
  });
});
