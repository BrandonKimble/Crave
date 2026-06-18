import type { LayoutRectangle } from 'react-native';
import { PixelRatio } from 'react-native';

import {
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_BAR_HOLE_RADIUS,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
} from '../../constants/search';
import type { SearchSuggestionMaskedHole } from './use-search-suggestion-surface-runtime-contract';

const SEARCH_SUGGESTION_HOLE_PIXEL_SCALE = PixelRatio.get();
const SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP = 1 / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

const floorSuggestionHoleToPixel = (value: number) =>
  Math.floor(value * SEARCH_SUGGESTION_HOLE_PIXEL_SCALE) / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

const ceilSuggestionHoleToPixel = (value: number) =>
  Math.ceil(value * SEARCH_SUGGESTION_HOLE_PIXEL_SCALE) / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

export const cloneSuggestionMaskedHole = (
  hole: SearchSuggestionMaskedHole
): SearchSuggestionMaskedHole => ({
  x: hole.x,
  y: hole.y,
  width: hole.width,
  height: hole.height,
  borderRadius: hole.borderRadius,
});

export const cloneSuggestionMaskedHoleArray = (
  holes: readonly SearchSuggestionMaskedHole[]
): SearchSuggestionMaskedHole[] => holes.map(cloneSuggestionMaskedHole);

export const createSuggestionHeaderSearchHole = (
  resolvedSearchContainerFrame: LayoutRectangle | null,
  shouldDriveSuggestionLayout: boolean
): SearchSuggestionMaskedHole | null => {
  if (!shouldDriveSuggestionLayout || !resolvedSearchContainerFrame) {
    return null;
  }

  const x = resolvedSearchContainerFrame.x + SEARCH_HORIZONTAL_PADDING - SEARCH_BAR_HOLE_PADDING;
  const y = resolvedSearchContainerFrame.y + SEARCH_CONTAINER_PADDING_TOP - SEARCH_BAR_HOLE_PADDING;
  const width =
    resolvedSearchContainerFrame.width -
    SEARCH_HORIZONTAL_PADDING * 2 +
    SEARCH_BAR_HOLE_PADDING * 2;
  const height = resolvedSearchContainerFrame.height - SEARCH_CONTAINER_PADDING_TOP;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: Math.max(0, floorSuggestionHoleToPixel(x - SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP)),
    y: Math.max(0, floorSuggestionHoleToPixel(y - SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP)),
    width: ceilSuggestionHoleToPixel(width + SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP * 2),
    height: ceilSuggestionHoleToPixel(
      height + SEARCH_BAR_HOLE_PADDING * 2 + SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP * 2
    ),
    borderRadius: SEARCH_BAR_HOLE_RADIUS + SEARCH_BAR_HOLE_PADDING,
  };
};

export const createSuggestionHeaderShortcutHole = ({
  resolvedSearchShortcutsFrame,
  chipFrame,
}: {
  resolvedSearchShortcutsFrame: LayoutRectangle;
  chipFrame: LayoutRectangle | undefined;
}): SearchSuggestionMaskedHole | null => {
  if (!chipFrame || chipFrame.width <= 0 || chipFrame.height <= 0) {
    return null;
  }

  const x = resolvedSearchShortcutsFrame.x + chipFrame.x - SHORTCUT_CHIP_HOLE_PADDING;
  const y = resolvedSearchShortcutsFrame.y + chipFrame.y - SHORTCUT_CHIP_HOLE_PADDING;
  const width = chipFrame.width + SHORTCUT_CHIP_HOLE_PADDING * 2;
  const height = chipFrame.height + SHORTCUT_CHIP_HOLE_PADDING * 2;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: Math.max(0, floorSuggestionHoleToPixel(x - SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP)),
    y: Math.max(0, floorSuggestionHoleToPixel(y - SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP)),
    width: ceilSuggestionHoleToPixel(width + SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP * 2),
    height: ceilSuggestionHoleToPixel(height + SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP * 2),
    borderRadius: SHORTCUT_CHIP_HOLE_RADIUS + SHORTCUT_CHIP_HOLE_PADDING,
  };
};
