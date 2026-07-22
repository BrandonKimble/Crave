import React from 'react';

import type { GeoBbox, PlaceLike } from '@crave-search/shared';

import type { MapBounds } from '../types';

/**
 * THE client subject store (header subject-store design, ratified 2026-07-21):
 * every place-name mouth in the app reads ONE verdict — computed ON DEVICE from
 * a sliding catalog slice (GET /places/in-view) with the SAME shared §2 law
 * (@crave-search/shared resolveHeaderPlace) the server runs. Module-scope
 * subscribable store (the search-map-selection-focus-store.ts pattern): the
 * writer is the search runtime's viewport subject controller
 * (use-viewport-subject-store-controller-runtime.ts — a runtime hook whose
 * effects FIRE, never a scene body-spec hook); readers are the mouths (polls
 * header, on-demand notice, poll-creation title) via useViewportSubjectState.
 *
 * verdict semantics:
 *   - { kind: 'place' }     → a §2-commensurate (or containing-fallback) named
 *                             place — "Polls in Austin".
 *   - { kind: 'this-area' } → the §2 reservation: multi-place straddle or
 *                             unnamed ground — "Polls in this area".
 *   - null                  → UNKNOWN: no commit yet (cold start before the
 *                             first slice + settle). Mouths keep their legacy
 *                             fallback (server header.placeName, route params)
 *                             ONLY while the verdict is null; after the first
 *                             commit the store is the title authority.
 *
 * slice/marginBox are the sliding catalog cache: while the live view stays
 * inside marginBox (the server's ×3-expanded cache-validity region), the local
 * law is authoritative and no network is needed.
 */
export type ViewportSubjectVerdict =
  | { kind: 'place'; placeId: string; placeName: string }
  | { kind: 'this-area' };

export type ViewportSubjectState = {
  verdict: ViewportSubjectVerdict | null;
  slice: PlaceLike[] | null;
  marginBox: GeoBbox | null;
  lastCommittedAt: number | null;
  /**
   * THE settled viewport (leg 3): the exact bounds the settle+dwell primitive
   * judged at its last settle edge (240ms stream quiescence). Written ONLY by
   * the controller's settle tick, so a store notification where this reference
   * turned over IS the settle event — bounds-scoped consumers (the polls feed)
   * subscribe to it instead of running their own idle/significance machinery.
   * Null until the first settle (cold start).
   */
  settledBounds: MapBounds | null;
};

type Listener = () => void;

const INITIAL_STATE: ViewportSubjectState = {
  verdict: null,
  slice: null,
  marginBox: null,
  lastCommittedAt: null,
  settledBounds: null,
};

let currentState: ViewportSubjectState = INITIAL_STATE;
const listeners = new Set<Listener>();

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

export const getViewportSubjectState = (): ViewportSubjectState => currentState;

/** Partial merge write — the controller is the only writer. */
export const setViewportSubjectState = (partial: Partial<ViewportSubjectState>): void => {
  const next = { ...currentState, ...partial };
  if (
    next.verdict === currentState.verdict &&
    next.slice === currentState.slice &&
    next.marginBox === currentState.marginBox &&
    next.lastCommittedAt === currentState.lastCommittedAt &&
    next.settledBounds === currentState.settledBounds
  ) {
    return;
  }
  currentState = next;
  notify();
};

/** Test/session-reset hook; not used by production flows. */
export const resetViewportSubjectStore = (): void => {
  currentState = INITIAL_STATE;
  notify();
};

export const subscribeViewportSubjectState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * One identity token per verdict value — the hysteresis controller and the
 * dwell dedupe both compare verdicts through this (never object identity).
 */
export const viewportSubjectVerdictIdentity = (verdict: ViewportSubjectVerdict | null): string => {
  if (verdict == null) {
    return 'unknown';
  }
  return verdict.kind === 'place' ? `place:${verdict.placeId}` : 'this-area';
};

/** Mouth-side read: re-renders on every store commit (useSyncExternalStore). */
export const useViewportSubjectState = (): ViewportSubjectState =>
  React.useSyncExternalStore(subscribeViewportSubjectState, getViewportSubjectState);
