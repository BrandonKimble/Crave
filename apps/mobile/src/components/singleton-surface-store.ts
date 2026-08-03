import React from 'react';

/**
 * THE ONE SINGLETON-SURFACE STORE (F880).
 *
 * The app has a family of surfaces that are singular by construction — the app
 * modal, the share modal, the option selector, the score-info sheet, the
 * collaborator modal, the list-edit panel. Each is opened IMPERATIVELY from any
 * handler (`showX(payload)`) and rendered ONCE at the app root by its host, so
 * no surface has to mount a sheet inside a scrollable body (absoluteFill anchors
 * to the content box there, and the sheet lands offscreen).
 *
 * That pattern used to exist as SIX hand-written copies of the same 35 lines —
 * `let current = null`, `const listeners = new Set()`, `emit`, `show`, `close`,
 * `getSnapshot`, `subscribe` — and they drifted exactly the way duplicated
 * primitives do. Specifically:
 *
 *   THE CLOSE-RACES-A-NEWER-OPEN BUG. A close that is deferred by a frame (the
 *   sheet's swipe-dismiss settle, an async flow's tail) can land AFTER a newer
 *   `show` has already opened the next surface — and then it closes a surface
 *   the user just opened and never saw dismissed. It was found and fixed twice,
 *   in `dismissAppModal` and `dismissShareModal`, by making close take the thing
 *   being closed. `closeScoreInfo`, `closeCollaboratorModal` and `closeListEdit`
 *   never got the fix; `closeOptionSelector` reinvented it a third way, matching
 *   on a key.
 *
 * So the fix lives HERE, once, and every instance inherits it: `close(identity)`
 * is a no-op unless the live payload still matches. `identityOf` defaults to the
 * payload's own reference (what the modal stores mean by "the same modal"); a
 * surface whose opener holds a stable key instead of the payload object (the
 * option selector's chip) supplies its own.
 *
 * A surface that forgets the race fix is now unrepresentable — there is nowhere
 * left to forget it.
 */
export type SingletonSurfaceStore<TPayload, TIdentity = TPayload> = {
  /** Open (or UPDATE — a second show replaces the live payload). */
  show: (payload: TPayload) => void;
  /**
   * Close. Pass the identity being closed — the call is IGNORED when the live
   * payload is no longer that one, which is the race fix. Omitting the argument
   * closes unconditionally (a global "dismiss whatever is up").
   */
  close: (identity?: TIdentity) => void;
  getSnapshot: () => TPayload | null;
  subscribe: (listener: () => void) => () => void;
  /** React binding for hosts and for affordances that mirror open-state. */
  useValue: () => TPayload | null;
  /** Identity of the live payload (null when closed) — e.g. a chip asking
   *  "is MY selector the open one?". */
  useIdentity: () => TIdentity | null;
  /** The store's identity rule, so a host can scope its own close correctly. */
  identityOf: (payload: TPayload) => TIdentity;
};

export const createSingletonSurfaceStore = <TPayload, TIdentity = TPayload>(options?: {
  /** Defaults to the payload itself, i.e. reference identity. */
  identityOf?: (payload: TPayload) => TIdentity;
}): SingletonSurfaceStore<TPayload, TIdentity> => {
  const identityOf =
    options?.identityOf ?? ((payload: TPayload): TIdentity => payload as unknown as TIdentity);

  let current: TPayload | null = null;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  const getSnapshot = (): TPayload | null => current;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const show = (payload: TPayload): void => {
    current = payload;
    emit();
  };

  const close = (identity?: TIdentity): void => {
    if (current == null) {
      return;
    }
    if (identity !== undefined && identityOf(current) !== identity) {
      // THE RACE: this close belongs to a surface that is already gone.
      return;
    }
    current = null;
    emit();
  };

  const getIdentitySnapshot = (): TIdentity | null =>
    current == null ? null : identityOf(current);

  return {
    show,
    close,
    getSnapshot,
    subscribe,
    identityOf,
    useValue: () => React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    useIdentity: () => React.useSyncExternalStore(subscribe, getIdentitySnapshot, () => null),
  };
};

/**
 * THE HOST HOOK — the other half of the duplication (six copy-pasted ref dances).
 *
 * A host needs three things at once: whether the sheet is VISIBLE, what to RENDER
 * (the last payload must survive the exit animation or the content blanks
 * mid-slide-out), and a close handler that is SCOPED to the payload it was
 * rendered for — which is precisely how the race fix reaches the UI. Written by
 * hand six times, three of those hands forgot the third part.
 */
export const useSingletonSurfaceHost = <TPayload, TIdentity>(
  store: SingletonSurfaceStore<TPayload, TIdentity>
): {
  /** The LIVE payload — null while closing/closed. Drives `visible`. */
  value: TPayload | null;
  visible: boolean;
  /** What to draw: the live payload, or the last one, through the exit animation. */
  rendered: TPayload | null;
  /** Close THIS payload; a no-op once a newer surface has taken over. */
  requestClose: () => void;
} => {
  const value = store.useValue();
  const lastRef = React.useRef(value);
  if (value != null) {
    lastRef.current = value;
  }
  // Scoped to the payload THIS render drew: if a newer surface opened in the
  // meantime, the close lands on an identity that is no longer live and is
  // correctly ignored.
  const requestClose = React.useCallback(() => {
    if (value != null) {
      store.close(store.identityOf(value));
    }
  }, [store, value]);
  return {
    value,
    visible: value != null,
    rendered: value ?? lastRef.current,
    requestClose,
  };
};
