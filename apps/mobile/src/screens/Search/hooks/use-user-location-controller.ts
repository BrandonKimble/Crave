import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { logger } from '../../../utils';
import type { Coordinate } from '../../../types';

type UseUserLocationControllerArgs = {
  locationStorageKey: string;
};

type UseUserLocationControllerResult = {
  userLocation: Coordinate | null;
  setUserLocation: React.Dispatch<React.SetStateAction<Coordinate | null>>;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  userLocationIsCachedRef: React.MutableRefObject<boolean>;
  locationPermissionDenied: boolean;
  ensureUserLocation: () => Promise<Coordinate | null>;
};

export const useUserLocationController = ({
  locationStorageKey,
}: UseUserLocationControllerArgs): UseUserLocationControllerResult => {
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const locationRequestInFlightRef = React.useRef(false);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const userLocationIsCachedRef = React.useRef(false);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);

  React.useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  React.useEffect(() => {
    if (!userLocation || userLocationIsCachedRef.current) {
      return;
    }
    void AsyncStorage.setItem(
      locationStorageKey,
      JSON.stringify({
        lat: userLocation.lat,
        lng: userLocation.lng,
        updatedAt: Date.now(),
      })
    ).catch(() => undefined);
  }, [locationStorageKey, userLocation]);

  const startLocationWatch = React.useCallback(async () => {
    if (locationWatchRef.current) {
      return;
    }
    try {
      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 20_000,
          distanceInterval: 50,
        },
        (update) => {
          const nextCoords: Coordinate = {
            lat: update.coords.latitude,
            lng: update.coords.longitude,
          };
          userLocationIsCachedRef.current = false;
          userLocationRef.current = nextCoords;
          setUserLocation(nextCoords);
        }
      );
    } catch (watchError) {
      logger.warn('Failed to start location watcher', {
        message: watchError instanceof Error ? watchError.message : 'unknown',
      });
    }
  }, []);

  const ensureUserLocation = React.useCallback(async (): Promise<Coordinate | null> => {
    if (userLocationRef.current && !userLocationIsCachedRef.current) {
      return userLocationRef.current;
    }
    if (locationRequestInFlightRef.current) {
      return userLocationRef.current;
    }

    locationRequestInFlightRef.current = true;
    try {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      let status = existingPermission.status;
      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }

      if (status !== 'granted') {
        setLocationPermissionDenied(true);
        return null;
      }
      setLocationPermissionDenied(false);

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          const coords: Coordinate = {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          };
          userLocationIsCachedRef.current = false;
          setUserLocation(coords);
          userLocationRef.current = coords;
        }
      } catch {
        // ignore
      }

      await startLocationWatch();

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords: Coordinate = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      userLocationIsCachedRef.current = false;
      setUserLocation(coords);
      userLocationRef.current = coords;

      return coords;
    } catch (locationError) {
      logger.warn('Failed to capture user location', {
        message: locationError instanceof Error ? locationError.message : 'unknown',
      });
      return userLocationRef.current;
    } finally {
      locationRequestInFlightRef.current = false;
    }
  }, [startLocationWatch]);

  React.useEffect(() => {
    void ensureUserLocation();
  }, [ensureUserLocation]);

  React.useEffect(() => {
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  return {
    userLocation,
    setUserLocation,
    userLocationRef,
    userLocationIsCachedRef,
    locationPermissionDenied,
    ensureUserLocation,
  };
};
