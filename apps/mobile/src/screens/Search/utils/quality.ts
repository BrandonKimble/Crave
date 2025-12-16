type RgbTuple = [number, number, number];

const QUALITY_GRADIENT_STOPS: Array<{ t: number; color: RgbTuple }> = [
  { t: 0, color: [40, 186, 130] }, // crisp jade green (top rank)
  { t: 0.18, color: [68, 200, 120] }, // steady green, avoids minty drift
  { t: 0.45, color: [255, 201, 94] }, // golden yellow midpoint
  { t: 0.7, color: [255, 157, 75] }, // bright orange transition
  { t: 1, color: [255, 110, 82] }, // warm red-orange (lowest rank)
];

export const getQualityColor = (index: number, total: number): string => {
  const t = Math.max(0, Math.min(1, total <= 1 ? 0 : index / Math.max(total - 1, 1)));
  const next =
    QUALITY_GRADIENT_STOPS.find((stop) => stop.t >= t) ??
    QUALITY_GRADIENT_STOPS[QUALITY_GRADIENT_STOPS.length - 1];
  const prev =
    [...QUALITY_GRADIENT_STOPS].reverse().find((stop) => stop.t <= t) ?? QUALITY_GRADIENT_STOPS[0];
  const span = Math.max(next.t - prev.t, 0.0001);
  const localT = (t - prev.t) / span;
  const mix = prev.color.map((channel, channelIndex) =>
    Math.round(channel + (next.color[channelIndex] - channel) * localT)
  ) as RgbTuple;
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

