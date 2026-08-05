import { SearchRuntimeBus } from './search-runtime-bus';

// F1004: notify() must isolate one listener's throw from the rest of the fan-out. Before the
// fix, `this.listeners.forEach((listenerRecord, listener) => { ... listener(); ... })` called
// each listener with no try/catch — a throwing listener aborted forEach entirely, so every
// listener registered AFTER it in iteration order was silently never notified for that change.
describe('SearchRuntimeBus notify() listener isolation (F1004)', () => {
  it('still notifies a listener registered after one that throws', () => {
    const bus = new SearchRuntimeBus();
    const laterListener = jest.fn();

    bus.subscribe(() => {
      throw new Error('boom from an earlier subscriber');
    });
    bus.subscribe(laterListener);

    bus.publish({ activeTab: 'restaurants' });

    // RED under the reverted defect: laterListener was never called because the throwing
    // listener aborted the forEach loop before iteration reached it.
    expect(laterListener).toHaveBeenCalledTimes(1);
  });

  it('does not let a throwing listener desync version from delivered notifications', () => {
    const bus = new SearchRuntimeBus();
    const versionAtNotify: number[] = [];

    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(() => {
      versionAtNotify.push(bus.getVersion());
    });

    bus.publish({ activeTab: 'restaurants' });

    expect(versionAtNotify).toHaveLength(1);
  });
});
