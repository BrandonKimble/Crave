import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { AppState, Dimensions } from 'react-native';
import type { Coordinate, MapBounds } from '../../types';
import {
  createNetworkPollBootstrapSnapshot,
  fetchPolls,
  normalizePollMarketKey,
  readPollBootstrapSnapshotForMarket,
  writePollBootstrapSnapshot,
  type PollBootstrapSnapshot,
} from '../../services/polls';
import { searchService } from '../../services/search';
import { resolveIpLocation } from '../../services/markets';
import { logger } from '../../utils';
import {
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from '../../screens/Search/constants/search';
import { useAppRouteCoordinator } from './AppRouteCoordinator';
import { isSplashStudioEnabled } from '../../splash-studio/config';
import { createMainMapReadinessAuthority } from './main-map-readiness-authority';

const BOOT_LOCATION_STORAGE_KEY = 'boot:lastKnownLocation';
// Cold GPS fixes routinely take 1-3s; only block startup briefly, then paint the
// best immediate source (last-known/cached) and EASE to the fresh fix when it lands.
const STARTUP_LOCATION_MAX_WAIT_MS = 1_500;
const STARTUP_POLLS_GRACE_MS = 350;
const MAX_STORED_LOCATION_AGE_MS = 6 * 60 * 60 * 1000;
const MAIN_LAUNCH_READY_TIMEOUT_MS = 10_000;

export type StartupLocationSnapshot = {
  coordinate: Coordinate | null;
  source:
    | 'override'
    | 'current'
    | 'last_known_os'
    | 'cached_app'
    | 'ip_fallback'
    | 'city_fallback'
    | 'none';
  acquiredAtMs: number | null;
  accuracyMeters: number | null;
  permission: 'granted' | 'denied' | 'undetermined';
  reducedAccuracy: boolean;
  isStale: boolean;
  ipMarketKey?: string | null;
};

// Deterministic startup-location override for tests/dev. When EXPO_PUBLIC_STARTUP_LAT
// and EXPO_PUBLIC_STARTUP_LNG are set, startup short-circuits all GPS/last-known
// resolution and centers exactly there — giving Maestro flows a predictable map
// origin without fighting simulator-GPS timing. Optional EXPO_PUBLIC_STARTUP_ZOOM.
const parseFiniteEnv = (raw: string | undefined): number | null => {
  if (raw == null || raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const STARTUP_LOCATION_OVERRIDE: { coordinate: Coordinate; zoom: number | null } | null = (() => {
  const lat = parseFiniteEnv(process.env.EXPO_PUBLIC_STARTUP_LAT);
  const lng = parseFiniteEnv(process.env.EXPO_PUBLIC_STARTUP_LNG);
  if (lat == null || lng == null) {
    return null;
  }
  return { coordinate: { lat, lng }, zoom: parseFiniteEnv(process.env.EXPO_PUBLIC_STARTUP_ZOOM) };
})();

export type StartupCameraSpec = {
  center: [number, number];
  zoom: number;
  pitch: 0;
  heading: 0;
  source: StartupLocationSnapshot['source'];
};

export type UserLocationState = 'current' | 'last_known' | 'unavailable';

type MainLaunchContextValue = {
  isReadyToRender: boolean;
  startupCamera: StartupCameraSpec | null;
  startupLocationSnapshot: StartupLocationSnapshot | null;
  startupPollBounds: MapBounds | null;
  startupPollsSnapshot: PollBootstrapSnapshot | null;
  userLocation: Coordinate | null;
  userLocationState: UserLocationState;
  userLocationRef: React.MutableRefObject<Coordinate | null>;
  locationPermissionDenied: boolean;
  markMainMapLoaded: () => void;
  markMainMapReady: () => void;
};

export type MainLaunchCoordinatorValue = MainLaunchContextValue;

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

const resolveUserLocationState = (
  snapshot: StartupLocationSnapshot | null | undefined
): UserLocationState => {
  switch (snapshot?.source) {
    case 'current':
      return 'current';
    case 'last_known_os':
    case 'cached_app':
      return 'last_known';
    default:
      return 'unavailable';
  }
};

const resolveSemanticUserLocation = (
  snapshot: StartupLocationSnapshot | null | undefined
): Coordinate | null =>
  resolveUserLocationState(snapshot) === 'unavailable' ? null : (snapshot?.coordinate ?? null);

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

// IP→metro snapshot: coarse city-level coordinate from the server (Google's
// no-device-signal rung). NOT the user's true position, so it reads as
// 'unavailable' for the user-location dot. Carries the resolved market key so
// polls/coverage bootstrap for the right metro.
const buildIpFallbackSnapshot = (
  coordinate: Coordinate,
  permission: StartupLocationSnapshot['permission'],
  ipMarketKey: string | null
): StartupLocationSnapshot => ({
  ...buildLocationSnapshot({
    coordinate,
    source: 'ip_fallback',
    acquiredAtMs: null,
    accuracyMeters: null,
    permission,
    reducedAccuracy: false,
    isStale: true,
  }),
  ipMarketKey,
});

// Absolute last resort when there is NO device location and IP→metro also fails:
// a neutral national view (NOT a hardcoded city). Adapts to nothing because we
// have nothing — but never pretends the user is in a specific city.
const buildNationalFallbackSnapshot = (
  permission: StartupLocationSnapshot['permission']
): StartupLocationSnapshot =>
  buildLocationSnapshot({
    coordinate: { lat: USA_FALLBACK_CENTER[1], lng: USA_FALLBACK_CENTER[0] },
    source: 'city_fallback',
    acquiredAtMs: null,
    accuracyMeters: null,
    permission,
    reducedAccuracy: false,
    isStale: true,
  });

const buildCameraFromSnapshot = (snapshot: StartupLocationSnapshot): StartupCameraSpec => {
  if (snapshot.coordinate) {
    return {
      center: [snapshot.coordinate.lng, snapshot.coordinate.lat],
      // Device + IP fixes frame a single locale; the neutral national fallback
      // (city_fallback at USA center) zooms way out. No per-city zoom anymore.
      zoom: snapshot.source === 'city_fallback' ? USA_FALLBACK_ZOOM : SINGLE_LOCATION_ZOOM_LEVEL,
      pitch: 0,
      heading: 0,
      source: snapshot.source,
    };
  }

  return {
    center: USA_FALLBACK_CENTER,
    zoom: USA_FALLBACK_ZOOM,
    pitch: 0,
    heading: 0,
    source: 'none',
  };
};

const chooseBestSnapshot = (
  candidates: Array<StartupLocationSnapshot | null | undefined>
): StartupLocationSnapshot | null => {
  // Device reality always beats coarser sources. Google-style ladder: current GPS,
  // then last-known, then a cached app fix, then IP→metro (the no-device-signal
  // rung), and only as an absolute last resort a neutral national default. The
  // override (test/dev) trumps everything. We do NOT reject device locations for
  // being far from any city — where the device says you are wins.
  const priority: Record<StartupLocationSnapshot['source'], number> = {
    override: 7,
    current: 6,
    last_known_os: 5,
    cached_app: 4,
    ip_fallback: 3,
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
  const routeDestination = routeState?.destination ?? null;

  const [isMainLaunchReady, setIsMainLaunchReady] = React.useState(false);
  const [isStartupResolved, setIsStartupResolved] = React.useState(false);
  const [isStartupPollsResolved, setIsStartupPollsResolved] = React.useState(false);
  const [startupCamera, setStartupCamera] = React.useState<StartupCameraSpec | null>(null);
  const [startupLocationSnapshot, setStartupLocationSnapshot] =
    React.useState<StartupLocationSnapshot | null>(null);
  const [startupPollsSnapshot, setStartupPollsSnapshot] =
    React.useState<PollBootstrapSnapshot | null>(null);
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [userLocationState, setUserLocationState] =
    React.useState<UserLocationState>('unavailable');
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const [mainLaunchFailure, setMainLaunchFailure] = React.useState<Error | null>(null);

  const userLocationRef = React.useRef<Coordinate | null>(null);
  const latestLocationSnapshotRef =
    React.useRef<StartupLocationSnapshot>(defaultLocationSnapshot());
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const startupResolutionSeqRef = React.useRef(0);
  const startupPollBootstrapSeqRef = React.useRef(0);
  const lastStartupPollBootstrapKeyRef = React.useRef<string | null>(null);
  const splashHiddenRef = React.useRef(false);
  const hasCompletedInitialMainLaunchRef = React.useRef(false);
  const mainMapReadinessAuthorityRef = React.useRef(createMainMapReadinessAuthority());
  const [mainMapReadinessRevision, setMainMapReadinessRevision] = React.useState(0);
  const startupPollBounds = React.useMemo(
    () => deriveBoundsFromCamera(startupCamera),
    [startupCamera]
  );

  const publishMainMapReadinessSignal = React.useCallback((publish: () => boolean) => {
    if (!publish()) {
      return;
    }
    setMainMapReadinessRevision((revision) => revision + 1);
  }, []);

  const markMainMapLoaded = React.useCallback(() => {
    publishMainMapReadinessSignal(() => mainMapReadinessAuthorityRef.current.markMapLoaded());
  }, [publishMainMapReadinessSignal]);

  const markMainMapReady = React.useCallback(() => {
    publishMainMapReadinessSignal(() => mainMapReadinessAuthorityRef.current.markFullyRendered());
  }, [publishMainMapReadinessSignal]);

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
    if (
      snapshot.source === 'city_fallback' ||
      snapshot.source === 'cached_app' ||
      snapshot.source === 'none'
    ) {
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
    setUserLocation(resolveSemanticUserLocation(snapshot));
    setUserLocationState(resolveUserLocationState(snapshot));
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

  React.useEffect(() => {
    if (!isRouteReady || !routeState) {
      return;
    }

    if (routeDestination !== 'main') {
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
    publishMainMapReadinessSignal(() => mainMapReadinessAuthorityRef.current.reset());
    setIsStartupResolved(false);
    setIsStartupPollsResolved(false);
    setIsMainLaunchReady(false);
    setStartupPollsSnapshot(null);
    lastStartupPollBootstrapKeyRef.current = null;
    const seq = ++startupResolutionSeqRef.current;
    let cancelled = false;

    void (async () => {
      const startedAtMs = Date.now();

      // Test/dev override: short-circuit all GPS resolution and center exactly at
      // the configured coordinate. Deterministic startup origin for Maestro flows.
      if (STARTUP_LOCATION_OVERRIDE) {
        const overrideSnapshot = buildLocationSnapshot({
          coordinate: STARTUP_LOCATION_OVERRIDE.coordinate,
          source: 'override',
          acquiredAtMs: Date.now(),
          accuracyMeters: null,
          permission: 'granted',
          reducedAccuracy: false,
          isStale: false,
        });
        if (cancelled || seq !== startupResolutionSeqRef.current) {
          return;
        }
        applyLocationSnapshot(overrideSnapshot);
        setStartupCamera(buildCameraFromSnapshot(overrideSnapshot));
        setIsStartupResolved(true);
        return;
      }

      const permissionResponse = await Location.getForegroundPermissionsAsync().catch(() => null);
      const permission = getPermissionState(permissionResponse?.status);
      const reducedAccuracy = isReducedAccuracyPermission(permissionResponse);

      const cachedSnapshotPromise =
        permission === 'granted'
          ? AsyncStorage.getItem(BOOT_LOCATION_STORAGE_KEY)
              .then((raw) => parseCachedAppLocation(raw, permission))
              .catch(() => null)
          : Promise.resolve<StartupLocationSnapshot | null>(null);
      const lastKnownSnapshotPromise =
        permission === 'granted'
          ? resolveLastKnownPosition(permission, reducedAccuracy)
          : Promise.resolve<StartupLocationSnapshot | null>(null);

      const [cachedSnapshotRaw, lastKnownSnapshot] = await Promise.all([
        cachedSnapshotPromise,
        lastKnownSnapshotPromise,
      ]);

      // A cached/last-known device fix is honored as-is — device reality wins.
      const cachedSnapshot = cachedSnapshotRaw;
      const currentPositionPromise =
        permission === 'granted'
          ? resolveCurrentPosition(permission, reducedAccuracy)
          : Promise.resolve<StartupLocationSnapshot | null>(null);

      // Paint-then-upgrade: if we already have an immediate device fix
      // (last-known/cached, both in the user's real area), don't hold the splash on
      // a cold GPS acquire — paint immediately and let the live watch refine the
      // location dot. Only block briefly for a fresh fix when we have NOTHING
      // device-side, so a first-ever launch still centers on the user.
      const hasImmediateDeviceFix =
        lastKnownSnapshot?.coordinate != null || cachedSnapshot?.coordinate != null;
      const currentWaitMs = hasImmediateDeviceFix
        ? 0
        : Math.max(0, STARTUP_LOCATION_MAX_WAIT_MS - (Date.now() - startedAtMs));
      const currentSnapshot = await raceWithTimeout(currentPositionPromise, currentWaitMs);

      const deviceSnapshot = chooseBestSnapshot([
        currentSnapshot,
        lastKnownSnapshot,
        cachedSnapshot,
      ]);

      // No device location (denied permission / no signal): Google's bottom rung —
      // coarse IP→metro from the server. If that fails too, a neutral national view.
      // Never a hardcoded city.
      let bestSnapshot = deviceSnapshot;
      if (!bestSnapshot?.coordinate) {
        const ip = await resolveIpLocation();
        if (ip?.resolved && ip.coordinate) {
          bestSnapshot = buildIpFallbackSnapshot(ip.coordinate, permission, ip.marketKey ?? null);
        } else {
          bestSnapshot = buildNationalFallbackSnapshot(permission);
        }
      }

      if (cancelled || seq !== startupResolutionSeqRef.current) {
        return;
      }

      applyLocationSnapshot(bestSnapshot);
      setStartupCamera(buildCameraFromSnapshot(bestSnapshot));
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
    publishMainMapReadinessSignal,
    resolveCurrentPosition,
    resolveLastKnownPosition,
    routeDestination,
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
    const launchIntentMarketKey =
      launchIntent?.type === 'polls' && typeof launchIntent.marketKey === 'string'
        ? launchIntent.marketKey.trim().toLowerCase()
        : null;
    const startupCacheMarketKey =
      launchIntentMarketKey ??
      (startupLocationSnapshot?.ipMarketKey
        ? normalizePollMarketKey(startupLocationSnapshot.ipMarketKey)
        : null);
    const bootstrapKey = JSON.stringify({
      launchIntentMarketKey,
      center: startupCamera.center.map((value) => Math.round(value * 1e5) / 1e5),
      zoom: Math.round(startupCamera.zoom * 100) / 100,
    });
    if (!launchIntentMarketKey && !startupPollBounds) {
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
        const cachedSnapshot = startupCacheMarketKey
          ? await readPollBootstrapSnapshotForMarket(startupCacheMarketKey)
          : null;
        if (cachedSnapshot && !cancelled && seq === startupPollBootstrapSeqRef.current) {
          setStartupPollsSnapshot(cachedSnapshot);
          resolveStartupPolls();
        } else {
          pollsGraceTimeout = setTimeout(resolveStartupPolls, STARTUP_POLLS_GRACE_MS);
        }

        const startupUserLocation = resolveSemanticUserLocation(latestLocationSnapshotRef.current);
        const response = await fetchPolls(
          launchIntentMarketKey
            ? { marketKey: launchIntentMarketKey }
            : startupPollBounds
              ? {
                  bounds: startupPollBounds,
                  ...(startupUserLocation ? { userLocation: startupUserLocation } : {}),
                }
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
    startupCamera,
    startupPollBounds,
  ]);

  React.useEffect(() => {
    if (!isRouteReady || routeState?.destination !== 'main' || !isStartupResolved) {
      return;
    }

    const launchIntent = routeState.launchIntent;
    const startupLocation = resolveSemanticUserLocation(startupLocationSnapshot);
    const startupMarketKey =
      typeof startupPollsSnapshot?.marketKey === 'string' &&
      startupPollsSnapshot.marketKey.trim().length
        ? startupPollsSnapshot.marketKey.trim().toLowerCase()
        : startupLocationSnapshot?.ipMarketKey
          ? normalizePollMarketKey(startupLocationSnapshot.ipMarketKey)
          : null;
    if (launchIntent.type === 'restaurant') {
      void searchService
        .restaurantProfile(launchIntent.restaurantId, {
          marketKey: startupMarketKey ?? null,
        })
        .catch(() => undefined);
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
            userLocation: startupLocation ?? undefined,
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
          userLocation: startupLocation ?? undefined,
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
        userLocation: startupLocation ?? undefined,
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
    startupCamera?.source,
    startupLocationSnapshot?.coordinate,
    startupPollsSnapshot?.marketKey,
    startupPollBounds,
  ]);

  React.useEffect(() => {
    if (
      !isRouteReady ||
      routeState?.destination !== 'main' ||
      isSplashStudioEnabled ||
      hasCompletedInitialMainLaunchRef.current ||
      startupCamera == null
    ) {
      return;
    }
    publishMainMapReadinessSignal(() => mainMapReadinessAuthorityRef.current.markCameraApplied());
  }, [isRouteReady, publishMainMapReadinessSignal, routeState?.destination, startupCamera]);

  React.useEffect(() => {
    if (
      !isRouteReady ||
      routeState?.destination !== 'main' ||
      isSplashStudioEnabled ||
      hasCompletedInitialMainLaunchRef.current ||
      !isStartupResolved ||
      !isStartupPollsResolved ||
      isMainLaunchReady
    ) {
      return;
    }
    if (!mainMapReadinessAuthorityRef.current.isReady()) {
      return;
    }
    setIsMainLaunchReady(true);
  }, [
    isMainLaunchReady,
    isRouteReady,
    isStartupPollsResolved,
    isStartupResolved,
    mainMapReadinessRevision,
    routeState?.destination,
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
      logger.error('Main launch readiness timeout', {
        destination: routeDestination,
        isStartupResolved,
        isStartupPollsResolved,
        isMainLaunchReady,
        mainMapReadiness: mainMapReadinessAuthorityRef.current.getSnapshot(),
      });
      setIsMainLaunchReady(true);
    }, MAIN_LAUNCH_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [
    isMainLaunchReady,
    isRouteReady,
    isStartupPollsResolved,
    isStartupResolved,
    routeDestination,
  ]);

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
    (routeDestination === 'main'
      ? isStartupResolved && isStartupPollsResolved && isMainLaunchReady
      : true);
  const shouldHideSplash =
    isRouteReady &&
    routeState != null &&
    (routeDestination === 'main' ? (isSplashStudioEnabled ? true : isReadyToRender) : true);

  React.useEffect(() => {
    if (!shouldHideSplash || splashHiddenRef.current) {
      return;
    }
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [routeDestination, shouldHideSplash]);

  React.useEffect(() => {
    if (!isReadyToRender || routeDestination !== 'main') {
      return;
    }
    hasCompletedInitialMainLaunchRef.current = true;
  }, [isReadyToRender, routeDestination]);

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
      userLocationState,
      userLocationRef,
      locationPermissionDenied,
      markMainMapLoaded,
      markMainMapReady,
    }),
    [
      isReadyToRender,
      locationPermissionDenied,
      markMainMapLoaded,
      markMainMapReady,
      startupCamera,
      startupLocationSnapshot,
      startupPollBounds,
      startupPollsSnapshot,
      userLocation,
      userLocationState,
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
