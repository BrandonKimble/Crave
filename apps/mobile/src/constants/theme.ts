import type { ViewStyle } from 'react-native';
import colorPalette from './color-palette.json';

const typedColorPalette = colorPalette as {
  primaryColor: string;
};

// F894 (2026-08-04): the grey secondary-text color used to be hand-typed on THREE token
// names (`textBody`, `textMuted`, the now-deleted `muted`, which had zero consumers) — edit
// one and the others silently drift. One hex, one name for it here; `textBody` and
// `textMuted` alias it explicitly rather than restating the literal, so they can never
// diverge by a missed find/replace. (Two call sites — `textBody` with 71 consumers,
// `textMuted` with 8 across files this pass may not touch, e.g. `ShareModalHost.tsx`
// (owned elsewhere) — keep both names live; collapsing the CALL SITES to one name is a
// separate, larger migration, not a token-file change.)
const SECONDARY_TEXT_COLOR = '#6c7380';

// `accentDark` was ALREADY single-sourced (`typedColorPalette.primaryColor`, same as
// `primary`) — not a duplicated literal, just a second name for the CTA-accent semantic
// with 3 real consumers (SignIn, Onboarding, Button.tsx). Left as an intentional alias.
export const colors = {
  primary: typedColorPalette.primaryColor,
  primaryDark: '#d92358',
  secondary: '#4ECDC4',
  accentDark: typedColorPalette.primaryColor,
  background: '#F7F7F7',
  surface: '#FFFFFF',
  textPrimary: '#0f172a',
  textBody: SECONDARY_TEXT_COLOR,
  textMuted: SECONDARY_TEXT_COLOR,
  // `text` (#1A1A1A) had exactly ONE consumer (ChromeTitleText.tsx) and no stated semantic
  // distinction from `textPrimary` (#0f172a) — collapsed into it; see ChromeTitleText.tsx.
  border: '#f1f5f9',
  secondaryAccent: '#5566ff',
};

/**
 * THE BRAND ACCENT, ONCE (F881). `colors.primary` is the hex; the sites that need
 * it at partial opacity used to hand-paste `rgba(255, 51, 104, α)` — a re-encoding
 * of the same color that no palette change can reach. `primaryRgb` and
 * `primaryAlpha` derive both forms from `colors.primary`, so the palette JSON stays
 * the single source. Never write the literal again; import from here.
 */
const parseHexRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

export const primaryRgb = parseHexRgb(colors.primary);

export const primaryAlpha = (alpha: number): string =>
  `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${alpha})`;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};

// F1557/F1558: the SHADOW half of this file is gone (2026-08-04). `theme.shadows` exported
// eight named tokens that were really TWO objects under eight aliases — `surfaceShadowBottom`
// under three names, `surfaceShadowTop` under four — so `resultsPanelEdge` carried no
// distinction from `floatingUp` and editing one would silently have edited the others. A
// repo-wide grep found ZERO consumers for any of them, for the `createShadow` builder beside
// them, or for the `theme` / `Theme` aggregate that wrapped them (the `searchSurface` hits the
// audit read as live belong to other symbols: `Search/styles.ts`'s own `searchSurface` style
// and a native-overlay lane name). The LIVE shadow vocabulary is `constants/shadows.ts` — one
// home now, and it is the one that does not have "theme" in its name.
