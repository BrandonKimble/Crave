export const colors = {
  primary: '#F97383',
  primaryDark: '#DC003B',
  secondary: '#4ECDC4',
  accentDark: '#F97383',
  background: '#F7F7F7',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#6B7280',
  border: '#E5E7EB',
};

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

export const theme = {
  colors,
  spacing,
  radius,
} as const;

export type Theme = typeof theme;
