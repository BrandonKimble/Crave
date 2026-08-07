import { SEARCH_SUBMIT_NATURAL_SCENARIO } from '../../perf/perf-scenario-attribution';
import type { RuntimePerfScenarioConfig } from '../../perf/perf-scenario-runtime-store';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';
import type { AppRouteSheetHostRuntime } from './app-route-sheet-host-runtime-contract';
import {
  areAppRouteSheetHostRuntimesFieldEqual,
  markAppRouteSheetHostRuntimeDiffs,
} from './app-route-sheet-host-runtime-contract';

/**
 * F6600 — THE DIFF MARKER AND THE COMPARATOR ARE ONE LIST.
 *
 * This spec deliberately holds NO list of field names. A spec that restated the
 * eight compared keys would be a third hand-written copy of the thing whose
 * duplication is the defect — F975(e)'s own principle, which the diff markers
 * violated after the comparator was fixed. Instead it discovers the keys from a
 * runtime VALUE and asserts the two mechanisms agree on every one of them: any
 * field the comparator distinguishes, the marker reports, and vice versa.
 *
 * That is what makes divergence unwritable rather than merely absent today.
 *
 * PROVING MUTATIONS, both run and confirmed:
 *  - re-diverge the marker (`if (key === 'routeSheetMotionRuntimeAuthority')
 *    continue;` inside its loop) — RED here, "Expected: true, Received: false".
 *    That is the exact defect this replaces, and it is now unwritable silently.
 *  - drop a key from APP_ROUTE_SHEET_HOST_RUNTIME_COMPARED_KEYS — RED at BUILD
 *    time (TS2322, `Type 'true' is not assignable to type 'never'`), from the
 *    classification assert in the contract.
 *
 * WHAT THIS SPEC CANNOT CATCH, stated rather than implied: moving a key from
 * compared to EXCLUDED keeps it green, because the marker and the comparator
 * then agree about ignoring it — which is the point of their being one list.
 * Whether a field DESERVES exclusion is a judgement, and the contract records
 * the one exclusion's reason in prose next to it. The build error above is what
 * forces that judgement to be made rather than skipped.
 */

// Opaque sentinels: this spec never dereferences a runtime member, so the real
// authority shapes are irrelevant to what it proves (identity, per field).
const makeRuntime = (): AppRouteSheetHostRuntime =>
  ({
    searchInteractionRef: { tag: 'searchInteractionRef' },
    routeSheetSurfaceAuthority: { tag: 'routeSheetSurfaceAuthority' },
    routeSheetSurfaceBodyAuthority: { tag: 'routeSheetSurfaceBodyAuthority' },
    routeSheetMotionRuntimeAuthority: { tag: 'routeSheetMotionRuntimeAuthority' },
    routeSheetRuntimeConfigAuthority: { tag: 'routeSheetRuntimeConfigAuthority' },
    sceneStackSurfaceAuthority: { tag: 'sceneStackSurfaceAuthority' },
    routeSceneDisplayTargetRegistry: { tag: 'routeSceneDisplayTargetRegistry' },
    routeHostVisualRuntimeAuthority: { tag: 'routeHostVisualRuntimeAuthority' },
    onContentSettleComplete: () => {},
  }) as unknown as AppRouteSheetHostRuntime;

const scenarioConfig: RuntimePerfScenarioConfig = {
  requestId: 'req',
  scenario: SEARCH_SUBMIT_NATURAL_SCENARIO,
  runId: 'run',
  durationMs: 1000,
  jsFrameSampler: { enabled: false } as RuntimePerfScenarioConfig['jsFrameSampler'],
  jsTaskLatencySampler: { enabled: false } as RuntimePerfScenarioConfig['jsTaskLatencySampler'],
  uiFrameSampler: { enabled: false } as RuntimePerfScenarioConfig['uiFrameSampler'],
  signature: 'sig',
};

const markedFields = (
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): string[] => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    markAppRouteSheetHostRuntimeDiffs('spec_owner', left, right);
    return spy.mock.calls
      .map(([line]) => String(line))
      .flatMap((line) => {
        const match = /"path":"field:routeSheetHostRuntime\.([^"]+)"/.exec(line);
        return match ? [match[1]] : [];
      });
  } finally {
    spy.mockRestore();
  }
};

const runtimeFieldNames = Object.keys(makeRuntime()) as Array<keyof AppRouteSheetHostRuntime>;

describe('app route sheet host runtime — diff marker and comparator', () => {
  beforeEach(() => {
    usePerfScenarioRuntimeStore.getState().setActiveConfig(scenarioConfig);
  });
  afterEach(() => {
    usePerfScenarioRuntimeStore.getState().clearActiveConfig();
  });

  it('the runtime has fields to classify at all (an empty sweep proves nothing)', () => {
    expect(runtimeFieldNames.length).toBeGreaterThan(1);
  });

  it.each(runtimeFieldNames)('marks %s exactly when the comparator distinguishes it', (field) => {
    const left = makeRuntime();
    const right = { ...left, [field]: { tag: 'changed' } } as AppRouteSheetHostRuntime;

    const comparatorSeesIt = !areAppRouteSheetHostRuntimesFieldEqual(left, right);
    const markerSeesIt = markedFields(left, right).includes(field);

    expect(markerSeesIt).toBe(comparatorSeesIt);
  });

  it('marks the wrapper identity, which no field can report', () => {
    const left = makeRuntime();
    const right = { ...left };
    expect(areAppRouteSheetHostRuntimesFieldEqual(left, right)).toBe(true);

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      markAppRouteSheetHostRuntimeDiffs('spec_owner', left, right);
      const lines = spy.mock.calls.map(([line]) => String(line));
      expect(lines.some((line) => line.includes('"path":"field:routeSheetHostRuntimeRef"'))).toBe(
        true
      );
    } finally {
      spy.mockRestore();
    }
  });
});
