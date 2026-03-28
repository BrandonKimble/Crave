import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { AppState, Dimensions } from 'react-native';
import type { Coordinate, MapBounds } from '../../types';
import { useCityStore } from '../../store/cityStore';
import {
  createNetworkPollBootstrapSnapshot,
  fetchPolls,
  normalizePollCoverageKey,
  readPollBootstrapSnapshotForCoverage,
  writePollBootstrapSnapshot,
  type PollBootstrapSnapshot,
} from '../../services/polls';
import { searchService } from '../../services/search';
import { logger } from '../../utils';
import {
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from '../../screens/Search/constants/search';
import { normalizePersistedCity, resolveCityViewport } from './city-viewports';
import { useAppRouteCoordinator } from './AppRouteCoordinator';
import { isSplashStudioEnabled } from '../../splash-studio/config';

const BOOT_LOCATION_STORAGE_KEY = 'boot:lastKnownLocation';
const STARTUP_LOCATION_MAX_WAIT_MS = 350;
const STARTUP_POLLS_GRACE_MS = 350;
const MAX_STORED_LOCATION_AGE_MS = 6 * 60 * 60 * 1000;
const MAIN_LAUNCH_READY_TIMEOUT_MS = 10_000;

export type StartupLocationSnapshot = {
  coordinate: Coordinate | null;
  source: 'current' | 'last_known_os' | 'cached_app' | 'city_fallback' | 'none';
  acquiredAtMs: number | null;
  accuracyMeters: number | null;
  permission: 'granted' | 'denied' | 'undetermined';
  reducedAccuracy: boolean;
  isStale: boolean;
};

export type StartupCameraSpec = {
  center: [number, number];
  zoom: number;
  pitch: 0;
  heading: 0;
  source: StartupLocationSnapshot['source'];
};

type MainLaunchContextValue = {
  isReadyToRender: boolean;
  startupCamera: StartupCameraSpec | null;
  startupLocationSnapshot: StartupLocationSnapshot | null;
  startupPollBounds: MapBounds | null;
  startupPollsSnapshot: PollBootstrapSnapshot | null;
  userLocation: Coordinate | null;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  locationPermissionDenied: boolean;
  ensureUserLocation: () => Promise<Coordinate | null>;
  markMainMapReady: () => void;
};

const MainLaunchContext = React.createContext<MainLaunchContextValue | null>(null);

const defaultLocationSnapshot = (
  permission: StartupLocationSnapshot['permission'] = 'undetermined'
): StartupLocationSnapshot => ({
  coordinate: null,
  source: 'none',
  acquiredAtMs: null,
  accuracyMeters: null,
  permission,
  reducedAccuracy: false,
  isStale: false,
});

const getPermissionState = (
  status: Location.PermissionStatus | null | undefined
): StartupLocationSnapshot['permission'] => {
  if (status === 'granted') {
    return 'granted';
  }
  if (status === 'denied') {
    return 'denied';
  }
  return 'undetermined';
};

const isReducedAccuracyPermission = (permission: unknown): boolean => {
  if (!permission || typeof permission !== 'object') {
    return false;
  }
  const accuracy = (permission as { ios?: { accuracy?: unknown } }).ios?.accuracy;
  return accuracy === 'reduced';
};

const buildLocationSnapshot = ({
  coordinate,
  source,
  acquiredAtMs,
  accuracyMeters,
  permission,
  reducedAccuracy,
  isStale,
}: {
  coordinate: Coordinate | null;
  source: StartupLocationSnapshot['source'];
  acquiredAtMs: number | null;
  accuracyMeters: number | null;
  permission: StartupLocationSnapshot['permission'];
  reducedAccuracy: boolean;
  isStale: boolean;
}): StartupLocationSnapshot => ({
  coordinate,
  source,
  acquiredAtMs,
  accuracyMeters,
  permission,
  reducedAccuracy,
  isStale,
});

const buildSnapshotFromPosition = (
  position: Pick<Location.LocationObject, 'coords' | 'timestamp'>,
  source: Extract<StartupLocationSnapshot['source'], 'current' | 'last_known_os'>,
  permission: StartupLocationSnapshot['permission'],
  reducedAccuracy: boolean
): StartupLocationSnapshot => {
  const accuracyMeters =
    typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null;
  return buildLocationSnapshot({
    coordinate: {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    },
    source,
    acquiredAtMs: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
    accuracyMeters,
    permission,
    reducedAccuracy,
    isStale: source !== 'current',
  });
};

const parseCachedAppLocation = (
  rawValue: string | null,
  permission: StartupLocationSnapshot['permission']
): StartupLocationSnapshot | null => {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as {
      lat?: unknown;
      lng?: unknown;
      updatedAt?: unknown;
      accuracyMeters?: unknown;
    };
    if (
      typeof parsed.lat !== 'number' ||
      !Number.isFinite(parsed.lat) ||
      typeof parsed.lng !== 'number' ||
      !Number.isFinite(parsed.lng)
    ) {
      return null;
    }
    const updatedAt =
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : null;
    if (updatedAt != null && Date.now() - updatedAt > MAX_STORED_LOCATION_AGE_MS) {
      return null;
    }
    const accuracyMeters =
      typeof parsed.accuracyMeters === 'number' && Number.isFinite(parsed.accuracyMeters)
        ? parsed.accuracyMeters
        : null;
    return buildLocationSnapshot({
      coordinate: {
        lat: parsed.lat,
        lng: parsed.lng,
      },
      source: 'cached_app',
      acquiredAtMs: updatedAt,
      accuracyMeters,
      permission,
      reducedAccuracy: false,
      isStale: true,
    });
  } catch {
    return null;
  }
};

