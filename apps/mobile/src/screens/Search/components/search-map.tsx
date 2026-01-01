import React from 'react';
import { Animated, Image, Pressable, Text as RNText, View } from 'react-native';

import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import type { Feature, FeatureCollection, Point } from 'geojson';

import pinAsset from '../../../assets/pin.png';
import pinFillAsset from '../../../assets/pin-fill.png';
import AppBlurView from '../../../components/app-blur-view';
import type { Coordinate } from '../../../types';
import { USA_FALLBACK_CENTER } from '../constants/search';
import styles from '../styles';
import { getMarkerZIndex } from '../utils/map';

const MAP_PAN_DECELERATION_FACTOR = 0.995;

export type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
  rank: number;
  pinColor: string;
  anchor?: 'top' | 'bottom' | 'left' | 'right';
};

export type MapboxMapRef = InstanceType<typeof MapboxGL.MapView> & {
  getVisibleBounds?: () => Promise<[number[], number[]]>;
  getCenter?: () => Promise<[number, number]>;
  getZoom?: () => Promise<number>;
};

type CameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

const PRIMARY_COLOR = '#ff3368';
const ZERO_CAMERA_PADDING = { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };

type SearchMapProps = {
  mapRef: React.RefObject<MapboxMapRef | null>;
  cameraRef: React.RefObject<MapboxGL.Camera | null>;
  styleURL: string;
  mapCenter: [number, number] | null;
  mapZoom: number;
  cameraPadding?: CameraPadding | null;
  isFollowingUser: boolean;
  onPress: () => void;
  onCameraChanged: (state: MapboxMapState) => void;
  onMapIdle: (state: MapboxMapState) => void;
  onMapLoaded: () => void;
  onMarkerPress?: (restaurantId: string) => void;
  selectedRestaurantId?: string | null;
  sortedRestaurantMarkers: Array<Feature<Point, RestaurantFeatureProperties>>;
  markersRenderKey: string;
  buildMarkerKey: (feature: Feature<Point, RestaurantFeatureProperties>) => string;
  restaurantFeatures: FeatureCollection<Point, RestaurantFeatureProperties>;
  restaurantLabelStyle: MapboxGL.SymbolLayerStyle;
  isMapStyleReady: boolean;
  userLocation: Coordinate | null;
  locationPulse: Animated.Value;
  disableMarkers?: boolean;
  disableBlur?: boolean;
};

