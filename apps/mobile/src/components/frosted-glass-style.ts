export type FrostedGlassTint = 'light' | 'dark' | 'default';

export const FROSTED_GLASS_DEFAULT_INTENSITY = 45;
export const FROSTED_GLASS_DEFAULT_TINT: FrostedGlassTint = 'light';
export const FROSTED_GLASS_DEFAULT_TINT_COLOR = 'rgba(248, 251, 255, 0.30)';
export const FROSTED_GLASS_DEFAULT_FALLBACK_COLOR = 'rgba(248, 251, 255, 0.85)';

export const clampFrostedGlassOpacity = (value: number): number => Math.max(0, Math.min(1, value));

export const resolveFrostedGlassBlurAmount = (intensity?: number): number => {
  const resolved = intensity ?? FROSTED_GLASS_DEFAULT_INTENSITY;
  if (resolved <= 0) {
    return 0;
  }
  const normalized = Math.round(resolved / 3);
  return Math.min(25, Math.max(1, normalized));
};

export const resolveFrostedGlassBlurType = (tint: FrostedGlassTint): 'light' | 'dark' => {
  if (tint === 'dark') {
    return 'dark';
  }
  return 'light';
};

export const colorWithFrostedGlassOpacity = (color: string, opacity: number): string => {
  const normalizedOpacity = clampFrostedGlassOpacity(opacity);
  const normalized = color.trim();

  if (normalized.startsWith('#')) {
    const raw = normalized.slice(1);
    const expanded =
      raw.length === 3
        ? raw
            .split('')
            .map((part) => part + part)
            .join('')
        : raw;
    if (/^[0-9a-fA-F]{6}$/.test(expanded)) {
      const r = parseInt(expanded.slice(0, 2), 16);
      const g = parseInt(expanded.slice(2, 4), 16);
      const b = parseInt(expanded.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedOpacity})`;
    }
  }

  if (normalized.startsWith('rgb(')) {
    const body = normalized.slice(4, -1);
    return `rgba(${body}, ${normalizedOpacity})`;
  }

  if (normalized.startsWith('rgba(')) {
    return normalized.replace(/rgba\((.+),\s*[\d.]+\)$/, `rgba($1, ${normalizedOpacity})`);
  }

  return normalized;
};
