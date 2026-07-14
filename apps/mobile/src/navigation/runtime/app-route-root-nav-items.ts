import type { OverlayKey } from '../../overlays/types';

/**
 * THE tab bar's page set — the canonical enumeration of root pages reachable by a nav
 * (topLevelSwitch) press. Lives in this pure module (not the NavSilhouetteHost component) so
 * the two-posture-law exhaustiveness sweep can enumerate the REAL tab set in hermetic jest:
 * every key here must resolve a posture seat and a 'postureSeat' descriptor row
 * (app-route-sheet-motion-descriptor-table.spec.ts). Adding a fourth tab without declaring its
 * `postureSeat` in app-route-scene-policy-registry.ts turns that sweep RED.
 */
export const APP_ROOT_NAV_ITEMS = [
  { key: 'search', label: 'Search' },
  { key: 'bookmarks', label: 'Lists' },
  { key: 'profile', label: 'Profile' },
] as const satisfies readonly { key: OverlayKey; label: string }[];
