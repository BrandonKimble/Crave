import type { RefObject } from 'react';
import type { View } from 'react-native';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';

type SearchResultRowHeaderChromeBoundarySurfaceMode =
  | 'none'
  | 'initial_loading'
  | 'interaction_loading'
  | 'results'
  | 'empty';

type SearchResultRowHeaderChromeBoundaryMeasurement = {
  measuredAtMs: number;
  y: number;
  height: number;
};

type SearchResultRowHeaderChromeBoundaryRowContext = {
  activeRowCount: number;
  activeTab: 'dishes' | 'restaurants';
  requestKey: string | null;
  source: string;
  surfaceMode: SearchResultRowHeaderChromeBoundarySurfaceMode;
  transactionId: string | null;
};

type SearchResultRowHeaderChromeBoundaryRowSample = {
  context: SearchResultRowHeaderChromeBoundaryRowContext;
  measuredAtMs: number;
  firstRowTopY: number;
};

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const scheduleBoundaryMeasurement = (measure: () => void): void => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      measure();
    });
    return;
  }
  setTimeout(measure, 0);
};

const scheduleSettledBoundaryMeasurement = (measure: () => void): void => {
  scheduleBoundaryMeasurement(measure);
  setTimeout(() => {
    scheduleBoundaryMeasurement(measure);
  }, 260);
};

const roundLayoutValue = (value: number): number => Math.round(value * 1000) / 1000;

const isFinitePositiveLayout = (value: number): boolean => Number.isFinite(value) && value > 0;

let headerChromeMeasurement: SearchResultRowHeaderChromeBoundaryMeasurement | null = null;
let bodyViewportMeasurement: SearchResultRowHeaderChromeBoundaryMeasurement | null = null;
let firstRowSample: SearchResultRowHeaderChromeBoundaryRowSample | null = null;
let lastEmittedBoundaryKey: string | null = null;
let headerChromeRef: RefObject<View | null> | null = null;
let bodyViewportRef: RefObject<View | null> | null = null;

const measureHeaderChromeBoundaryNow = (): void => {
  headerChromeRef?.current?.measureInWindow((_x, y, _width, height) => {
    if (!Number.isFinite(y) || !isFinitePositiveLayout(height)) {
      return;
    }
    headerChromeMeasurement = {
      measuredAtMs: nowMs(),
      y,
      height,
    };
    tryEmitSearchResultRowHeaderChromeBoundaryContract();
  });
};

export const measureSearchResultsBodyViewportBoundaryNow = (): void => {
  bodyViewportRef?.current?.measureInWindow((_x, y, _width, height) => {
    if (!Number.isFinite(y) || !isFinitePositiveLayout(height)) {
      return;
    }
    bodyViewportMeasurement = {
      measuredAtMs: nowMs(),
      y,
      height,
    };
    tryEmitSearchResultRowHeaderChromeBoundaryContract();
  });
};

const tryEmitSearchResultRowHeaderChromeBoundaryContract = (): void => {
  if (headerChromeMeasurement == null || firstRowSample == null) {
    return;
  }
  if (Math.abs(headerChromeMeasurement.measuredAtMs - firstRowSample.measuredAtMs) > 160) {
    return;
  }
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }

  const { context, firstRowTopY } = firstRowSample;
  const transactionId = context.transactionId ?? context.requestKey;
  if (transactionId == null || context.activeRowCount <= 0 || context.activeTab !== 'restaurants') {
    return;
  }

  const headerChromeBottomY = roundLayoutValue(
    headerChromeMeasurement.y + headerChromeMeasurement.height
  );
  const hasFreshBodyViewport =
    bodyViewportMeasurement != null &&
    Math.abs(bodyViewportMeasurement.measuredAtMs - firstRowSample.measuredAtMs) <= 180;
  const bodyViewportTopY = hasFreshBodyViewport
    ? roundLayoutValue(bodyViewportMeasurement!.y)
    : null;
  const roundedMeasuredFirstRowTopY = roundLayoutValue(firstRowTopY);
  const roundedFirstRowTopY = roundLayoutValue(
    Math.max(firstRowTopY, bodyViewportTopY ?? Number.NEGATIVE_INFINITY)
  );
  const rowHeaderOverlapPx = roundLayoutValue(
    Math.max(0, headerChromeBottomY - roundedFirstRowTopY)
  );
  const overlapsHeaderChrome = rowHeaderOverlapPx > 0;
  const boundaryKey = [
    transactionId,
    context.activeTab,
    context.surfaceMode,
    roundedFirstRowTopY,
    headerChromeBottomY,
    context.activeRowCount,
  ].join('|');
  if (lastEmittedBoundaryKey === boundaryKey) {
    return;
  }
  lastEmittedBoundaryKey = boundaryKey;

  logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
    event: 'result_row_header_chrome_boundary_contract',
    firstRowTopY: roundedFirstRowTopY,
    measuredFirstRowTopY: roundedMeasuredFirstRowTopY,
    bodyViewportTopY,
    bodyViewportHeight: hasFreshBodyViewport
      ? roundLayoutValue(bodyViewportMeasurement!.height)
      : null,
    headerChromeBottomY,
    rowHeaderOverlapPx,
    overlapsHeaderChrome,
    activeTab: context.activeTab,
    surfaceMode: context.surfaceMode,
    transactionId,
    requestKey: context.requestKey,
    transactionIdSource: context.transactionId == null ? 'requestKey' : 'resultsIdentityKey',
    activeRowCount: context.activeRowCount,
    source: context.source,
  });
};

export const measureSearchResultsHeaderChromeBoundary = (
  headerRef: RefObject<View | null>
): void => {
  headerChromeRef = headerRef;
  scheduleBoundaryMeasurement(() => {
    measureHeaderChromeBoundaryNow();
  });
};

export const measureSearchResultsBodyViewportBoundary = (
  viewportRef: RefObject<View | null>
): void => {
  bodyViewportRef = viewportRef;
  scheduleBoundaryMeasurement(() => {
    measureSearchResultsBodyViewportBoundaryNow();
  });
};

export const measureSearchResultFirstRowHeaderChromeBoundary = ({
  activeRowCount,
  activeTab,
  requestKey,
  rowRef,
  source,
  surfaceMode,
  transactionId,
}: SearchResultRowHeaderChromeBoundaryRowContext & {
  rowRef: RefObject<View | null>;
}): void => {
  const measureRowAndHeader = () => {
    measureHeaderChromeBoundaryNow();
    measureSearchResultsBodyViewportBoundaryNow();
    rowRef.current?.measureInWindow((_x, y, _width, height) => {
      if (!Number.isFinite(y) || !isFinitePositiveLayout(height)) {
        return;
      }
      firstRowSample = {
        context: {
          activeRowCount,
          activeTab,
          requestKey,
          source,
          surfaceMode,
          transactionId,
        },
        measuredAtMs: nowMs(),
        firstRowTopY: y,
      };
      tryEmitSearchResultRowHeaderChromeBoundaryContract();
    });
  };
  scheduleSettledBoundaryMeasurement(measureRowAndHeader);
};
