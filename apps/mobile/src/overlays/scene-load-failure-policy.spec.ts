/**
 * THE FIRST RUNTIME COVERAGE OF `useSceneLoadFailurePolicy` (F2401).
 *
 * The only spec bearing this law's name — `scene-load-failure-law.spec.ts` — is a
 * FILESYSTEM SOURCE SCANNER: it pins the BAN on page-local retry buttons and asserts
 * nothing whatsoever about the policy that ban depends on existing. That spec stays
 * (it guards a different thing), but it can no longer be the only coverage: the ban is
 * safe ONLY because this hook works, and this hook had zero runtime tests while it
 * carried a defect that dropped the root-scene retry subscription on the floor.
 *
 * The RED case is (b): a re-run of the effect while `isError` stays true must leave the
 * presentation-frame subscription LIVE. Restore the old
 * `if (announcedRef.current) return undefined;` early return and (b) goes red — the
 * effect tears the subscription down and never re-establishes it.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const announceFailureIfOnline = jest.fn();

jest.mock('../components/app-modal-store', () => ({
  announceFailureIfOnline: (...args: unknown[]) => announceFailureIfOnline(...args),
}));

type PresentationListener = () => void;

let presentedSceneKey: string | null = null;
const listeners = new Set<PresentationListener>();
const closeActiveRoute = jest.fn();

const routeSceneRuntime = {
  routeOverlayRouteCommandRuntime: { closeActiveRoute },
  routeSceneSwitchRuntime: {
    getPresentationFrame: () => ({ presentedSceneKey }),
    subscribePresentationFrame: (listener: PresentationListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  },
};

jest.mock(
  '../navigation/runtime/AppRouteSceneRuntimeProvider',
  () => ({
    useAppRouteSceneRuntime: () => routeSceneRuntime,
  }),
  { virtual: true }
);

import { useSceneLoadFailurePolicy } from './scene-load-failure-policy';

/** 'polls' carries a posture seat, so it is a ROOT scene (the subscription arm). */
const ROOT_SCENE = 'polls' as never;
/** 'restaurant' carries no seat — a CHILD scene (the pop-on-dismiss arm). */
const CHILD_SCENE = 'restaurant' as never;

const present = (sceneKey: string | null): void => {
  act(() => {
    presentedSceneKey = sceneKey;
    for (const listener of [...listeners]) {
      listener();
    }
  });
};

const renderPolicy = (initialWhat: string) => {
  const retry = jest.fn();
  const Probe: React.FC<{ what: string; isError: boolean; sceneKey: never }> = ({
    what,
    isError,
    sceneKey,
  }) => {
    useSceneLoadFailurePolicy(sceneKey, { isError, what, retry });
    return null;
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Probe, { what: initialWhat, isError: true, sceneKey: ROOT_SCENE })
    );
  });
  const update = (props: { what?: string; isError?: boolean; sceneKey?: never }): void => {
    act(() => {
      renderer.update(
        React.createElement(Probe, {
          what: props.what ?? initialWhat,
          isError: props.isError ?? true,
          sceneKey: props.sceneKey ?? ROOT_SCENE,
        })
      );
    });
  };
  return { retry, update, unmount: () => act(() => renderer.unmount()) };
};

beforeEach(() => {
  announceFailureIfOnline.mockClear();
  closeActiveRoute.mockClear();
  listeners.clear();
  presentedSceneKey = null;
});

describe('useSceneLoadFailurePolicy (F2401)', () => {
  it('(a) announces exactly once per error EDGE, not once per render', () => {
    const { update, unmount } = renderPolicy('these polls');
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(1);
    update({ what: 'these polls' });
    update({ what: 'these polls' });
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('(b) a re-run of the effect while isError stays true leaves the subscription LIVE', () => {
    const { retry, update, unmount } = renderPolicy('these polls');
    expect(listeners.size).toBe(1);

    // `what` is an ordinary render value in the effect's deps: changing it re-runs the
    // effect while the error episode is unchanged. THE DEFECT: cleanup unsubscribes and
    // the announce-once latch early-returns before resubscribing.
    update({ what: 'these polls, renamed' });
    expect(listeners.size).toBe(1);

    // No re-announce (same episode) …
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(1);

    // … but the retry lane still works: a re-presentation announces AND retries.
    present('lists');
    present(ROOT_SCENE);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('(c) every re-presentation is an edge: announce + retry each time', () => {
    const { retry, unmount } = renderPolicy('these polls');
    for (let i = 0; i < 3; i += 1) {
      present('lists');
      present(ROOT_SCENE);
    }
    expect(retry).toHaveBeenCalledTimes(3);
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(4); // 1 edge + 3 returns
    unmount();
  });

  it('leaving the error state tears the subscription down and re-arms the latch', () => {
    const { update, unmount } = renderPolicy('these polls');
    update({ isError: false });
    expect(listeners.size).toBe(0);
    update({ isError: true });
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('a CHILD scene announces with a dismissal that pops, and opens no subscription', () => {
    const Probe: React.FC = () => {
      useSceneLoadFailurePolicy(CHILD_SCENE, { isError: true, what: 'this list' });
      return null;
    };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(Probe));
    });
    expect(listeners.size).toBe(0);
    expect(announceFailureIfOnline).toHaveBeenCalledTimes(1);
    const arg = announceFailureIfOnline.mock.calls[0][0] as { onDismissed: () => void };
    arg.onDismissed();
    expect(closeActiveRoute).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });
});
