export { getCraveScoreColorFromScore } from '../../../utils/quality-color';

export const formatCraveScore = (score?: number | null): string => {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '—';
  }
  const rounded = Number(score.toFixed(1));
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}°`;
};

export const formatCraveScoreMovement = (delta?: number | null): string | null => {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return null;
  }
  const rounded = Number(delta.toFixed(1));
  if (rounded === 0) {
    return null;
  }
  const magnitude = Number.isInteger(Math.abs(rounded))
    ? Math.abs(rounded).toFixed(0)
    : Math.abs(rounded).toFixed(1);
  return `${rounded > 0 ? '↑' : '↓'}${magnitude}°`;
};