const buildCityFallbackSnapshot = (
  selectedCity: string | null,
  permission: StartupLocationSnapshot['permission']
): StartupLocationSnapshot => {
  const cityViewport = resolveCityViewport(selectedCity);
  if (cityViewport) {
    return buildLocationSnapshot({
      coordinate: {
        lat: cityViewport.center[1],
        lng: cityViewport.center[0],
      },
      source: 'city_fallback',
      acquiredAtMs: null,
      accuracyMeters: null,
      permission,
      reducedAccuracy: false,
      isStale: true,
    });
  }
  return defaultLocationSnapshot(permission);
};

const buildCameraFromSnapshot = (
  snapshot: StartupLocationSnapshot,
  selectedCity: string | null
): StartupCameraSpec => {
  if (snapshot.coordinate) {
    return {
      center: [snapshot.coordinate.lng, snapshot.coordinate.lat],
      zoom:
        snapshot.source === 'city_fallback'
          ? resolveCityViewport(selectedCity)?.zoom ?? USA_FALLBACK_ZOOM
          : SINGLE_LOCATION_ZOOM_LEVEL,
      pitch: 0,
      heading: 0,
      source: snapshot.source,
    };
  }

  const fallbackViewport = resolveCityViewport(selectedCity);
  return {
    center: fallbackViewport?.center ?? USA_FALLBACK_CENTER,
    zoom: fallbackViewport?.zoom ?? USA_FALLBACK_ZOOM,
    pitch: 0,
    heading: 0,
    source: fallbackViewport ? 'city_fallback' : 'none',
  };
};

const chooseBestSnapshot = (
  candidates: Array<StartupLocationSnapshot | null | undefined>
): StartupLocationSnapshot | null => {
  const priority: Record<StartupLocationSnapshot['source'], number> = {
    current: 5,
    last_known_os: 4,
    cached_app: 3,
    city_fallback: 2,
    none: 1,
  };
  let best: StartupLocationSnapshot | null = null;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (!best || priority[candidate.source] > priority[best.source]) {
      best = candidate;
    }
  }
  return best;
};

const raceWithTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  if (timeoutMs <= 0) {
    return null;
  }
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(null);
    }, timeoutMs);
    void promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(null);
      });
  });
};

const clampLatitude = (value: number): number => Math.max(-85, Math.min(85, value));

const deriveBoundsFromCamera = (camera: StartupCameraSpec | null): MapBounds | null => {
  if (!camera) {
    return null;
  }
  const [lng, lat] = camera.center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(camera.zoom)) {
    return null;
  }
  const viewport = Dimensions.get('window');
  const safeHeight = Math.max(viewport.height, 1);
  const safeWidth = Math.max(viewport.width, 1);
  const latitudeRadians = (clampLatitude(lat) * Math.PI) / 180;
  const cosLatitude = Math.max(Math.cos(latitudeRadians), 0.2);
  const metersPerPixel = (156543.03392 * cosLatitude) / Math.pow(2, camera.zoom);
  const halfHeightMeters = (safeHeight * metersPerPixel) / 2;
  const halfWidthMeters = (safeWidth * metersPerPixel) / 2;
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * cosLatitude;
  const latitudeDelta = halfHeightMeters / metersPerDegreeLatitude;
  const longitudeDelta = halfWidthMeters / Math.max(metersPerDegreeLongitude, 1);
  return {
    northEast: {
      lat: clampLatitude(lat + latitudeDelta),
      lng: lng + longitudeDelta,
    },
    southWest: {
      lat: clampLatitude(lat - latitudeDelta),
      lng: lng - longitudeDelta,
    },
  };
};

