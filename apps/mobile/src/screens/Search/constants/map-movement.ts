/**
 * THE MAP-MOVEMENT THRESHOLDS, MOVED OUT OF constants/search.ts (F3906, 2026-08-06).
 *
 * These two numbers decide whether a map gesture counts as a MOVE — the gate in
 * front of "search this area". They have nothing to do with screen geometry, but
 * they lived in `constants/search.ts`, whose first line is
 * `import { Dimensions } from 'react-native'`. That single import transitively
 * poisons every module that reads a threshold from here: `utils/geo.ts` imports
 * them, so geo — pure haversine math — could not be loaded by the hermetic node
 * test lane at all, and neither could any decision function built on it. The
 * gate stayed eye-verified because its dependency chain refused to load, not
 * because it was hard to test.
 *
 * Nothing else moves: these are the only exports of constants/search.ts read by
 * the geo/decision layer.
 */

/** Below this centre shift, a gesture is jitter and never marks the map moved. */
export const MAP_MOVE_MIN_DISTANCE_MILES = 0.1;

/** …and above it, the shift must also be this fraction of the viewport's span. */
export const MAP_MOVE_DISTANCE_RATIO = 0.08;
