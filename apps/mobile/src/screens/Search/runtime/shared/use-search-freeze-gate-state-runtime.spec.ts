import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';
import { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';

jest.mock('react', () => createReactHookHarnessModuleMock());

describe('useSearchFreezeGateStateRuntime', () => {
  it('reports the freeze edge published after the first render (never a boot-time sample)', () => {
    const bus = new SearchRuntimeBus();
    const harness = mountHook(() => useSearchFreezeGateStateRuntime(bus));

    expect(harness.latest()).toEqual({
      isSearchSurfaceRedrawChromeFreezeActive: false,
      isSearchSurfaceRedrawPreflightFreezeActive: false,
      isSearchSurfaceRedrawActive: false,
      isResponseFrameFreezeActive: false,
      freezeClassification: 'none',
    });

    bus.publish({ isResponseFrameFreezeActive: true });

    expect(harness.dirtyCount()).toBeGreaterThan(0);
    expect(harness.render()).toEqual({
      isSearchSurfaceRedrawChromeFreezeActive: false,
      isSearchSurfaceRedrawPreflightFreezeActive: false,
      isSearchSurfaceRedrawActive: false,
      isResponseFrameFreezeActive: true,
      freezeClassification: 'recovery',
    });

    bus.publish({ isSearchSurfaceRedrawChromeFreezeActive: true });
    expect(harness.render().isSearchSurfaceRedrawChromeFreezeActive).toBe(true);

    bus.publish({
      isResponseFrameFreezeActive: false,
      isSearchSurfaceRedrawChromeFreezeActive: false,
    });
    expect(harness.render().freezeClassification).toBe('none');

    harness.unmount();
  });

  it('keeps the sample referentially stable across re-renders with no bus edge', () => {
    const bus = new SearchRuntimeBus();
    const harness = mountHook(() => useSearchFreezeGateStateRuntime(bus));

    const first = harness.latest();
    expect(harness.render()).toBe(first);

    bus.publish({ isSearchSurfaceRedrawActive: true });
    const afterEdge = harness.render();
    expect(afterEdge).not.toBe(first);
    expect(harness.render()).toBe(afterEdge);

    harness.unmount();
  });

  it('drops its bus subscription on unmount', () => {
    const bus = new SearchRuntimeBus();
    const harness = mountHook(() => useSearchFreezeGateStateRuntime(bus));

    expect(bus.readDiagnostics().listenerCount).toBeGreaterThan(0);
    harness.unmount();
    expect(bus.readDiagnostics().listenerCount).toBe(0);
  });
});
