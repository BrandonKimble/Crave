// ─── react-native-svg mock (render lane) — host strings only ─────────────────
// The real package touches react-native internals (Touchable mixin) this lane
// does not provide. Marker host elements keep trees assertable; no behavior.

export const Svg = 'Svg';
export const Defs = 'Defs';
export const G = 'G';
export const Mask = 'Mask';
export const Rect = 'Rect';
export const LinearGradient = 'LinearGradient';
export const Stop = 'Stop';

export default Svg;