export const MainLaunchCoordinator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isReady: isRouteReady, routeState } = useAppRouteCoordinator();
  const selectedCityRaw = useCityStore((state) => state.selectedCity);
  const selectedCity = normalizePersistedCity(selectedCityRaw) ?? 'Austin';

  const [isMainLaunchReady, setIsMainLaunchReady] = React.useState(false);
  const [isStartupResolved, setIsStartupResolved] = React.useState(false);
  const [isStartupPollsResolved, setIsStartupPollsResolved] = React.useState(false);
  const [startupCamera, setStartupCamera] = React.useState<StartupCameraSpec | null>(null);
  const [startupLocationSnapshot, setStartupLocationSnapshot] =
    React.useState<StartupLocationSnapshot | null>(null);
  const [startupPollsSnapshot, setStartupPollsSnapshot] =
    React.useState<PollBootstrapSnapshot | null>(null);
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const [mainLaunchFailure, setMainLaunchFailure] = React.useState<Error | null>(null);

  const userLocationRef = React.useRef<Coordinate | null>(null);
  const latestLocationSnapshotRef = React.useRef<StartupLocationSnapshot>(
    defaultLocationSnapshot()
  );
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationRequestInFlightRef = React.useRef(false);
  const startupResolutionSeqRef = React.useRef(0);
  const startupPollBootstrapSeqRef = React.useRef(0);
  const lastStartupPollBootstrapKeyRef = React.useRef<string | null>(null);
  const splashHiddenRef = React.useRef(false);
  const hasCompletedInitialMainLaunchRef = React.useRef(false);
  const startupPollBounds = React.useMemo(
    () => deriveBoundsFromCamera(startupCamera),
    [startupCamera]
  );

  const markMainMapReady = React.useCallback(() => {
    setIsMainLaunchReady((previous) => (previous ? previous : true));
  }, []);

  if (mainLaunchFailure) {
    throw mainLaunchFailure;
  }

  React.useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  React.useEffect(() => {
    if (!userLocation) {
      return;
    }
    const snapshot = latestLocationSnapshotRef.current;
    if (snapshot.source === 'city_fallback' || snapshot.source === 'none') {
      return;
    }
    void AsyncStorage.setItem(
      BOOT_LOCATION_STORAGE_KEY,
      JSON.stringify({
        lat: userLocation.lat,
        lng: userLocation.lng,
        updatedAt: Date.now(),
        accuracyMeters: snapshot.accuracyMeters,
      })
    ).catch(() => undefined);
  }, [userLocation]);

  const applyLocationSnapshot = React.useCallback((snapshot: StartupLocationSnapshot) => {
    latestLocationSnapshotRef.current = snapshot;
    setStartupLocationSnapshot(snapshot);
    setLocationPermissionDenied(snapshot.permission === 'denied');
    setUserLocation(snapshot.coordinate);
  }, []);

  const startLocationWatch = React.useCallback(
    async (
      permission: StartupLocationSnapshot['permission'],
      reducedAccuracy: boolean
    ): Promise<void> => {
      if (locationWatchRef.current || permission !== 'granted') {
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
            applyLocationSnapshot(
              buildSnapshotFromPosition(update, 'current', permission, reducedAccuracy)
            );
          }
        );
      } catch (error) {
        logger.warn('Failed to start main launch location watch', error);
      }
    },
    [applyLocationSnapshot]
  );

  const resolveCurrentPosition = React.useCallback(
    async (
      permission: StartupLocationSnapshot['permission'],
      reducedAccuracy: boolean
    ): Promise<StartupLocationSnapshot | null> => {
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return buildSnapshotFromPosition(position, 'current', permission, reducedAccuracy);
      } catch {
        return null;
      }
    },
    []
  );

  const resolveLastKnownPosition = React.useCallback(
    async (
      permission: StartupLocationSnapshot['permission'],
      reducedAccuracy: boolean
    ): Promise<StartupLocationSnapshot | null> => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!lastKnown) {
          return null;
        }
        return buildSnapshotFromPosition(lastKnown, 'last_known_os', permission, reducedAccuracy);
      } catch {
        return null;
      }
    },
    []
  );

  const ensureUserLocation = React.useCallback(async (): Promise<Coordinate | null> => {
    const latestSnapshot = latestLocationSnapshotRef.current;
    if (
      latestSnapshot.coordinate &&
      latestSnapshot.permission === 'granted' &&
      latestSnapshot.source === 'current'
    ) {
      return latestSnapshot.coordinate;
    }
    if (locationRequestInFlightRef.current) {
      return userLocationRef.current;
    }

    locationRequestInFlightRef.current = true;
    try {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      let status = existingPermission.status;
      let reducedAccuracy = isReducedAccuracyPermission(existingPermission);

      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
        reducedAccuracy = isReducedAccuracyPermission(requested);
      }

      const permission = getPermissionState(status);
      if (permission !== 'granted') {
        applyLocationSnapshot(defaultLocationSnapshot(permission));
        return null;
      }

      const lastKnownSnapshot = await resolveLastKnownPosition(permission, reducedAccuracy);
      if (lastKnownSnapshot) {
        applyLocationSnapshot(lastKnownSnapshot);
      }

      await startLocationWatch(permission, reducedAccuracy);

      const currentSnapshot = await resolveCurrentPosition(permission, reducedAccuracy);
      if (currentSnapshot) {
        applyLocationSnapshot(currentSnapshot);
        return currentSnapshot.coordinate;
      }
      return userLocationRef.current;
    } catch (error) {
      logger.warn('Failed to ensure user location from main launch coordinator', error);
      return userLocationRef.current;
    } finally {
      locationRequestInFlightRef.current = false;
    }
  }, [applyLocationSnapshot, resolveCurrentPosition, resolveLastKnownPosition, startLocationWatch]);

  React.useEffect(() => {
    if (!isRouteReady || !routeState) {
      return;
    }

    if (routeState.destination !== 'main') {
      setIsStartupResolved(true);
      setIsStartupPollsResolved(true);
      setIsMainLaunchReady(true);
      return;
    }

    if (isSplashStudioEnabled) {
      setIsStartupResolved(true);
      setIsStartupPollsResolved(true);
      setIsMainLaunchReady(true);
      return;
    }

    if (hasCompletedInitialMainLaunchRef.current) {
      setIsStartupResolved(true);
      setIsStartupPollsResolved(true);
      setIsMainLaunchReady(true);
      return;
    }

    setMainLaunchFailure(null);
    setIsStartupResolved(false);
    setIsStartupPollsResolved(false);
    setIsMainLaunchReady(false);
    setStartupPollsSnapshot(null);
    lastStartupPollBootstrapKeyRef.current = null;
    const seq = ++startupResolutionSeqRef.current;
    let cancelled = false;

    void (async () => {
      const startedAtMs = Date.now();
      const permissionResponse = await Location.getForegroundPermissionsAsync().catch(() => null);
      const permission = getPermissionState(permissionResponse?.status);
      const reducedAccuracy = isReducedAccuracyPermission(permissionResponse);

      const cachedSnapshotPromise = AsyncStorage.getItem(BOOT_LOCATION_STORAGE_KEY)
        .then((raw) => parseCachedAppLocation(raw, permission))
        .catch(() => null);
      const lastKnownSnapshotPromise =
        permission === 'granted'
          ? resolveLastKnownPosition(permission, reducedAccuracy)
          : Promise.resolve<StartupLocationSnapshot | null>(null);

      const [cachedSnapshot, lastKnownSnapshot] = await Promise.all([
        cachedSnapshotPromise,
        lastKnownSnapshotPromise,
      ]);

      const cityFallbackSnapshot = buildCityFallbackSnapshot(selectedCity, permission);
      const currentPositionPromise =
        permission === 'granted'
          ? resolveCurrentPosition(permission, reducedAccuracy)
          : Promise.resolve<StartupLocationSnapshot | null>(null);

      const currentSnapshot = await raceWithTimeout(
        currentPositionPromise,
        Math.max(0, STARTUP_LOCATION_MAX_WAIT_MS - (Date.now() - startedAtMs))
      );

      const bestSnapshot =
        chooseBestSnapshot([currentSnapshot, lastKnownSnapshot, cachedSnapshot]) ??
        cityFallbackSnapshot;

      if (cancelled || seq !== startupResolutionSeqRef.current) {
        return;
      }

      applyLocationSnapshot(bestSnapshot);
      setStartupCamera(buildCameraFromSnapshot(bestSnapshot, selectedCity));
      setIsStartupResolved(true);

      if (permission === 'granted') {
        await startLocationWatch(permission, reducedAccuracy);
        void currentPositionPromise.then((snapshot) => {
          if (!snapshot || cancelled || seq !== startupResolutionSeqRef.current) {
            return;
          }
          applyLocationSnapshot(snapshot);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyLocationSnapshot,
    isRouteReady,
    resolveCurrentPosition,
    resolveLastKnownPosition,
    routeState,
    selectedCity,
    startLocationWatch,
  ]);

  React.useEffect(() => {
    if (
      !isRouteReady ||
      routeState?.destination !== 'main' ||
      !isStartupResolved ||
      !startupCamera
    ) {
      return;
    }

    const launchIntent = routeState.launchIntent;
    const launchIntentCoverageKey =
      launchIntent?.type === 'polls' && typeof launchIntent.coverageKey === 'string'
        ? launchIntent.coverageKey.trim().toLowerCase()
        : null;
    const startupCacheCoverageKey =
      launchIntentCoverageKey ??
      (startupCamera.source === 'city_fallback' ? normalizePollCoverageKey(selectedCity) : null);
    const bootstrapKey = JSON.stringify({
      launchIntentCoverageKey,
      center: startupCamera.center.map((value) => Math.round(value * 1e5) / 1e5),
      zoom: Math.round(startupCamera.zoom * 100) / 100,
    });
    if (!launchIntentCoverageKey && !startupPollBounds) {
      setIsStartupPollsResolved(true);
      return;
    }

    if (lastStartupPollBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    lastStartupPollBootstrapKeyRef.current = bootstrapKey;

    const seq = ++startupPollBootstrapSeqRef.current;
    let cancelled = false;
    let pollsResolved = false;
    let pollsGraceTimeout: ReturnType<typeof setTimeout> | null = null;

    const resolveStartupPolls = () => {
      if (pollsResolved || cancelled || seq !== startupPollBootstrapSeqRef.current) {
        return;
      }
      pollsResolved = true;
      setIsStartupPollsResolved(true);
    };

    void (async () => {
      try {
        const cachedSnapshot = startupCacheCoverageKey
          ? await readPollBootstrapSnapshotForCoverage(startupCacheCoverageKey)
          : null;
        if (cachedSnapshot && !cancelled && seq === startupPollBootstrapSeqRef.current) {
          setStartupPollsSnapshot(cachedSnapshot);
          resolveStartupPolls();
        } else {
          pollsGraceTimeout = setTimeout(resolveStartupPolls, STARTUP_POLLS_GRACE_MS);
        }

        const response = await fetchPolls(
          launchIntentCoverageKey
            ? { coverageKey: launchIntentCoverageKey }
            : startupPollBounds
            ? { bounds: startupPollBounds }
            : {}
        );
        if (cancelled || seq !== startupPollBootstrapSeqRef.current) {
          return;
        }
        const snapshot = createNetworkPollBootstrapSnapshot(response);
        setStartupPollsSnapshot(snapshot);
        await writePollBootstrapSnapshot(snapshot);
        resolveStartupPolls();
      } catch (error) {
        logger.warn('Failed to bootstrap startup polls', error);
        resolveStartupPolls();
      } finally {
        if (pollsGraceTimeout) {
          clearTimeout(pollsGraceTimeout);
          pollsGraceTimeout = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pollsGraceTimeout) {
        clearTimeout(pollsGraceTimeout);
      }
    };
  }, [
    isRouteReady,
    isStartupResolved,
    routeState?.launchIntent,
    routeState?.destination,
    selectedCity,
    startupCamera,
    startupPollBounds,
  ]);

  React.useEffect(() => {
    if (!isRouteReady || routeState?.destination !== 'main' || !isStartupResolved) {
      return;
    }

    const launchIntent = routeState.launchIntent;
    const fallbackLocation = startupLocationSnapshot?.coordinate ?? null;
    if (launchIntent.type === 'restaurant') {
      void searchService.restaurantProfile(launchIntent.restaurantId).catch(() => undefined);
      return;
    }

    if (launchIntent.type !== 'search') {
      return;
    }

    const intent = launchIntent.searchIntent;
    if (intent.type === 'recentSearch') {
      const trimmedQuery = intent.entry.queryText.trim();
      if (!trimmedQuery) {
        return;
      }
      if (intent.entry.selectedEntityType === 'restaurant' && intent.entry.selectedEntityId) {
        void searchService
          .structuredSearch({
            entities: {
              restaurants: [
                {
                  normalizedName: trimmedQuery,
                  entityIds: [intent.entry.selectedEntityId],
                  originalText: trimmedQuery,
                },
              ],
            },
            bounds: startupPollBounds ?? undefined,
            userLocation: fallbackLocation ?? undefined,
            sourceQuery: trimmedQuery,
            submissionSource: 'recent',
            submissionContext: {
              typedPrefix: trimmedQuery,
              matchType: 'entity',
              selectedEntityId: intent.entry.selectedEntityId,
              selectedEntityType: 'restaurant',
            },
          })
          .catch(() => undefined);
        return;
      }
      void searchService
        .naturalSearch({
          query: trimmedQuery,
          bounds: startupPollBounds ?? undefined,
          userLocation: fallbackLocation ?? undefined,
          submissionSource: 'recent',
        })
        .catch(() => undefined);
      return;
    }

    const restaurantId =
      intent.type === 'recentlyViewed' ? intent.restaurant.restaurantId : intent.food.restaurantId;
    const restaurantName =
      intent.type === 'recentlyViewed'
        ? intent.restaurant.restaurantName.trim()
        : intent.food.restaurantName.trim();
    const typedPrefix =
      intent.type === 'recentlyViewed'
        ? restaurantName
        : intent.food.foodName.trim() || restaurantName;
    if (!restaurantId || !restaurantName) {
      return;
    }
    void searchService
      .structuredSearch({
        entities: {
          restaurants: [
            {
              normalizedName: restaurantName,
              entityIds: [restaurantId],
              originalText: restaurantName,
            },
          ],
        },
        bounds: startupPollBounds ?? undefined,
        userLocation: fallbackLocation ?? undefined,
        sourceQuery: restaurantName,
        submissionSource: 'recent',
        submissionContext: {
          typedPrefix,
          matchType: 'entity',
          selectedEntityId: restaurantId,
          selectedEntityType: 'restaurant',
        },
      })
      .catch(() => undefined);
  }, [
    isRouteReady,
    isStartupResolved,
    routeState?.destination,
    routeState?.launchIntent,
    startupLocationSnapshot?.coordinate,
    startupPollBounds,
  ]);

  React.useEffect(() => {
    if (
      !isRouteReady ||
      !routeState ||
      routeState.destination !== 'main' ||
      isSplashStudioEnabled ||
      hasCompletedInitialMainLaunchRef.current ||
      (isStartupResolved && isStartupPollsResolved && isMainLaunchReady)
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      const error = new Error('Main launch timed out before first fully rendered map frame');
      logger.error('Main launch readiness timeout', {
        destination: routeState.destination,
        isStartupResolved,
        isStartupPollsResolved,
        isMainLaunchReady,
      });
      setMainLaunchFailure(error);
    }, MAIN_LAUNCH_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isMainLaunchReady, isRouteReady, isStartupPollsResolved, isStartupResolved, routeState]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }
      void (async () => {
        try {
          const permission = await Location.getForegroundPermissionsAsync();
          if (permission.status === 'granted') {
            await startLocationWatch('granted', isReducedAccuracyPermission(permission));
          }
        } catch {
          // ignore
        }
      })();
    });
    return () => {
      subscription.remove();
    };
  }, [startLocationWatch]);

  const isReadyToRender =
    isRouteReady &&
    routeState != null &&
    (routeState.destination === 'main'
      ? isStartupResolved && isStartupPollsResolved && isMainLaunchReady
      : true);
  const shouldHideSplash =
    isRouteReady &&
    routeState != null &&
    (routeState.destination === 'main' ? (isSplashStudioEnabled ? true : isReadyToRender) : true);

  React.useEffect(() => {
    if (!shouldHideSplash || splashHiddenRef.current) {
      return;
    }
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [routeState?.destination, shouldHideSplash]);

  React.useEffect(() => {
    if (!isReadyToRender || routeState?.destination !== 'main') {
      return;
    }
    hasCompletedInitialMainLaunchRef.current = true;
  }, [isReadyToRender, routeState?.destination]);

  React.useEffect(() => {
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  const value = React.useMemo<MainLaunchContextValue>(
    () => ({
      isReadyToRender,
      startupCamera,
      startupLocationSnapshot,
      startupPollBounds,
      startupPollsSnapshot,
      userLocation,
      userLocationRef,
      locationPermissionDenied,
      ensureUserLocation,
      markMainMapReady,
    }),
    [
      ensureUserLocation,
      isReadyToRender,
      locationPermissionDenied,
      markMainMapReady,
      startupCamera,
      startupLocationSnapshot,
      startupPollBounds,
      startupPollsSnapshot,
      userLocation,
    ]
  );

  return <MainLaunchContext.Provider value={value}>{children}</MainLaunchContext.Provider>;
};

export const useMainLaunchCoordinator = (): MainLaunchContextValue => {
  const context = React.useContext(MainLaunchContext);
  if (!context) {
    throw new Error('useMainLaunchCoordinator must be used within MainLaunchCoordinator');
  }
  return context;
};
