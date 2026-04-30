import type { LayoutRectangle } from 'react-native';

const SEARCH_GEOMETRY_EPSILON = 1;

const createGeometryMismatchError = (
  label: string,
  expected: number,
  actual: number
): Error =>
  new Error(
    `[SEARCH-STARTUP-GEOMETRY] ${label} drifted from the startup geometry contract (expected ${expected}, got ${actual}).`
  );

export const assertSearchStartupGeometryValue = (
  label: string,
  expected: number,
  actual: number
): void => {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    throw createGeometryMismatchError(label, expected, actual);
  }
  if (Math.abs(expected - actual) <= SEARCH_GEOMETRY_EPSILON) {
    return;
  }
  throw createGeometryMismatchError(label, expected, actual);
};

export const assertSearchStartupGeometryRect = (
  label: string,
  expected: LayoutRectangle,
  actual: LayoutRectangle
): void => {
  assertSearchStartupGeometryValue(`${label}.x`, expected.x, actual.x);
  assertSearchStartupGeometryValue(`${label}.y`, expected.y, actual.y);
  assertSearchStartupGeometryValue(`${label}.width`, expected.width, actual.width);
  assertSearchStartupGeometryValue(`${label}.height`, expected.height, actual.height);
};
