type RgbTuple = [number, number, number];
import colorPaletteData from '../constants/color-palette.json';

const colorPalette = colorPaletteData as unknown as {
  qualityGradientStops: Array<{ t: number; color: RgbTuple }>;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const QUALITY_GRADIENT_STOPS = colorPalette.qualityGradientStops;

const QUALITY_GRADIENT_STOPS_REVERSED = [...QUALITY_GRADIENT_STOPS].reverse();

const getCraveScoreColorForT = (t: number): string => {
  const clampedT = clamp01(t);
  const next =
    QUALITY_GRADIENT_STOPS.find((stop) => stop.t >= clampedT) ??
    QUALITY_GRADIENT_STOPS[QUALITY_GRADIENT_STOPS.length - 1];
  const prev =
    QUALITY_GRADIENT_STOPS_REVERSED.find((stop) => stop.t <= clampedT) ?? QUALITY_GRADIENT_STOPS[0];
  const span = Math.max(next.t - prev.t, 0.0001);
  const localT = (clampedT - prev.t) / span;
  const mix = prev.color.map((channel, channelIndex) =>
    Math.round(channel + (next.color[channelIndex] - channel) * localT)
  ) as RgbTuple;
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

export const getCraveScoreColorFromScore = (score?: number | null): string => {
  const normalizedScore =
    typeof score === 'number' && Number.isFinite(score)
      ? clamp01(score / 100)
      : null;
  if (normalizedScore === null) {
    return getCraveScoreColorForT(0.5);
  }
  return getCraveScoreColorForT(1 - normalizedScore);
};
