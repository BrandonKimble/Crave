import React from 'react';
import { PixelRatio, type LayoutRectangle } from 'react-native';

import {
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_BAR_HOLE_RADIUS,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
} from '../../constants/search';
import type {
  SearchSuggestionHeaderHolesRuntime,
  SearchSuggestionHeaderHolesRuntimeArgs,
  SearchSuggestionMaskedHole,
} from './use-search-suggestion-surface-runtime-contract';

const SEARCH_SUGGESTION_HOLE_PIXEL_SCALE = PixelRatio.get();
const SEARCH_SUGGESTION_HOLE_CUTOUT_EDGE_SLOP = 1 / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

const floorSuggestionHoleToPixel = (value: number) =>
  Math.floor(value * SEARCH_SUGGESTION_HOLE_PIXEL_SCALE) / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

const ceilSuggestionHoleToPixel = (value: number) =>
  Math.ceil(value * SEARCH_SUGGESTION_HOLE_PIXEL_SCALE) / SEARCH_SUGGESTION_HOLE_PIXEL_SCALE;

const cloneSuggestionMaskedHole = (
  hole: SearchSuggestionMaskedHole
): SearchSuggestionMaskedHole => ({
  x: hole.x,
  y: hole.y,
  width: hole.width,
  height: hole.height,
  borderRadius: hole.borderRadius,
});

const cloneSuggestionMaskedHoleArray = (
  holes: readonly SearchSuggestionMaskedHole[]
): SearchSuggestionMaskedHole[] => holes.map(cloneSuggestionMaskedHole);

export const useSearchSuggestionHeaderHolesRuntime = ({
  shouldDriveSuggestionLayout,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutHoles,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
  resolvedSearchShortcutChipFrames,
}: SearchSuggestionHeaderHolesRuntimeArgs): SearchSuggestionHeaderHolesRuntime => {
  const suggestionHeaderHolesRef = React.useRef<SearchSuggestionMaskedHole[]>([]);
  const suggestionHeaderSearchHoleRef = React.useRef<SearchSuggestionMaskedHole | null>(null);
  const suggestionHeaderShortcutHolesRef = React.useRef<{
    restaurants: SearchSuggestionMaskedHole | null;
    dishes: SearchSuggestionMaskedHole | null;
  }>({
    restaurants: null,
    dishes: null,
  });

  const suggestionHeaderSearchHoleCandidate =
    React.useMemo<SearchSuggestionMaskedHole | null>(() => {
      if (!shouldDriveSuggestionLayout || !resolvedSearchContainerFrame) {
        return null;
      }
      const x =
        resolvedSearchContainerFrame.x + SEARCH_HORIZONTAL_PADDING - SEARCH_BAR_HOLE_PADDING;
      const y =
        resolvedSearchContainerFrame.y + SEARCH_CONTAINER_PADDING_TOP - SEARCH_BAR_HOLE_PADDING;
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
    }, [resolvedSearchContainerFrame, shouldDriveSuggestionLayout]);
  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader || !suggestionHeaderSearchHoleCandidate) {
      return;
    }
    suggestionHeaderSearchHoleRef.current = cloneSuggestionMaskedHole(
      suggestionHeaderSearchHoleCandidate
    );
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);
  const suggestionHeaderSearchHole = React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return suggestionHeaderSearchHoleRef.current;
    }
    return suggestionHeaderSearchHoleCandidate ?? suggestionHeaderSearchHoleRef.current;
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);

  const suggestionHeaderShortcutHoleCandidates = React.useMemo(() => {
    if (
      !shouldDriveSuggestionLayout ||
      !shouldIncludeShortcutHoles ||
      !resolvedSearchShortcutsFrame
    ) {
      return { restaurants: null, dishes: null };
    }
    const buildHole = (chip: LayoutRectangle | undefined): SearchSuggestionMaskedHole | null => {
      if (!chip || chip.width <= 0 || chip.height <= 0) {
        return null;
      }
      const x = resolvedSearchShortcutsFrame.x + chip.x - SHORTCUT_CHIP_HOLE_PADDING;
      const y = resolvedSearchShortcutsFrame.y + chip.y - SHORTCUT_CHIP_HOLE_PADDING;
      const width = chip.width + SHORTCUT_CHIP_HOLE_PADDING * 2;
      const height = chip.height + SHORTCUT_CHIP_HOLE_PADDING * 2;
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
    return {
      restaurants: buildHole(resolvedSearchShortcutChipFrames.restaurants),
      dishes: buildHole(resolvedSearchShortcutChipFrames.dishes),
    };
  }, [
    resolvedSearchShortcutChipFrames,
    resolvedSearchShortcutsFrame,
    shouldDriveSuggestionLayout,
    shouldIncludeShortcutHoles,
  ]);
  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader) {
      return;
    }
    const { restaurants, dishes } = suggestionHeaderShortcutHoleCandidates;
    suggestionHeaderShortcutHolesRef.current = {
      restaurants: restaurants ? cloneSuggestionMaskedHole(restaurants) : null,
      dishes: dishes ? cloneSuggestionMaskedHole(dishes) : null,
    };
  }, [shouldFreezeSuggestionHeader, suggestionHeaderShortcutHoleCandidates]);
  const suggestionHeaderShortcutHoles = React.useMemo(() => {
    if (!shouldIncludeShortcutHoles) {
      return { restaurants: null, dishes: null };
    }
    const cached = suggestionHeaderShortcutHolesRef.current;
    if (shouldFreezeSuggestionHeader) {
      return cached;
    }
    return {
      restaurants: suggestionHeaderShortcutHoleCandidates.restaurants ?? cached.restaurants,
      dishes: suggestionHeaderShortcutHoleCandidates.dishes ?? cached.dishes,
    };
  }, [
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutHoles,
    suggestionHeaderShortcutHoleCandidates,
  ]);
  const suggestionHeaderHoles = React.useMemo<SearchSuggestionMaskedHole[]>(() => {
    if (!shouldDriveSuggestionLayout) {
      return [];
    }
    const holes: SearchSuggestionMaskedHole[] = [];
    if (suggestionHeaderSearchHole) {
      holes.push(suggestionHeaderSearchHole);
    }
    if (suggestionHeaderShortcutHoles.restaurants) {
      holes.push(suggestionHeaderShortcutHoles.restaurants);
    }
    if (suggestionHeaderShortcutHoles.dishes) {
      holes.push(suggestionHeaderShortcutHoles.dishes);
    }
    return holes;
  }, [shouldDriveSuggestionLayout, suggestionHeaderSearchHole, suggestionHeaderShortcutHoles]);
  const resolvedSuggestionHeaderHoles = React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return cloneSuggestionMaskedHoleArray(suggestionHeaderHolesRef.current);
    }
    if (suggestionHeaderHoles.length > 0) {
      const nextHoles = cloneSuggestionMaskedHoleArray(suggestionHeaderHoles);
      suggestionHeaderHolesRef.current = nextHoles;
      return nextHoles;
    }
    return cloneSuggestionMaskedHoleArray(suggestionHeaderHolesRef.current);
  }, [shouldFreezeSuggestionHeader, suggestionHeaderHoles]);

  return {
    resolvedSuggestionHeaderHoles,
  };
};
