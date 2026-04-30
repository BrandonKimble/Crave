import {
  SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  searchChromeScalarSurfaceRegistry,
  type SearchChromeScalarSurfaceActionId,
  type SearchChromeScalarSurfaceControlId,
  type SearchChromeScalarSurfaceRegion,
  type SearchChromeScalarSurfaceSnapshot,
} from './search-chrome-scalar-surface';
import type { SearchChromeScalarSurfaceMeasurementSnapshot } from './search-chrome-scalar-surface-measurement-runtime';

export type SearchChromeScalarSurfaceControlScalar = {
  controlId: SearchChromeScalarSurfaceControlId;
  actionId?: SearchChromeScalarSurfaceActionId;
  visible: boolean;
  enabled: boolean;
  passThroughWhenDisabled: boolean;
};

export type SearchChromeScalarSurfaceScalarSnapshot = {
  hostKey: string;
  revision: number;
  controls: readonly SearchChromeScalarSurfaceControlScalar[];
};

export type SearchChromeScalarSurfaceTargetRuntime = {
  readonly hostKey: string;
  getScalarSnapshot: () => SearchChromeScalarSurfaceScalarSnapshot;
  updateControlScalar: (
    controlScalar: SearchChromeScalarSurfaceControlScalar
  ) => SearchChromeScalarSurfaceScalarSnapshot;
  buildNativeSnapshot: (
    measurementSnapshot: SearchChromeScalarSurfaceMeasurementSnapshot
  ) => SearchChromeScalarSurfaceSnapshot;
  syncNativeSnapshot: (
    measurementSnapshot: SearchChromeScalarSurfaceMeasurementSnapshot
  ) => boolean;
  clear: () => void;
};

const CONTROL_IDS: readonly SearchChromeScalarSurfaceControlId[] = [
  'shortcut_restaurants',
  'shortcut_dishes',
  'search_this_area',
];

const createHiddenScalar = (
  controlId: SearchChromeScalarSurfaceControlId
): SearchChromeScalarSurfaceControlScalar => ({
  controlId,
  actionId: controlId,
  visible: false,
  enabled: false,
  passThroughWhenDisabled: true,
});

const createInitialControls = (): SearchChromeScalarSurfaceControlScalar[] =>
  CONTROL_IDS.map(createHiddenScalar);

const areControlScalarsEqual = (
  left: SearchChromeScalarSurfaceControlScalar,
  right: SearchChromeScalarSurfaceControlScalar
): boolean =>
  left.controlId === right.controlId &&
  (left.actionId ?? left.controlId) === (right.actionId ?? right.controlId) &&
  left.visible === right.visible &&
  left.enabled === right.enabled &&
  left.passThroughWhenDisabled === right.passThroughWhenDisabled;

const buildRegion = ({
  controlScalar,
  measurementSnapshot,
}: {
  controlScalar: SearchChromeScalarSurfaceControlScalar;
  measurementSnapshot: SearchChromeScalarSurfaceMeasurementSnapshot;
}): SearchChromeScalarSurfaceRegion | null => {
  const frame = measurementSnapshot.framesByControlId[controlScalar.controlId];
  if (frame == null) {
    return null;
  }

  return {
    controlId: controlScalar.controlId,
    actionId: controlScalar.actionId ?? controlScalar.controlId,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    visible: controlScalar.visible,
    enabled: controlScalar.enabled,
    passThroughWhenDisabled: controlScalar.passThroughWhenDisabled,
  };
};

export const createSearchChromeScalarSurfaceTargetRuntime = (
  hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
): SearchChromeScalarSurfaceTargetRuntime => {
  let controls = createInitialControls();
  let revision = 0;

  const getScalarSnapshot = (): SearchChromeScalarSurfaceScalarSnapshot => ({
    hostKey,
    revision,
    controls,
  });

  const buildNativeSnapshot = (
    measurementSnapshot: SearchChromeScalarSurfaceMeasurementSnapshot
  ): SearchChromeScalarSurfaceSnapshot => ({
    hostKey,
    revision,
    regions: controls
      .map((controlScalar) =>
        buildRegion({
          controlScalar,
          measurementSnapshot,
        })
      )
      .filter((region): region is SearchChromeScalarSurfaceRegion => region != null),
  });

  return {
    hostKey,
    getScalarSnapshot,
    updateControlScalar: (controlScalar) => {
      const nextControls = controls.map((currentScalar) =>
        currentScalar.controlId === controlScalar.controlId ? controlScalar : currentScalar
      );
      const existingScalar = controls.find(
        (currentScalar) => currentScalar.controlId === controlScalar.controlId
      );
      if (existingScalar != null && areControlScalarsEqual(existingScalar, controlScalar)) {
        return getScalarSnapshot();
      }

      controls = nextControls;
      revision += 1;
      return getScalarSnapshot();
    },
    buildNativeSnapshot,
    syncNativeSnapshot: (measurementSnapshot) =>
      searchChromeScalarSurfaceRegistry.syncScalarSnapshot(
        buildNativeSnapshot(measurementSnapshot)
      ),
    clear: () => {
      controls = createInitialControls();
      revision += 1;
    },
  };
};
