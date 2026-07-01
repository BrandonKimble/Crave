import type { OverlayKey } from './app-overlay-route-types';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Capture).
//
// Source-agnostic capture registry. Each scene snapshots ITSELF — it registers a
// provider keyed by its sceneKey that reads its OWN feed runtime / controller (live
// scroll SharedValue + active-segment state), NOT a render-body hook (CLAUDE.md:
// effects don't fire in scene body-spec hooks).
//
// The single capture chokepoint (captureSearchSessionOrigin) calls
// `getOriginCaptureProvider(activeSceneKey)?.() ?? degenerate(activeSceneKey, liveDetent)`.
// Adding a new return-to-origin source = register a provider here + a route/params +
// captureOrigin — and NOTHING in the dismiss machinery.
//
// P0: only the degenerate home providers ('search' / 'polls') are registered; they
// return exactly the degenerate snapshot so capture is byte-equivalent to what the
// old createCurrentOriginContext produced. Rich providers arrive in later phases.

export type OriginCaptureProvider = () => OriginSnapshot;

const originCaptureProviders = new Map<OverlayKey, OriginCaptureProvider>();

export const registerOriginCaptureProvider = (
  sceneKey: OverlayKey,
  provider: OriginCaptureProvider
): (() => void) => {
  originCaptureProviders.set(sceneKey, provider);
  return () => {
    if (originCaptureProviders.get(sceneKey) === provider) {
      originCaptureProviders.delete(sceneKey);
    }
  };
};

export const getOriginCaptureProvider = (
  sceneKey: OverlayKey
): OriginCaptureProvider | undefined => originCaptureProviders.get(sceneKey);
