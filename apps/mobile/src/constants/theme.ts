import type { ViewStyle } from 'react-native';
import colorPalette from './color-palette.json';

const typedColorPalette = colorPalette as {
  primaryColor: string;
};

export const colors = {
  primary: typedColorPalette.primaryColor,
  primaryDark: '#d92358',
  secondary: '#4ECDC4',
  accentDark: typedColorPalette.primaryColor,
  background: '#F7F7F7',
  surface: '#FFFFFF',
  textPrimary: '#0f172a',
  textBody: '#6c7380',
  textMuted: '#6c7380',
  text: '#1A1A1A',
  muted: '#6c7380',
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

type ShadowConfig = {
  color?: string;
  height?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
};

const DEFAULT_SHADOW_COLOR = 'rgba(15, 23, 42, 1)';

const buildShadowStyle = ({
  color = DEFAULT_SHADOW_COLOR,
  height = 4,
  opacity = 0.12,
  radius = 10,
  elevation = 4,
}: ShadowConfig = {}): ViewStyle => ({
  shadowColor: color,
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

const surfaceShadowBottom = buildShadowStyle({
  height: 1.5,
  radius: 3,
  opacity: 0.17,
  elevation: 4,
});

const surfaceShadowTop = buildShadowStyle({
  height: -0.5,
  radius: 2,
  opacity: 0.06,
  elevation: 2,
});

export const createShadow = (config?: ShadowConfig): ViewStyle => buildShadowStyle(config);

export const shadows = {
  surfaceBottomHeavy: surfaceShadowBottom,
  surfaceTopLight: surfaceShadowTop,
  searchSurface: surfaceShadowBottom,
  resultsPanelEdge: surfaceShadowTop,
  floatingCard: surfaceShadowBottom,
  floatingUpSoft: surfaceShadowTop,
  floatingUp: surfaceShadowTop,
  floatingControl: buildShadowStyle({ height: 4, radius: 10, opacity: 0.14, elevation: 5 }),
};

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
} as const;

export type Theme = typeof theme;
