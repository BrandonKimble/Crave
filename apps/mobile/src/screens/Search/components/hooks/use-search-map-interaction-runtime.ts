import React from 'react';

import type { Coordinate } from '../../../../types';
import type { MapboxMapRef } from '../search-map';
import {
  searchMapRenderController,
  type SearchMapRenderedPressTarget,
} from '../../runtime/map/search-map-render-controller';
import { haversineDistanceMiles } from '../../utils/geo';

type OnPressEvent = {
  features: Array<GeoJSON.Feature>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
};

export type SearchMapInteractionRuntime = {
  dotInteractionFilter: unknown[];
  handleStylePinPress: (event: OnPressEvent) => void;
  handleLabelPress: (event: OnPressEvent) => void;
  handleDotPress: (event: OnPressEvent) => void;
  refreshVisibleDotRestaurantIds: () => void;
};

export const useSearchMapInteractionRuntime = ({
  mapRef,
  nativeRenderOwnerInstanceId,
  onMarkerPress,
  shouldRenderDots,
  dotLayerId,
  pinInteractionLayerIds,
  labelInteractionLayerIds,
  markersRenderKey,
  styleURL,
  dotTapIntentRadiusPx,
  setOptimisticSelectedRestaurantId,
  getPointFromPressEvent,
  getCoordinateFromPressEvent,
  areStringArraysEqual,
  isTapInsideDotInteractionGeometry,
}: {
  mapRef: React.RefObject<MapboxMapRef | null>;
  nativeRenderOwnerInstanceId: string;
  onMarkerPress?: (restaurantId: string, pressedCoordinate?: Coordinate | null) => void;
  shouldRenderDots: boolean;
  dotLayerId: string;
  pinInteractionLayerIds: string[];
  labelInteractionLayerIds: string[];
  markersRenderKey: string;
  styleURL: string;
  dotTapIntentRadiusPx: number;
  setOptimisticSelectedRestaurantId: React.Dispatch<React.SetStateAction<string | null>>;
  getPointFromPressEvent: (event: OnPressEvent) => { x: number; y: number } | null;
  getCoordinateFromPressEvent: (event: OnPressEvent) => Coordinate | null;
  areStringArraysEqual: (left: string[], right: string[]) => boolean;
  isTapInsideDotInteractionGeometry: (args: {
    mapInstance: MapboxMapRef | null;
    tapPoint: { x: number; y: number };
    coordinate: Coordinate | null;
  }) => Promise<boolean>;
}): SearchMapInteractionRuntime => {
  const [visibleDotRestaurantIdList, setVisibleDotRestaurantIdList] = React.useState<string[]>([]);
  const pinPressResolutionSeqRef = React.useRef(0);
  const resolveNativePressTarget = React.useCallback(
    async ({
      point,
      includeLabels,
    }: {
      point: { x: number; y: number };
      includeLabels: boolean;
    }): Promise<SearchMapRenderedPressTarget | null> =>
      searchMapRenderController.queryRenderedPressTarget({
        instanceId: nativeRenderOwnerInstanceId,
        point,
        pinLayerIds: pinInteractionLayerIds,
        ...(includeLabels ? { labelLayerIds: labelInteractionLayerIds } : {}),
      }),
    [labelInteractionLayerIds, nativeRenderOwnerInstanceId, pinInteractionLayerIds]
  );

  const refreshVisibleDotRestaurantIds = React.useCallback(() => {
    if (!shouldRenderDots) {
      setVisibleDotRestaurantIdList((previous) => (previous.length === 0 ? previous : []));
      return;
    }
    void searchMapRenderController
      .queryRenderedDotObservation({
        instanceId: nativeRenderOwnerInstanceId,
        layerIds: [dotLayerId],
      })
      .then((observation) => {
        const next = [...observation.restaurantIds].sort();
        setVisibleDotRestaurantIdList((previous) =>
          areStringArraysEqual(previous, next) ? previous : next
        );
      })
      .catch(() => undefined);
  }, [areStringArraysEqual, dotLayerId, nativeRenderOwnerInstanceId, shouldRenderDots]);

  React.useEffect(() => {
    refreshVisibleDotRestaurantIds();
  }, [markersRenderKey, refreshVisibleDotRestaurantIds, shouldRenderDots, styleURL]);

  const handleStylePinPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }
      const point = getPointFromPressEvent(event);
      if (!point) {
        return;
      }
      const pressSeq = ++pinPressResolutionSeqRef.current;
      void resolveNativePressTarget({ point, includeLabels: false })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current || !pressTarget) {
            return;
          }
          setOptimisticSelectedRestaurantId(pressTarget.restaurantId);
          onMarkerPress(
            pressTarget.restaurantId,
            pressTarget.coordinate ?? getCoordinateFromPressEvent(event) ?? null
          );
        })
        .catch(() => undefined);
    },
    [
      getCoordinateFromPressEvent,
      getPointFromPressEvent,
      onMarkerPress,
      resolveNativePressTarget,
      setOptimisticSelectedRestaurantId,
    ]
  );

  const handleLabelPress = React.useCallback(
    (event: OnPressEvent) => {
      if (!onMarkerPress) {
        return;
      }
      const point = getPointFromPressEvent(event);
      if (!point) {
        return;
      }
      const pressSeq = ++pinPressResolutionSeqRef.current;
      void resolveNativePressTarget({ point, includeLabels: true })
        .then((pressTarget) => {
          if (pressSeq !== pinPressResolutionSeqRef.current || !pressTarget) {
            return;
          }
          setOptimisticSelectedRestaurantId(pressTarget.restaurantId);
          onMarkerPress(
            pressTarget.restaurantId,
            pressTarget.coordinate ?? getCoordinateFromPressEvent(event) ?? null
          );
        })
        .catch(() => undefined);
    },
    [
      getCoordinateFromPressEvent,
      getPointFromPressEvent,
      onMarkerPress,
      resolveNativePressTarget,
      setOptimisticSelectedRestaurantId,
    ]
  );

  const handleDotPress = React.useCallback(
    (event: OnPressEvent) => {
      const point = getPointFromPressEvent(event);
      const mapInstance = mapRef.current;
      if (!point) {
        return;
      }
      const queryBox = [
        point.x - dotTapIntentRadiusPx,
        point.y - dotTapIntentRadiusPx,
        point.x + dotTapIntentRadiusPx,
        point.y + dotTapIntentRadiusPx,
      ] as [number, number, number, number];

      void searchMapRenderController
        .queryRenderedDotObservation({
          instanceId: nativeRenderOwnerInstanceId,
          layerIds: [dotLayerId],
          queryBox,
        })
        .then((observation) => {
          const renderedDots = observation.renderedDots;
          if (renderedDots.length === 0) {
            return;
          }
          const target = getCoordinateFromPressEvent(event) ?? renderedDots[0]?.coordinate ?? null;
          if (!target) {
            return;
          }
          let pressMatch: {
            restaurantId: string;
            coordinate: Coordinate | null;
          } | null = null;
          let closestDistanceSq = Number.POSITIVE_INFINITY;
          for (const renderedDot of renderedDots) {
            const coordinate = renderedDot.coordinate;
            if (!coordinate) {
              continue;
            }
            const distance = haversineDistanceMiles(target, coordinate);
            if (distance >= closestDistanceSq) {
              continue;
            }
            closestDistanceSq = distance;
            pressMatch = {
              restaurantId: renderedDot.restaurantId,
              coordinate,
            };
          }
          const restaurantId = pressMatch?.restaurantId ?? renderedDots[0]?.restaurantId ?? null;
          if (!restaurantId) {
            return;
          }

          const coordinate = pressMatch?.coordinate ?? target;
          void isTapInsideDotInteractionGeometry({
            mapInstance,
            tapPoint: point,
            coordinate,
          }).then((isIntentional) => {
            if (!isIntentional) {
              return;
            }
            setOptimisticSelectedRestaurantId(restaurantId);
            onMarkerPress?.(restaurantId, coordinate);
          });
        })
        .catch(() => undefined);
    },
    [
      dotTapIntentRadiusPx,
      dotLayerId,
      getCoordinateFromPressEvent,
      getPointFromPressEvent,
      isTapInsideDotInteractionGeometry,
      mapRef,
      nativeRenderOwnerInstanceId,
      onMarkerPress,
      setOptimisticSelectedRestaurantId,
    ]
  );

  return {
    dotInteractionFilter: [
      'all',
      ['in', ['get', 'restaurantId'], ['literal', visibleDotRestaurantIdList]],
    ] as unknown[],
    handleStylePinPress,
    handleLabelPress,
    handleDotPress,
    refreshVisibleDotRestaurantIds,
  };
};
