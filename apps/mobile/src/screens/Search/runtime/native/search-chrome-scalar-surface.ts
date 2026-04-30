import { NativeModules, Platform } from 'react-native';

export type SearchChromeScalarSurfaceActionId =
  | 'shortcut_restaurants'
  | 'shortcut_dishes'
  | 'search_this_area';

export type SearchChromeScalarSurfaceControlId =
  | 'shortcut_restaurants'
  | 'shortcut_dishes'
  | 'search_this_area';

export type SearchChromeScalarSurfaceRegion = {
  controlId: SearchChromeScalarSurfaceControlId;
  actionId: SearchChromeScalarSurfaceActionId;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  enabled: boolean;
  passThroughWhenDisabled: boolean;
};

export type SearchChromeScalarSurfaceSnapshot = {
  hostKey: string;
  revision: number;
  regions: SearchChromeScalarSurfaceRegion[];
};

export type SearchChromeScalarSurfaceHostRegistration = {
  hostKey: string;
  layoutOwnership: 'nativeMeasurement' | 'nativeWrappedControls';
};

export type SearchChromeScalarSurfacePlatformOwnerMissingHook =
  | 'nativeLayoutObservation'
  | 'platformReadableScalarTargets'
  | 'nativeRegionCompositionLoop'
  | 'pressTimeActionResolver';

export type SearchChromeScalarSurfacePlatformScalarSlotRegistration = {
  hostKey: string;
  controlId: SearchChromeScalarSurfaceControlId;
  active: false;
  visibleSource: 'platformReadableScalarTarget';
  enabledSource: 'platformReadableScalarTarget';
  passThroughSource: 'platformReadableScalarTarget';
};

export type SearchChromeScalarSurfacePlatformScalarSlotStatus = {
  hostKey: string;
  available: boolean;
  active: false;
  scalarSlotContractAvailable: boolean;
  registeredControlIds: SearchChromeScalarSurfaceControlId[];
  ownsScalarValues: boolean;
  missingScalarOwner:
    | 'platformReadableScalarSource'
    | 'routeIdentityAndPresentationScalarsStillReactOwned'
    | null;
};

export type SearchChromeScalarSurfacePlatformOwnerRegistration = {
  hostKey: string;
  active: false;
  measurementOwnership: 'nativeMeasurementRegistry';
  scalarOwnership: 'platformReadableTargets';
  actionResolution: 'jsPressTimeResolver';
};

export type SearchChromeScalarSurfacePlatformOwnerStatus = {
  hostKey: string;
  available: boolean;
  active: false;
  measurementOwnership: SearchChromeScalarSurfacePlatformOwnerRegistration['measurementOwnership'];
  scalarOwnership: SearchChromeScalarSurfacePlatformOwnerRegistration['scalarOwnership'];
  actionResolution: SearchChromeScalarSurfacePlatformOwnerRegistration['actionResolution'];
  ownsMeasuredFrames: boolean;
  ownsScalarValues: boolean;
  composesNativeRegions: boolean;
  resolvesActionsAtPressTime: boolean;
  missingHooks: SearchChromeScalarSurfacePlatformOwnerMissingHook[];
};

export type SearchChromeScalarSurfaceMeasuredControlRegistration = {
  hostKey: string;
  controlId: SearchChromeScalarSurfaceControlId;
  nativeTag: number;
};

