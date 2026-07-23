import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { AppState, Dimensions } from 'react-native';
import type { Coordinate, MapBounds } from '../../types';
import { searchService } from '../../services/search';
import { resolveIpLocation } from '../../services/launch-position';
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
  /** Launch-position camera envelope (the smallest containing catalog
   *  place's bbox) for the IP rung — frames the whole locale instead of a
   *  fixed single-location zoom. */
  ipBounds?: MapBounds | null;
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

/**
 * THE permission chokepoint (location red-team 2026-07-10): the app previously
 * only ever READ permission status — nothing anywhere requested it, so a fresh
 * install sat at 'undetermined' forever, the GPS watch never started, and the
 * location puck never mounted. Reading is not asking: when status is
 * undetermined, ask the OS (one system prompt); every other status is returned
 * as-is (denied users are never nagged — the ladder falls through to IP/national).
 */
async function ensureForegroundLocationPermission(): Promise<Location.LocationPermissionResponse | null> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status !== Location.PermissionStatus.UNDETERMINED) {
      return existing;
    }
    return await Location.requestForegroundPermissionsAsync();
  } catch {
    return null;
  }
}

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

// IP→locale snapshot: coarse city-level coordinate from the place catalog's
// launch endpoint (Google's no-device-signal rung). NOT the user's true
// position, so it reads as 'unavailable' for the user-location dot. Carries
// the containing place's bbox so the camera frames the locale (no market
// shape — markets extermination leg 3).
const buildIpFallbackSnapshot = (
  coordinate: Coordinate,
  permission: StartupLocationSnapshot['permission'],
  ipBounds: MapBounds | null
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
  ipBounds,
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
    // IP rung with a catalog-place envelope: fit the locale instead of the
    // fixed single-location zoom (bounds → zoom is the inverse of
    // deriveBoundsFromCamera's zoom → bounds).
    const boundsZoom =
      snapshot.source === 'ip_fallback' && snapshot.ipBounds
        ? deriveZoomFromBounds(snapshot.ipBounds, snapshot.coordinate)
        : null;
    return {
      center: [snapshot.coordinate.lng, snapshot.coordinate.lat],
      // Device fixes frame a single locale; the neutral national fallback
      // (city_fallback at USA center) zooms way out. No per-city zoom anymore.
      zoom:
        boundsZoom ??
        (snapshot.source === 'city_fallback' ? USA_FALLBACK_ZOOM : SINGLE_LOCATION_ZOOM_LEVEL),
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

// Inverse of deriveBoundsFromCamera: the zoom whose viewport spans the given
// envelope (limiting axis wins), clamped to a sane city..street band so a
// degenerate or continent-sized envelope can't produce a broken camera.
const deriveZoomFromBounds = (bounds: MapBounds, center: Coordinate): number | null => {
  const latDelta = Math.abs(bounds.northEast.lat - bounds.southWest.lat);
  const lngDelta = Math.abs(bounds.northEast.lng - bounds.southWest.lng);
  if (!Number.isFinite(latDelta) || !Number.isFinite(lngDelta) || latDelta <= 0 || lngDelta <= 0) {
    return null;
  }
  const viewport = Dimensions.get('window');
  const safeHeight = Math.max(viewport.height, 1);
  const safeWidth = Math.max(viewport.width, 1);
  const latitudeRadians = (clampLatitude(center.lat) * Math.PI) / 180;
  const cosLatitude = Math.max(Math.cos(latitudeRadians), 0.2);
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * cosLatitude;
  const heightMeters = latDelta * metersPerDegreeLatitude;
  const widthMeters = lngDelta * metersPerDegreeLongitude;
  const metersPerPixelNeeded = Math.max(heightMeters / safeHeight, widthMeters / safeWidth);
  if (!Number.isFinite(metersPerPixelNeeded) || metersPerPixelNeeded <= 0) {
    return null;
  }
  const zoom = Math.log2((156543.03392 * cosLatitude) / metersPerPixelNeeded);
  if (!Number.isFinite(zoom)) {
    return null;
  }
  return Math.max(8, Math.min(zoom, 14));
};

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
  const [startupCamera, setStartupCamera] = React.useState<StartupCameraSpec | null>(null);
  const [startupLocationSnapshot, setStartupLocationSnapshot] =
    React.useState<StartupLocationSnapshot | null>(null);
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [userLocationState, setUserLocationState] =
    React.useState<UserLocationState>('unavailable');
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const [mainLaunchFailure, setMainLaunchFailure] = React.useState<Error | null>(null);
  // §9.4 escape hatch, ROUTE-READINESS axis: forced true only by the route-readiness timeout
  // below. False on every happy-path boot, so the reveal predicate is byte-identical there.
  const [isLaunchRouteEscapeForced, setIsLaunchRouteEscapeForced] = React.useState(false);

  const userLocationRef = React.useRef<Coordinate | null>(null);
  const latestLocationSnapshotRef =
    React.useRef<StartupLocationSnapshot>(defaultLocationSnapshot());
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const startupResolutionSeqRef = React.useRef(0);
  const splashHiddenRef = React.useRef(false);
  const hasCompletedInitialMainLaunchRef = React.useRef(false);
  const mainMapReadinessAuthorityRef = React.useRef(createMainMapReadinessAuthority());
  const [mainMapReadinessRevision, setMainMapReadinessRevision] = React.useState(0);
  const startupPollBounds = React.useMemo(
    () => deriveBoundsFromCamera(startupCamera),
    [startupCamera]
  );

  // Live mirror of every reveal-gate bit for the escape-hatch dumps: the timeout callbacks below
  // must report the bits AS OF FIRE TIME (not their arming closure), so a wedge self-attributes
  // precisely. Render-phase ref write (same pattern as the feed*Refs in the polls controller).
  const launchGateBitsRef = React.useRef({
    isRouteReady,
    hasRouteState: routeState != null,
    destination: routeDestination,
    isStartupResolved,
    isMainLaunchReady,
  });
  launchGateBitsRef.current = {
    isRouteReady,
    hasRouteState: routeState != null,
    destination: routeDestination,
    isStartupResolved,
    isMainLaunchReady,
  };

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
      setIsMainLaunchReady(true);
      return;
    }

    if (isSplashStudioEnabled) {
      setIsStartupResolved(true);
      setIsMainLaunchReady(true);
      return;
    }

    if (hasCompletedInitialMainLaunchRef.current) {
      setIsStartupResolved(true);
      setIsMainLaunchReady(true);
      return;
    }

    setMainLaunchFailure(null);
    publishMainMapReadinessSignal(() => mainMapReadinessAuthorityRef.current.reset());
    setIsStartupResolved(false);
    setIsMainLaunchReady(false);
    const seq = ++startupResolutionSeqRef.current;
    let cancelled = false;

    void (async () => {
      const startedAtMs = Date.now();

      // Test/dev override: fix the STARTUP CAMERA origin at the configured coordinate
      // (deterministic launch viewport for Maestro flows). It must NOT suppress the
      // live current-location puck — we still resolve permission and start the GPS
      // watch so the marker reflects the real device location. The watch updates
      // userLocation without re-centering the camera, so the override origin holds.
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

        const overridePermissionResponse = await ensureForegroundLocationPermission();
        const overridePermission = getPermissionState(overridePermissionResponse?.status);
        const overrideReducedAccuracy = isReducedAccuracyPermission(overridePermissionResponse);
        if (
          overridePermission === 'granted' &&
          !cancelled &&
          seq === startupResolutionSeqRef.current
        ) {
          await startLocationWatch(overridePermission, overrideReducedAccuracy);
          void resolveCurrentPosition(overridePermission, overrideReducedAccuracy).then(
            (snapshot) => {
              if (!snapshot || cancelled || seq !== startupResolutionSeqRef.current) {
                return;
              }
              applyLocationSnapshot(snapshot);
            }
          );
        }
        return;
      }

      const permissionResponse = await ensureForegroundLocationPermission();
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
          const ipBounds =
            ip.bounds?.northEast && ip.bounds?.southWest
              ? { northEast: ip.bounds.northEast, southWest: ip.bounds.southWest }
              : null;
          bestSnapshot = buildIpFallbackSnapshot(ip.coordinate, permission, ipBounds);
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

  // The startup-polls CACHE SEED is DEAD (§22 item-5 cut): the feed is viewport-
  // scoped now, and a viewport has no stable cache key — the docked feed skeletons
  // until its own bounds-driven fetch resolves (which never holds the splash).

  React.useEffect(() => {
    if (!isRouteReady || routeState?.destination !== 'main' || !isStartupResolved) {
      return;
    }

    const launchIntent = routeState.launchIntent;
    const startupLocation = resolveSemanticUserLocation(startupLocationSnapshot);
    if (launchIntent.type === 'entityAction' && launchIntent.action.kind === 'restaurantWorld') {
      // Leg 2 (geo-demand rebuild §7): the profile is restaurant-scoped — no market slice.
      void searchService.restaurantProfile(launchIntent.action.restaurantId).catch(() => undefined);
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

  // §9.4: startup-polls readiness is NOT part of the launch-ready predicate — the app reveals
  // home when the map is ready; the docked polls feed shows its own skeleton until polls resolve.
  React.useEffect(() => {
    if (
      !isRouteReady ||
      routeState?.destination !== 'main' ||
      isSplashStudioEnabled ||
      hasCompletedInitialMainLaunchRef.current ||
      !isStartupResolved ||
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
    isStartupResolved,
    mainMapReadinessRevision,
    routeState?.destination,
  ]);

  // §9.4: the escape hatch must force the FULL reveal predicate (every bit isReadyToRender
  // checks). The old version set only isMainLaunchReady while the gate also required the
  // startup-polls bit, so it re-armed and fired forever — the observed never-lifting splash.
  React.useEffect(() => {
    if (
      !isRouteReady ||
      !routeState ||
      routeState.destination !== 'main' ||
      isSplashStudioEnabled ||
      hasCompletedInitialMainLaunchRef.current ||
      (isStartupResolved && isMainLaunchReady)
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      // Dump EVERY reveal-gate bit (route + startup + mainLaunchReady + map-readiness snapshot)
      // at fire time so any wedge — including the KNOWN-OPEN dev-client-reload signature at the
      // reveal gate below — self-attributes from the log alone.
      logger.error('Main launch readiness timeout', {
        ...launchGateBitsRef.current,
        mainMapReadiness: mainMapReadinessAuthorityRef.current.getSnapshot(),
      });
      setIsStartupResolved(true);
      setIsMainLaunchReady(true);
    }, MAIN_LAUNCH_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isMainLaunchReady, isRouteReady, isStartupResolved, routeDestination]);

  // §9.4 escape hatch, ROUTE-READINESS axis: the effect above cannot arm while the ROUTE bits
  // themselves are wedged — it early-returns until isRouteReady && routeState resolve, so a route
  // coordinator that never publishes would frost forever with NO escape. This timer arms at the
  // earliest lifecycle point (isRouteResolved is false at mount) and, if the route bits never
  // resolve within the same bounded window, force-reveals through the same full reveal predicate
  // (the forced bit is OR-ed into isReadyToRender/shouldHideSplash below — no side-channel
  // splash hide) and logger.error-dumps every gate bit so any future occurrence self-attributes.
  // Happy path: the route bits resolve first, the cleanup clears the timer, the forced bit stays
  // false forever → reveal timing is byte-identical.
  const isRouteResolved = isRouteReady && routeState != null;
  React.useEffect(() => {
    if (isRouteResolved || isLaunchRouteEscapeForced) {
      return;
    }
    const timeout = setTimeout(() => {
      logger.error('Main launch route readiness timeout', {
        ...launchGateBitsRef.current,
        mainMapReadiness: mainMapReadinessAuthorityRef.current.getSnapshot(),
      });
      setIsLaunchRouteEscapeForced(true);
    }, MAIN_LAUNCH_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isLaunchRouteEscapeForced, isRouteResolved]);

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

  // §9.4: the reveal gate never waits on startup polls — a failed/slow polls load must NEVER
  // hold the splash. The docked polls scene skeletons until the feed runtime resolves polls.
  //
  // KNOWN-OPEN (observed once, UNATTRIBUTED — don't chase without a repro): a dev-client-RELOAD
  // boot frosted with the map-readiness signals never re-firing on a reused native map view
  // (markMainMapLoaded/markMainMapReady silent → isMainLaunchReady never latches). Any recurrence
  // now self-attributes: the 10s escapes above fire and dump every gate bit + the map-readiness
  // snapshot. isLaunchRouteEscapeForced is the route-axis escape — false on every happy-path
  // boot, so `escape || (…)` evaluates identically to the bare predicate there.
  const isReadyToRender =
    isLaunchRouteEscapeForced ||
    (isRouteReady &&
      routeState != null &&
      (routeDestination === 'main' ? isStartupResolved && isMainLaunchReady : true));
  const shouldHideSplash =
    isLaunchRouteEscapeForced ||
    (isRouteReady &&
      routeState != null &&
      (routeDestination === 'main' ? (isSplashStudioEnabled ? true : isReadyToRender) : true));

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
