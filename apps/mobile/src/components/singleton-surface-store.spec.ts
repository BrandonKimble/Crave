/**
 * F880 — THE RACE SPEC, attached to the factory rather than to one surface.
 *
 * The close-races-a-newer-open bug was found and fixed TWICE by hand (app modal,
 * share modal), reinvented a third way (option selector, keyed), and forgotten
 * three times (score info, collaborator modal, list edit). It now has exactly one
 * home, so it is proved once and inherited by every instance.
 *
 * RED recipe: delete the identity guard in `close` (the
 * `identityOf(current) !== identity` early return) and every "…cannot kill the
 * newer surface" case below fails.
 */
import { createSingletonSurfaceStore } from './singleton-surface-store';

type Payload = { label: string; key: string };

describe('createSingletonSurfaceStore', () => {
  it('shows, snapshots, and notifies subscribers', () => {
    const store = createSingletonSurfaceStore<Payload>();
    const seen: Array<Payload | null> = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()));

    const first = { label: 'first', key: 'a' };
    store.show(first);
    expect(store.getSnapshot()).toBe(first);
    store.close(first);
    expect(store.getSnapshot()).toBeNull();

    expect(seen).toEqual([first, null]);
    unsubscribe();
    store.show(first);
    expect(seen).toHaveLength(2); // unsubscribed: no further notifications
  });

  it('THE RACE: a deferred close cannot kill the surface that replaced it', () => {
    const store = createSingletonSurfaceStore<Payload>();
    const first = { label: 'first', key: 'a' };
    const second = { label: 'second', key: 'b' };

    store.show(first);
    // …the user swipes `first` away; the sheet defers onRequestClose one frame.
    // In that gap an async flow opens `second`.
    store.show(second);
    // The deferred close finally lands, carrying the identity it was fired for.
    store.close(first);

    expect(store.getSnapshot()).toBe(second);
  });

  it('an identity-less close is the deliberate unconditional dismiss', () => {
    const store = createSingletonSurfaceStore<Payload>();
    store.show({ label: 'first', key: 'a' });
    store.close();
    expect(store.getSnapshot()).toBeNull();
  });

  it('closing an already-closed surface is a silent no-op', () => {
    const store = createSingletonSurfaceStore<Payload>();
    let emits = 0;
    store.subscribe(() => {
      emits += 1;
    });
    store.close();
    store.close({ label: 'gone', key: 'a' });
    expect(emits).toBe(0);
  });

  it('a custom identity (the option selector keys by chip id) obeys the same law', () => {
    const store = createSingletonSurfaceStore<Payload, string>({
      identityOf: (payload) => payload.key,
    });
    const sortSelector = { label: 'sort', key: 'poll-feed-sort' };
    const priceSelector = { label: 'price', key: 'price' };

    store.show(sortSelector);
    store.show(priceSelector);
    // The sort chip's stale close must not shut the price selector.
    store.close('poll-feed-sort');
    expect(store.getSnapshot()).toBe(priceSelector);

    // A NEW config object with the SAME key is the same surface — reference
    // identity would wrongly refuse this close.
    store.close('price');
    expect(store.getSnapshot()).toBeNull();
  });

  it('useIdentity reports the open surface, so a chip knows if it is the open one', () => {
    const store = createSingletonSurfaceStore<Payload, string>({
      identityOf: (payload) => payload.key,
    });
    expect(store.getSnapshot()).toBeNull();
    store.show({ label: 'sort', key: 'poll-feed-sort' });
    expect(store.identityOf(store.getSnapshot() as Payload)).toBe('poll-feed-sort');
  });

  it('show on a live surface UPDATES it (roster refetch, invite state) without closing', () => {
    const store = createSingletonSurfaceStore<Payload>();
    const opened = { label: 'roster', key: 'a' };
    const refreshed = { label: 'roster (kicked one)', key: 'a' };
    store.show(opened);
    store.show(refreshed);
    expect(store.getSnapshot()).toBe(refreshed);
  });

  it('instances are independent — one surface closing never touches another', () => {
    const modals = createSingletonSurfaceStore<Payload>();
    const sheets = createSingletonSurfaceStore<Payload>();
    const modal = { label: 'modal', key: 'a' };
    const sheet = { label: 'sheet', key: 'a' };
    modals.show(modal);
    sheets.show(sheet);
    modals.close(modal);
    expect(modals.getSnapshot()).toBeNull();
    expect(sheets.getSnapshot()).toBe(sheet);
  });
});