export type SearchChromeScalarSurfaceMeasuredFrame = {
  controlId: SearchChromeScalarSurfaceControlId;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SearchChromeScalarSurfaceMeasuredFrameSnapshot = {
  hostKey: string;
  frames: SearchChromeScalarSurfaceMeasuredFrame[];
};

type NativeSearchChromeScalarSurfaceRegistry = {
  searchChromeScalarSurfaceAvailable?: boolean;
  searchChromeScalarSurfaceActive?: boolean;
  searchChromeScalarSurfacePlatformOwnerAvailable?: boolean;
  searchChromeScalarSurfacePlatformOwnerActive?: boolean;
  registerSurfaceHost: (payload: SearchChromeScalarSurfaceHostRegistration) => Promise<void>;
  registerPlatformOwner: (
    payload: SearchChromeScalarSurfacePlatformOwnerRegistration
  ) => Promise<void>;
  readPlatformOwnerStatus: (
    hostKey: string
  ) => Promise<SearchChromeScalarSurfacePlatformOwnerStatus>;
  registerPlatformScalarSlot?: (
    payload: SearchChromeScalarSurfacePlatformScalarSlotRegistration
  ) => Promise<void>;
  readPlatformScalarSlotStatus?: (
    hostKey: string
  ) => Promise<SearchChromeScalarSurfacePlatformScalarSlotStatus>;
  registerMeasuredControl: (
    payload: SearchChromeScalarSurfaceMeasuredControlRegistration
  ) => Promise<void>;
  measureRegisteredControls: (
    hostKey: string
  ) => Promise<SearchChromeScalarSurfaceMeasuredFrameSnapshot>;
  syncScalarSnapshot: (payload: SearchChromeScalarSurfaceSnapshot) => Promise<void>;
  clearMeasuredControl: (payload: {
    hostKey: string;
    controlId: SearchChromeScalarSurfaceControlId;
  }) => Promise<void>;
  clearSurfaceHost: (hostKey: string) => Promise<void>;
};

const MODULE_NAME = 'SearchChromeScalarSurfaceRegistry';

const nativeRegistry = (
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (NativeModules as Record<string, unknown>)[MODULE_NAME]
    : null
) as NativeSearchChromeScalarSurfaceRegistry | null;

export const SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY = 'search_chrome_scalar_surface';

const DEFAULT_PLATFORM_OWNER_REGISTRATION: SearchChromeScalarSurfacePlatformOwnerRegistration = {
  hostKey: SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  active: false,
  measurementOwnership: 'nativeMeasurementRegistry',
  scalarOwnership: 'platformReadableTargets',
  actionResolution: 'jsPressTimeResolver',
};

const createUnavailablePlatformOwnerStatus = (
  hostKey: string
): SearchChromeScalarSurfacePlatformOwnerStatus => ({
  hostKey,
  available: false,
  active: false,
  measurementOwnership: 'nativeMeasurementRegistry',
  scalarOwnership: 'platformReadableTargets',
  actionResolution: 'jsPressTimeResolver',
  ownsMeasuredFrames: false,
  ownsScalarValues: false,
  composesNativeRegions: false,
  resolvesActionsAtPressTime: false,
  missingHooks: [
    'nativeLayoutObservation',
    'platformReadableScalarTargets',
    'nativeRegionCompositionLoop',
    'pressTimeActionResolver',
  ],
});

const createUnavailablePlatformScalarSlotStatus = (
  hostKey: string
): SearchChromeScalarSurfacePlatformScalarSlotStatus => ({
  hostKey,
  available: false,
  active: false,
  scalarSlotContractAvailable: false,
  registeredControlIds: [],
  ownsScalarValues: false,
  missingScalarOwner: 'platformReadableScalarSource',
});

export const searchChromeScalarSurfaceRegistry = {
  searchChromeScalarSurfaceAvailable: nativeRegistry?.searchChromeScalarSurfaceAvailable === true,
  searchChromeScalarSurfaceActive: nativeRegistry?.searchChromeScalarSurfaceActive === true,
  searchChromeScalarSurfacePlatformOwnerAvailable:
    nativeRegistry?.searchChromeScalarSurfacePlatformOwnerAvailable === true,
  searchChromeScalarSurfacePlatformOwnerActive:
    nativeRegistry?.searchChromeScalarSurfacePlatformOwnerActive === true,
  registerSurfaceHost(payload: SearchChromeScalarSurfaceHostRegistration): boolean {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return false;
    }
    void nativeRegistry.registerSurfaceHost(payload);
    return true;
  },
  registerPlatformOwner(
    payload: SearchChromeScalarSurfacePlatformOwnerRegistration = DEFAULT_PLATFORM_OWNER_REGISTRATION
  ): boolean {
    if (nativeRegistry?.searchChromeScalarSurfacePlatformOwnerAvailable !== true) {
      return false;
    }
    void nativeRegistry.registerPlatformOwner(payload);
    return true;
  },
  readPlatformOwnerStatus(
    hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
  ): Promise<SearchChromeScalarSurfacePlatformOwnerStatus> {
    if (nativeRegistry?.searchChromeScalarSurfacePlatformOwnerAvailable !== true) {
      return Promise.resolve(createUnavailablePlatformOwnerStatus(hostKey));
    }
    return nativeRegistry.readPlatformOwnerStatus(hostKey);
  },
  registerPlatformScalarSlot(
    payload: SearchChromeScalarSurfacePlatformScalarSlotRegistration
  ): boolean {
    if (
      nativeRegistry?.searchChromeScalarSurfacePlatformOwnerAvailable !== true ||
      nativeRegistry.registerPlatformScalarSlot == null
    ) {
      return false;
    }
    void nativeRegistry.registerPlatformScalarSlot(payload);
    return true;
  },
  readPlatformScalarSlotStatus(
    hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
  ): Promise<SearchChromeScalarSurfacePlatformScalarSlotStatus> {
    if (
      nativeRegistry?.searchChromeScalarSurfacePlatformOwnerAvailable !== true ||
      nativeRegistry.readPlatformScalarSlotStatus == null
    ) {
      return Promise.resolve(createUnavailablePlatformScalarSlotStatus(hostKey));
    }
    return nativeRegistry.readPlatformScalarSlotStatus(hostKey);
  },
  registerMeasuredControl(payload: SearchChromeScalarSurfaceMeasuredControlRegistration): boolean {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return false;
    }
    void nativeRegistry.registerMeasuredControl(payload);
    return true;
  },
  measureRegisteredControls(
    hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
  ): Promise<SearchChromeScalarSurfaceMeasuredFrameSnapshot | null> {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return Promise.resolve(null);
    }
    return nativeRegistry.measureRegisteredControls(hostKey);
  },
  syncScalarSnapshot(payload: SearchChromeScalarSurfaceSnapshot): boolean {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return false;
    }
    void nativeRegistry.syncScalarSnapshot(payload);
    return true;
  },
  clearMeasuredControl(hostKey: string, controlId: SearchChromeScalarSurfaceControlId): boolean {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return false;
    }
    void nativeRegistry.clearMeasuredControl({ hostKey, controlId });
    return true;
  },
  clearSurfaceHost(hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY): boolean {
    if (nativeRegistry?.searchChromeScalarSurfaceAvailable !== true) {
      return false;
    }
    void nativeRegistry.clearSurfaceHost(hostKey);
    return true;
  },
};
