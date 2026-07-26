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
  // The user-facing root page is "Home" (map + search bar + docked home surface),
  // but the runtime key stays 'search' DELIBERATELY: the key names the
  // search-anchored root architecture, not the page label. A docked 'home' scene
  // key already exists (DOCKED_SCENE_KEY), so renaming this key would collide /
  // be incoherent. Do not "fix" the key to match the label.
  { key: 'search', label: 'Home' },
  { key: 'polls', label: 'Polls' },
  { key: 'lists', label: 'Lists' },
  { key: 'profile', label: 'Profile' },
] as const satisfies readonly { key: OverlayKey; label: string }[];
