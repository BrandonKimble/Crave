import type { FeatureCollection, Point } from 'geojson';
import { Dimensions } from 'react-native';
import { colors } from '../constants/theme';
import { PIN_FILL_RENDER_HEIGHT, PIN_FILL_RENDER_WIDTH } from '../screens/Search/constants/search';
import { SPLASH_STUDIO_CONFIG } from '../splash-studio/config';
import { getQualityColorFromScore } from '../utils/quality-color';

type BackdropDotProperties = {
  color: string;
};

const BACKDROP_DOT_COUNT = SPLASH_STUDIO_CONFIG.backdrop.dotCount;
const BACKDROP_DOT_DIAMETER = Math.round(Math.max(PIN_FILL_RENDER_WIDTH, PIN_FILL_RENDER_HEIGHT));
const BACKDROP_PRIMARY_COLOR_CHANCE = SPLASH_STUDIO_CONFIG.backdrop.primaryColorChance;
const BACKDROP_GRADIENT_BIAS = SPLASH_STUDIO_CONFIG.backdrop.gradientBias;
const BACKDROP_CENTER_PULL = SPLASH_STUDIO_CONFIG.backdrop.centerPull;
const BACKDROP_VIEWPORT_INSET = 0.96;
const MAP_TILE_SIZE = 512;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: number) => {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
};

const sampleLinearWarmT = (random: () => number): number => {
  const linearWarmT = 1 - Math.sqrt(1 - random());
  return Math.pow(linearWarmT, BACKDROP_GRADIENT_BIAS);
};

const sampleBackdropDotColor = (random: () => number): string => {
  if (random() < BACKDROP_PRIMARY_COLOR_CHANCE) {
    return colors.primary;
  }
  const warmT = sampleLinearWarmT(random);
  const score = (1 - warmT) * 100;
  return getQualityColorFromScore(score);
};

const remapAxisTowardCenter = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const centeredMagnitude =
    magnitude * (1 - BACKDROP_CENTER_PULL) + magnitude * magnitude * BACKDROP_CENTER_PULL;
  return sign * centeredMagnitude;
};

export const getBackdropDotRadius = (): number => BACKDROP_DOT_DIAMETER / 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lngToMercatorX = (lng: number): number => (lng + 180) / 360;

const latToMercatorY = (lat: number): number => {
  const latitude = clamp(lat, -85.05112878, 85.05112878);
  const radians = (latitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
};

const mercatorXToLng = (x: number): number => x * 360 - 180;

const mercatorYToLat = (y: number): number => {
  const mercator = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
};

export const buildBackdropDotFeatures = (
  center: [number, number],
  zoom: number
): FeatureCollection<Point, BackdropDotProperties> => {
  const seed = hashString(
    `${center[0].toFixed(4)}:${center[1].toFixed(4)}:${zoom.toFixed(2)}:${BACKDROP_DOT_COUNT}`
  );
  const random = createSeededRandom(seed);
  const worldSize = MAP_TILE_SIZE * Math.pow(2, zoom);
  const insetWidth = SCREEN_WIDTH * BACKDROP_VIEWPORT_INSET;
  const insetHeight = SCREEN_HEIGHT * BACKDROP_VIEWPORT_INSET;
  const halfWidthWorld = insetWidth / (2 * worldSize);
  const halfHeightWorld = insetHeight / (2 * worldSize);
  const centerX = lngToMercatorX(center[0]);
  const centerY = latToMercatorY(center[1]);

  const features = Array.from({ length: BACKDROP_DOT_COUNT }, (_, index) => {
    const normalizedX = remapAxisTowardCenter(random() * 2 - 1);
    const normalizedY = remapAxisTowardCenter(random() * 2 - 1);
    const mercatorX = centerX + normalizedX * halfWidthWorld;
    const mercatorY = clamp(centerY + normalizedY * halfHeightWorld, 0, 1);

    return {
      type: 'Feature' as const,
      id: `backdrop-dot-${index}`,
      geometry: {
        type: 'Point' as const,
        coordinates: [mercatorXToLng(mercatorX), mercatorYToLat(mercatorY)],
      },
      properties: {
        color: sampleBackdropDotColor(random),
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};
