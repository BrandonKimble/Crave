import {
  SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  type SearchChromeScalarSurfaceControlId,
  type SearchChromeScalarSurfaceSnapshot,
} from './search-chrome-scalar-surface';
import {
  createSearchChromeScalarSurfaceMeasurementRuntime,
  type SearchChromeScalarSurfaceMeasurementRuntime,
  type SearchChromeScalarSurfaceMeasurementSnapshot,
} from './search-chrome-scalar-surface-measurement-runtime';
import {
  createSearchChromeScalarSurfacePrimitiveSourceRuntime,
  type SearchChromeScalarSurfacePrimitiveSourceRuntime,
} from './search-chrome-scalar-surface-primitive-source-runtime';
import {
  createSearchChromeScalarSurfacePresentationRuntime,
  type SearchChromeScalarSurfacePresentationRuntime,
} from './search-chrome-scalar-surface-presentation-runtime';
import type { SearchChromeScalarSurfacePrimitiveSnapshot } from './search-chrome-scalar-surface-producer-runtime';
import {
  createSearchChromeScalarSurfaceProducerRuntime,
  type SearchChromeScalarSurfaceProducerRuntime,
} from './search-chrome-scalar-surface-producer-runtime';
import {
  createSearchChromeScalarSurfaceTargetRuntime,
  type SearchChromeScalarSurfaceScalarSnapshot,
  type SearchChromeScalarSurfaceTargetRuntime,
} from './search-chrome-scalar-surface-target-runtime';

export type SearchChromeScalarSurfaceRuntimeSnapshot = {
  hostKey: string;
  active: false;
  primitiveSnapshot: SearchChromeScalarSurfacePrimitiveSnapshot;
  measurementSnapshot: SearchChromeScalarSurfaceMeasurementSnapshot;
  scalarSnapshot: SearchChromeScalarSurfaceScalarSnapshot;
  nativeSnapshot: SearchChromeScalarSurfaceSnapshot;
};

export type SearchChromeScalarSurfaceDiagnosticsReadOptions = {
  measureNativeFrames?: boolean;
};

export type SearchChromeScalarSurfaceDiagnosticsReport = {
  snapshot: SearchChromeScalarSurfaceRuntimeSnapshot;
  requiredControlIds: readonly SearchChromeScalarSurfaceControlId[];
  measuredControlIds: readonly SearchChromeScalarSurfaceControlId[];
  scalarControlIds: readonly SearchChromeScalarSurfaceControlId[];
  nativeRegionControlIds: readonly SearchChromeScalarSurfaceControlId[];
  missingMeasuredControlIds: readonly SearchChromeScalarSurfaceControlId[];
  missingScalarControlIds: readonly SearchChromeScalarSurfaceControlId[];
  missingNativeRegionControlIds: readonly SearchChromeScalarSurfaceControlId[];
  readyForActivation: boolean;
};

export type SearchChromeScalarSurfaceRuntime = {
  readonly hostKey: string;
  readonly active: false;
  readonly measurementRuntime: SearchChromeScalarSurfaceMeasurementRuntime;
  readonly targetRuntime: SearchChromeScalarSurfaceTargetRuntime;
  readonly producerRuntime: SearchChromeScalarSurfaceProducerRuntime;
  readonly primitiveSourceRuntime: SearchChromeScalarSurfacePrimitiveSourceRuntime;
  readonly presentationRuntime: SearchChromeScalarSurfacePresentationRuntime;
  getSnapshot: () => SearchChromeScalarSurfaceRuntimeSnapshot;
  readDiagnostics: (
    options?: SearchChromeScalarSurfaceDiagnosticsReadOptions
  ) => Promise<SearchChromeScalarSurfaceDiagnosticsReport>;
  clear: () => void;
};

const REQUIRED_CONTROL_IDS: readonly SearchChromeScalarSurfaceControlId[] = [
  'shortcut_restaurants',
  'shortcut_dishes',
  'search_this_area',
];

const collectMissingControlIds = (
  requiredControlIds: readonly SearchChromeScalarSurfaceControlId[],
  actualControlIds: readonly SearchChromeScalarSurfaceControlId[]
): readonly SearchChromeScalarSurfaceControlId[] =>
  requiredControlIds.filter((controlId) => !actualControlIds.includes(controlId));

export const createSearchChromeScalarSurfaceRuntime = ({
  hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  diagnosticsEnabled = false,
}: {
  hostKey?: string;
  diagnosticsEnabled?: boolean;
} = {}): SearchChromeScalarSurfaceRuntime => {
  const measurementRuntime = createSearchChromeScalarSurfaceMeasurementRuntime(hostKey);
  const targetRuntime = createSearchChromeScalarSurfaceTargetRuntime(hostKey);
  const producerRuntime = createSearchChromeScalarSurfaceProducerRuntime(targetRuntime);
  const primitiveSourceRuntime = createSearchChromeScalarSurfacePrimitiveSourceRuntime();
  const presentationRuntime =
    createSearchChromeScalarSurfacePresentationRuntime(primitiveSourceRuntime);

  const getSnapshot = (): SearchChromeScalarSurfaceRuntimeSnapshot => {
    primitiveSourceRuntime.applyToProducer(producerRuntime);
    const measurementSnapshot = measurementRuntime.getSnapshot();
    return {
      hostKey,
      active: false,
      primitiveSnapshot: primitiveSourceRuntime.getSnapshot(),
      measurementSnapshot,
      scalarSnapshot: targetRuntime.getScalarSnapshot(),
      nativeSnapshot: targetRuntime.buildNativeSnapshot(measurementSnapshot),
    };
  };

  const buildDiagnosticsReport = (
    snapshot: SearchChromeScalarSurfaceRuntimeSnapshot
  ): SearchChromeScalarSurfaceDiagnosticsReport => {
    const measuredControlIds = snapshot.measurementSnapshot.frames.map((frame) => frame.controlId);
    const scalarControlIds = snapshot.scalarSnapshot.controls.map(
      (controlScalar) => controlScalar.controlId
    );
    const nativeRegionControlIds = snapshot.nativeSnapshot.regions.map(
      (region) => region.controlId
    );
    const missingMeasuredControlIds = collectMissingControlIds(
      REQUIRED_CONTROL_IDS,
      measuredControlIds
    );
    const missingScalarControlIds = collectMissingControlIds(
      REQUIRED_CONTROL_IDS,
      scalarControlIds
    );
    const missingNativeRegionControlIds = collectMissingControlIds(
      REQUIRED_CONTROL_IDS,
      nativeRegionControlIds
    );

    return {
      snapshot,
      requiredControlIds: REQUIRED_CONTROL_IDS,
      measuredControlIds,
      scalarControlIds,
      nativeRegionControlIds,
      missingMeasuredControlIds,
      missingScalarControlIds,
      missingNativeRegionControlIds,
      readyForActivation:
        missingMeasuredControlIds.length === 0 &&
        missingScalarControlIds.length === 0 &&
        missingNativeRegionControlIds.length === 0,
    };
  };

  return {
    hostKey,
    active: false,
    measurementRuntime,
    targetRuntime,
    producerRuntime,
    primitiveSourceRuntime,
    presentationRuntime,
    getSnapshot,
    readDiagnostics: async ({ measureNativeFrames = false } = {}) => {
      if (diagnosticsEnabled && measureNativeFrames) {
        await measurementRuntime.measureNow();
      }
      return buildDiagnosticsReport(getSnapshot());
    },
    clear: () => {
      measurementRuntime.clear();
      targetRuntime.clear();
      primitiveSourceRuntime.clear();
    },
  };
};