const SearchMap: React.FC<SearchMapProps> = ({
  mapRef,
  cameraRef,
  styleURL,
  mapCenter,
  mapZoom,
  cameraPadding,
  isFollowingUser,
  onPress,
  onCameraChanged,
  onMapIdle,
  onMapLoaded,
  onMarkerPress,
  selectedRestaurantId,
  sortedRestaurantMarkers,
  markersRenderKey,
  buildMarkerKey,
  restaurantFeatures,
  restaurantLabelStyle,
  isMapStyleReady,
  userLocation,
  locationPulse,
  disableMarkers = false,
  disableBlur = false,
}) => {
  const shouldDisableMarkers = disableMarkers === true;
  const shouldDisableBlur = disableBlur === true;
  const shouldRenderLabels = !shouldDisableMarkers && isMapStyleReady;
  return (
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={styleURL}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        gestureSettings={{ panDecelerationFactor: MAP_PAN_DECELERATION_FACTOR }}
        onPress={onPress}
        onCameraChanged={onCameraChanged}
        onMapIdle={onMapIdle}
        onDidFinishLoadingStyle={onMapLoaded}
        onDidFinishLoadingMap={onMapLoaded}
      >
      <MapboxGL.Camera
        ref={cameraRef}
        centerCoordinate={mapCenter ?? USA_FALLBACK_CENTER}
        zoomLevel={mapZoom}
        padding={cameraPadding ?? ZERO_CAMERA_PADDING}
        followUserLocation={isFollowingUser}
        followZoomLevel={13}
        followPitch={0}
        followHeading={0}
        animationMode="none"
        animationDuration={0}
        pitch={32}
      />
      {!shouldDisableMarkers && sortedRestaurantMarkers.length ? (
        <React.Fragment key={`markers-${markersRenderKey}`}>
          {sortedRestaurantMarkers.map((feature) => {
            const coordinates = feature.geometry.coordinates as [number, number];
            const markerKey = buildMarkerKey(feature);
            const zIndex = getMarkerZIndex(feature.properties.rank, sortedRestaurantMarkers.length);
            return (
              <MapboxGL.MarkerView
                key={markerKey}
                id={`restaurant-marker-${markerKey}`}
                coordinate={coordinates}
                anchor={{ x: 0.5, y: 1 }}
                allowOverlap
                style={[styles.markerView, { zIndex }]}
              >
                <Pressable
                  onPress={() => onMarkerPress?.(feature.properties.restaurantId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.pinWrapper, styles.pinShadow]}>
                    <Image source={pinAsset} style={styles.pinBase} />
                    <Image
                      source={pinFillAsset}
                      style={[
                        styles.pinFill,
                        {
                          tintColor:
                            selectedRestaurantId === feature.properties.restaurantId
                              ? PRIMARY_COLOR
                              : feature.properties.pinColor,
                        },
                      ]}
                    />
                    <View style={styles.pinRankWrapper}>
                      <RNText style={styles.pinRank}>{feature.properties.rank}</RNText>
                    </View>
                  </View>
                </Pressable>
              </MapboxGL.MarkerView>
            );
          })}
        </React.Fragment>
      ) : null}
      {shouldRenderLabels ? (
        <MapboxGL.ShapeSource id="restaurant-source" shape={restaurantFeatures}>
          <MapboxGL.SymbolLayer id="restaurant-labels" style={restaurantLabelStyle} />
        </MapboxGL.ShapeSource>
      ) : null}
      {userLocation ? (
        <MapboxGL.MarkerView
          id="user-location"
          coordinate={[userLocation.lng, userLocation.lat]}
          anchor={{ x: 0.5, y: 0.5 }}
          allowOverlap
          isSelected
          style={[styles.markerView, styles.userLocationMarkerView]}
        >
          <View style={styles.userLocationWrapper}>
            <View style={styles.userLocationShadow}>
              {shouldDisableBlur ? (
                <View style={styles.userLocationHaloWrapper}>
                  <Animated.View
                    style={[
                      styles.userLocationDot,
                      {
                        transform: [
                          {
                            scale: locationPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1.4, 1.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </View>
              ) : (
                <AppBlurView intensity={25} tint="light" style={styles.userLocationHaloWrapper}>
                  <Animated.View
                    style={[
                      styles.userLocationDot,
                      {
                        transform: [
                          {
                            scale: locationPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1.4, 1.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </AppBlurView>
              )}
            </View>
          </View>
        </MapboxGL.MarkerView>
      ) : null}
    </MapboxGL.MapView>
  );
};

const areCameraPaddingEqual = (left?: CameraPadding | null, right?: CameraPadding | null) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.paddingTop === right.paddingTop &&
    left.paddingBottom === right.paddingBottom &&
    left.paddingLeft === right.paddingLeft &&
    left.paddingRight === right.paddingRight
  );
};

const areCentersEqual = (
  left?: [number, number] | null,
  right?: [number, number] | null
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1];
};

const areUserLocationsEqual = (left?: Coordinate | null, right?: Coordinate | null) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.lat === right.lat && left.lng === right.lng;
};

const arePropsEqual = (prev: SearchMapProps, next: SearchMapProps) => {
  if (prev.styleURL !== next.styleURL) {
    return false;
  }
  if (prev.mapZoom !== next.mapZoom) {
    return false;
  }
  if (!areCentersEqual(prev.mapCenter, next.mapCenter)) {
    return false;
  }
  if (!areCameraPaddingEqual(prev.cameraPadding, next.cameraPadding)) {
    return false;
  }
  if (prev.isFollowingUser !== next.isFollowingUser) {
    return false;
  }
  if (prev.selectedRestaurantId !== next.selectedRestaurantId) {
    return false;
  }
  if (prev.markersRenderKey !== next.markersRenderKey) {
    return false;
  }
  if (prev.disableMarkers !== next.disableMarkers) {
    return false;
  }
  if (prev.disableBlur !== next.disableBlur) {
    return false;
  }
  if (!areUserLocationsEqual(prev.userLocation, next.userLocation)) {
    return false;
  }
  if (prev.locationPulse !== next.locationPulse) {
    return false;
  }
  if (prev.restaurantLabelStyle !== next.restaurantLabelStyle) {
    return false;
  }
  if (prev.buildMarkerKey !== next.buildMarkerKey) {
    return false;
  }
  if (prev.onPress !== next.onPress) {
    return false;
  }
  if (prev.onCameraChanged !== next.onCameraChanged) {
    return false;
  }
  if (prev.onMapIdle !== next.onMapIdle) {
    return false;
  }
  if (prev.onMapLoaded !== next.onMapLoaded) {
    return false;
  }
  if (prev.onMarkerPress !== next.onMarkerPress) {
    return false;
  }
  return true;
};

export default React.memo(SearchMap, arePropsEqual);
