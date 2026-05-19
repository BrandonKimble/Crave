import React from 'react';
import { Linking } from 'react-native';

import { startJsFrameSampler } from './js-frame-sampler';
import { startJsTaskLatencySampler } from './js-task-latency-sampler';
import { parsePerfScenarioDeepLinkEvent } from './perf-scenario-deep-link';
import {
  flushPerfScenarioAttributionEventBuffer,
  flushPerfScenarioStackAttributionAggregates,
} from './perf-scenario-attribution';
import { readPerfScenarioCommandRegistry } from './perf-scenario-command-registry';
import {
  type RuntimePerfScenarioConfig,
  usePerfScenarioRuntimeStore,
} from './perf-scenario-runtime-store';
import {
  startPerfScenarioHermesSamplingProfiler,
  stopPerfScenarioHermesSamplingProfiler,
} from './perf-scenario-hermes-sampling-profiler';
import { searchMapRenderController } from '../screens/Search/runtime/map/search-map-render-controller';
import { startUiFrameSampler } from './ui-frame-sampler';
import { resolveMarket } from '../services/markets';
import type { MapBounds } from '../types';

const SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO = 'search_submit_dismiss_repeat';
const SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO = 'search_submit_dismiss_interrupt';
const flushedNativeMapApplyRunIds = new Set<string>();

const resolvePerfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const logScenarioEvent = (payload: Record<string, unknown>) => {
  const eventPayload = {
    nowMs: Number(resolvePerfNow().toFixed(1)),
    ...payload,
  };
  // eslint-disable-next-line no-console
  console.log(`[SearchPerf][Scenario] ${JSON.stringify(eventPayload)}`);
};

const withScenarioMetadata = (
  config: RuntimePerfScenarioConfig,
  payload: Record<string, unknown>
): Record<string, unknown> => ({
  ...payload,
  emittedAtMs: Number(resolvePerfNow().toFixed(1)),
  scenarioName: config.scenario,
  scenarioRunId: config.runId,
  requestId: config.requestId,
  signature: config.signature,
});

const roundScenarioPerfMs = (value: number): number => Number(value.toFixed(1));

const clampLatitude = (value: number): number => Math.max(-89.9, Math.min(89.9, value));

const buildScenarioCommandBounds = ({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number | null;
}): MapBounds => {
  const resolvedZoom = zoom ?? 11.5;
  const latSpan =
    resolvedZoom >= 13 ? 0.045 : resolvedZoom >= 12 ? 0.08 : resolvedZoom >= 11 ? 0.16 : 0.3;
  const cosine = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  const lngSpan = latSpan / cosine;
  return {
    northEast: {
      lat: clampLatitude(lat + latSpan / 2),
      lng: lng + lngSpan / 2,
    },
    southWest: {
      lat: clampLatitude(lat - latSpan / 2),
      lng: lng - lngSpan / 2,
    },
  };
};

const isSubmitDismissMeasuredLoopScenario = (scenario: string): boolean =>
  scenario === SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO ||
  scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO}_`) ||
  scenario === SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO ||
  scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO}_`);

const shouldCollectNativeMapApplySummary = (config: RuntimePerfScenarioConfig): boolean =>
  isSubmitDismissMeasuredLoopScenario(config.scenario) &&
  searchMapRenderController.platform === 'ios' &&
  searchMapRenderController.isAvailable();

const shouldUseQuietMeasuredLoop = (config: RuntimePerfScenarioConfig): boolean =>
  isSubmitDismissMeasuredLoopScenario(config.scenario);

type BufferedSamplerEvent = {
  channel: 'JsFrameSampler' | 'JsTaskLatencySampler' | 'UiFrameSampler';
  payload: Record<string, unknown>;
};

type PerfScenarioCommandEvent = Extract<
  NonNullable<ReturnType<typeof parsePerfScenarioDeepLinkEvent>>,
  { type: 'command' }
>;

const resetNativeMapApplySummary = async (
  config: RuntimePerfScenarioConfig,
  reason: string
): Promise<void> => {
  if (!shouldCollectNativeMapApplySummary(config)) {
    return;
  }
  flushedNativeMapApplyRunIds.delete(config.runId);
  try {
    await searchMapRenderController.resetNativeApplyAttribution({
      reason,
      runId: config.runId,
    });
  } catch (error) {
    logScenarioEvent(
      withScenarioMetadata(config, {
        event: 'native_map_apply_summary_reset_failed',
        reason,
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

const flushNativeMapApplySummary = async (
  config: RuntimePerfScenarioConfig,
  reason: string
): Promise<void> => {
  if (
    !shouldCollectNativeMapApplySummary(config) ||
    flushedNativeMapApplyRunIds.has(config.runId)
  ) {
    return;
  }
  flushedNativeMapApplyRunIds.add(config.runId);
  try {
    const summary = await searchMapRenderController.flushNativeApplyAttribution({
      reason,
      reset: true,
    });
    if (!summary) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[SearchPerf][NativeMapApplySummary] ${JSON.stringify(
        withScenarioMetadata(config, {
          event: 'native_map_apply_summary',
          reason,
          summary,
        })
      )}`
    );
  } catch (error) {
    logScenarioEvent(
      withScenarioMetadata(config, {
        event: 'native_map_apply_summary_flush_failed',
        reason,
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

export const PerfScenarioCoordinator: React.FC = () => {
  const activeConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const setActiveConfig = usePerfScenarioRuntimeStore((state) => state.setActiveConfig);
  const setMeasuredRepeatLoopActive = usePerfScenarioRuntimeStore(
    (state) => state.setMeasuredRepeatLoopActive
  );
  const clearActiveConfig = usePerfScenarioRuntimeStore((state) => state.clearActiveConfig);
  const activeConfigRef = React.useRef(activeConfig);
  activeConfigRef.current = activeConfig;
  const measuredRepeatLoopActiveRef = React.useRef(false);
  const bufferedSamplerEventsRef = React.useRef<BufferedSamplerEvent[]>([]);

  const flushBufferedSamplerEvents = React.useCallback(
    (config: RuntimePerfScenarioConfig, reason: string) => {
      const bufferedEvents = bufferedSamplerEventsRef.current;
      if (bufferedEvents.length === 0) {
        return;
      }
      bufferedSamplerEventsRef.current = [];
      logScenarioEvent(
        withScenarioMetadata(config, {
          event: 'quiet_measured_loop_sampler_flush',
          reason,
          bufferedEventCount: bufferedEvents.length,
        })
      );
      bufferedEvents.forEach((event) => {
        // eslint-disable-next-line no-console
        console.log(
          `[SearchPerf][${event.channel}] ${JSON.stringify(
            withScenarioMetadata(config, {
              ...event.payload,
              quietBuffered: true,
              flushReason: reason,
            })
          )}`
        );
      });
    },
    []
  );

  const emitOrBufferJsSamplerEvent = React.useCallback(
    (
      config: RuntimePerfScenarioConfig,
      channel: BufferedSamplerEvent['channel'],
      payload: Record<string, unknown>
    ) => {
      const callbackReceivedAtMs = resolvePerfNow();
      const payloadNowMs = Number(payload.nowMs);
      const shouldMeasureCallbackDelivery = channel !== 'UiFrameSampler';
      const payloadWithDeliveryTiming =
        shouldMeasureCallbackDelivery && Number.isFinite(payloadNowMs)
          ? {
              ...payload,
              samplerCallbackDeliveryDelayMs: roundScenarioPerfMs(
                Math.max(0, callbackReceivedAtMs - payloadNowMs)
              ),
            }
          : payload;
      if (shouldUseQuietMeasuredLoop(config) && measuredRepeatLoopActiveRef.current) {
        bufferedSamplerEventsRef.current.push({ channel, payload: payloadWithDeliveryTiming });
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf][${channel}] ${JSON.stringify(
          withScenarioMetadata(config, payloadWithDeliveryTiming)
        )}`
      );
    },
    []
  );

  const executeCommandEvent = React.useCallback((event: PerfScenarioCommandEvent) => {
    const currentConfig = activeConfigRef.current;
    if (!currentConfig) {
      logScenarioEvent({
        event: 'perf_scenario_command_ignored',
        action: event.action,
        reason: 'no_active_scenario',
        scenarioRunId: event.scenarioRunId,
      });
      return;
    }
    if (event.scenarioRunId && currentConfig?.runId !== event.scenarioRunId) {
      return;
    }

    const logPayload = (payload: Record<string, unknown>) => {
      logScenarioEvent(withScenarioMetadata(currentConfig, payload));
    };

    logPayload({
      event: 'perf_scenario_command_received',
      action: event.action,
      delayMs: event.delayMs,
      lat: event.lat,
      lng: event.lng,
      resubmitDelayMs: event.resubmitDelayMs,
      label: event.label,
      zoom: event.zoom,
    });

    const registry = readPerfScenarioCommandRegistry();

    if (event.action === 'set_map_camera') {
      if (!registry.setMapCamera || event.lat == null || event.lng == null || event.zoom == null) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          reason: registry.setMapCamera
            ? 'missing_camera_parameters'
            : 'camera_command_not_registered',
          hasSetMapCamera: registry.setMapCamera != null,
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
        });
        return;
      }
      const accepted = registry.setMapCamera({
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      logPayload({
        event: accepted ? 'perf_scenario_command_executed' : 'perf_scenario_command_failed',
        action: event.action,
        step: 'set_map_camera',
        reason: accepted ? null : 'camera_commit_rejected',
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      return;
    }

    if (event.action === 'move_map_for_search_this_area') {
      if (
        !registry.moveMapForSearchThisArea ||
        event.lat == null ||
        event.lng == null ||
        event.zoom == null
      ) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          reason: registry.moveMapForSearchThisArea
            ? 'missing_camera_parameters'
            : 'search_this_area_move_command_not_registered',
          hasMoveMapForSearchThisArea: registry.moveMapForSearchThisArea != null,
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
        });
        return;
      }
      const accepted = registry.moveMapForSearchThisArea({
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      logPayload({
        event: accepted ? 'perf_scenario_command_executed' : 'perf_scenario_command_failed',
        action: event.action,
        step: 'move_map_for_search_this_area',
        reason: accepted ? null : 'camera_commit_rejected_or_move_not_admitted',
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      return;
    }

    if (event.action === 'set_map_camera_and_resolve_market') {
      if (!registry.setMapCamera || event.lat == null || event.lng == null || event.zoom == null) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          reason: registry.setMapCamera
            ? 'missing_camera_parameters'
            : 'camera_command_not_registered',
          hasSetMapCamera: registry.setMapCamera != null,
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
        });
        return;
      }
      const accepted = registry.setMapCamera({
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      logPayload({
        event: accepted ? 'perf_scenario_command_executed' : 'perf_scenario_command_failed',
        action: event.action,
        step: 'set_map_camera',
        reason: accepted ? null : 'camera_commit_rejected',
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
        label: event.label,
      });
      if (!accepted) {
        return;
      }

      const bounds = buildScenarioCommandBounds({
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
      });
      void resolveMarket(bounds, null)
        .then((response) => {
          logPayload({
            event: 'perf_scenario_command_executed',
            action: event.action,
            step: 'resolve_market',
            marketKey: response.market?.marketKey ?? null,
            marketStatus: response.status ?? null,
          });
        })
        .catch((error) => {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'resolve_market',
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (event.action === 'resolve_market') {
      if (event.lat == null || event.lng == null) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          reason: 'missing_market_resolve_parameters',
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
        });
        return;
      }

      const bounds = buildScenarioCommandBounds({
        lat: event.lat,
        lng: event.lng,
        zoom: event.zoom,
      });
      void resolveMarket(bounds, null)
        .then((response) => {
          logPayload({
            event: 'perf_scenario_command_executed',
            action: event.action,
            step: 'resolve_market',
            marketKey: response.market?.marketKey ?? null,
            marketStatus: response.status ?? null,
          });
        })
        .catch((error) => {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'resolve_market',
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (event.action === 'submit_shortcut_restaurants') {
      if (!registry.submitShortcutRestaurants) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          reason: 'submit_command_not_registered',
        });
        return;
      }
      if (event.lat != null || event.lng != null || event.zoom != null) {
        if (
          !registry.setMapCamera ||
          event.lat == null ||
          event.lng == null ||
          event.zoom == null
        ) {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            reason: registry.setMapCamera
              ? 'missing_camera_parameters'
              : 'camera_command_not_registered',
            hasSetMapCamera: registry.setMapCamera != null,
            lat: event.lat,
            lng: event.lng,
            zoom: event.zoom,
          });
          return;
        }
        const accepted = registry.setMapCamera({
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
          label: event.label,
        });
        logPayload({
          event: accepted
            ? 'perf_scenario_command_camera_prepared'
            : 'perf_scenario_command_failed',
          action: event.action,
          step: 'submit_shortcut_restaurants_camera',
          reason: accepted ? null : 'camera_commit_rejected',
          lat: event.lat,
          lng: event.lng,
          zoom: event.zoom,
          label: event.label,
        });
        if (!accepted) {
          return;
        }
      }
      void registry
        .submitShortcutRestaurants()
        .then(() => {
          logPayload({
            event: 'perf_scenario_command_executed',
            action: event.action,
            step: 'submit_shortcut_restaurants',
          });
        })
        .catch((error) => {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'submit_shortcut_restaurants',
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (
      event.action !== 'close_then_submit_shortcut' &&
      event.action !== 'submit_close_then_submit_shortcut'
    ) {
      logPayload({
        event: 'perf_scenario_command_failed',
        action: event.action,
        reason: 'unknown_action',
      });
      return;
    }

    if (!registry.closeResults || !registry.submitShortcutRestaurants) {
      logPayload({
        event: 'perf_scenario_command_failed',
        action: event.action,
        reason: 'commands_not_registered',
        hasCloseResults: registry.closeResults != null,
        hasSubmitShortcutRestaurants: registry.submitShortcutRestaurants != null,
      });
      return;
    }

    if (event.action === 'submit_close_then_submit_shortcut') {
      const commandStartedAtMs = resolvePerfNow();
      const readObservedDelay = () => roundScenarioPerfMs(resolvePerfNow() - commandStartedAtMs);

      void registry
        .submitShortcutRestaurants()
        .then(() => {
          logPayload({
            event: 'perf_scenario_command_step_executed',
            action: event.action,
            step: 'submit_shortcut_restaurants_initial',
            observedDelayMs: readObservedDelay(),
          });
        })
        .catch((error) => {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'submit_shortcut_restaurants_initial',
            observedDelayMs: readObservedDelay(),
            message: error instanceof Error ? error.message : String(error),
          });
        });

      const executeResubmit = () => {
        const latestRegistry = readPerfScenarioCommandRegistry();
        if (!latestRegistry.submitShortcutRestaurants) {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'submit_shortcut_restaurants_resubmit',
            reason: 'submit_command_not_registered',
            resubmitDelayMs: event.resubmitDelayMs,
            observedDelayMs: readObservedDelay(),
          });
          return;
        }

        void latestRegistry
          .submitShortcutRestaurants()
          .then(() => {
            logPayload({
              event: 'perf_scenario_command_executed',
              action: event.action,
              step: 'submit_shortcut_restaurants_resubmit',
              delayMs: event.delayMs,
              resubmitDelayMs: event.resubmitDelayMs,
              observedDelayMs: readObservedDelay(),
            });
          })
          .catch((error) => {
            logPayload({
              event: 'perf_scenario_command_failed',
              action: event.action,
              step: 'submit_shortcut_restaurants_resubmit',
              delayMs: event.delayMs,
              resubmitDelayMs: event.resubmitDelayMs,
              observedDelayMs: readObservedDelay(),
              message: error instanceof Error ? error.message : String(error),
            });
          });
      };

      const scheduleResubmit = () => {
        if (event.resubmitDelayMs <= 0) {
          executeResubmit();
          return;
        }
        setTimeout(executeResubmit, event.resubmitDelayMs);
      };

      setTimeout(() => {
        const latestRegistry = readPerfScenarioCommandRegistry();
        if (!latestRegistry.closeResults) {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'close_results',
            reason: 'close_command_not_registered',
            delayMs: event.delayMs,
            observedDelayMs: readObservedDelay(),
          });
          return;
        }
        try {
          latestRegistry.closeResults();
          logPayload({
            event: 'perf_scenario_command_step_executed',
            action: event.action,
            step: 'close_results',
            delayMs: event.delayMs,
            observedDelayMs: readObservedDelay(),
          });
          scheduleResubmit();
        } catch (error) {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'close_results',
            delayMs: event.delayMs,
            observedDelayMs: readObservedDelay(),
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }, event.delayMs);
      return;
    }

    try {
      registry.closeResults();
      logPayload({
        event: 'perf_scenario_command_step_executed',
        action: event.action,
        step: 'close_results',
      });
    } catch (error) {
      logPayload({
        event: 'perf_scenario_command_failed',
        action: event.action,
        step: 'close_results',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const startedAtMs = resolvePerfNow();
    setTimeout(() => {
      const latestRegistry = readPerfScenarioCommandRegistry();
      if (!latestRegistry.submitShortcutRestaurants) {
        logPayload({
          event: 'perf_scenario_command_failed',
          action: event.action,
          step: 'submit_shortcut_restaurants',
          reason: 'submit_command_not_registered',
        });
        return;
      }

      const observedDelayMs = roundScenarioPerfMs(resolvePerfNow() - startedAtMs);
      void latestRegistry
        .submitShortcutRestaurants()
        .then(() => {
          logPayload({
            event: 'perf_scenario_command_executed',
            action: event.action,
            step: 'submit_shortcut_restaurants',
            delayMs: event.delayMs,
            observedDelayMs,
          });
        })
        .catch((error) => {
          logPayload({
            event: 'perf_scenario_command_failed',
            action: event.action,
            step: 'submit_shortcut_restaurants',
            delayMs: event.delayMs,
            observedDelayMs,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }, event.delayMs);
  }, []);

  const handleUrl = React.useCallback(
    (url: string | null) => {
      const event = parsePerfScenarioDeepLinkEvent(url);
      if (!event) {
        return;
      }
      if (event.type === 'clear') {
        const currentConfig = activeConfigRef.current;
        if (
          currentConfig &&
          (event.scenarioRunId == null || currentConfig.runId === event.scenarioRunId)
        ) {
          stopPerfScenarioHermesSamplingProfiler({
            config: currentConfig,
            reason: 'scenario_clear',
            logEvent: (payload) => logScenarioEvent(withScenarioMetadata(currentConfig, payload)),
          });
          flushPerfScenarioStackAttributionAggregates(currentConfig, 'scenario_clear');
          flushPerfScenarioAttributionEventBuffer(currentConfig, 'scenario_clear');
          flushBufferedSamplerEvents(currentConfig, 'scenario_clear');
          void flushNativeMapApplySummary(currentConfig, 'scenario_clear');
        }
        measuredRepeatLoopActiveRef.current = false;
        setMeasuredRepeatLoopActive(false);
        clearActiveConfig(event.scenarioRunId);
        logScenarioEvent({
          event: 'scenario_config_cleared',
          scenarioRunId: event.scenarioRunId,
        });
        return;
      }
      if (event.type === 'mark') {
        const currentConfig = activeConfigRef.current;
        if (event.scenarioRunId && currentConfig?.runId !== event.scenarioRunId) {
          return;
        }
        if (currentConfig) {
          logScenarioEvent(
            withScenarioMetadata(currentConfig, {
              event: 'scenario_phase_mark',
              phase: event.phase,
              label: event.label,
            })
          );
          if (event.phase === 'measured_repeat_loop_start') {
            bufferedSamplerEventsRef.current = [];
            measuredRepeatLoopActiveRef.current = shouldUseQuietMeasuredLoop(currentConfig);
            setMeasuredRepeatLoopActive(measuredRepeatLoopActiveRef.current);
            void resetNativeMapApplySummary(currentConfig, 'measured_repeat_loop_start');
            startPerfScenarioHermesSamplingProfiler({
              config: currentConfig,
              reason: 'measured_repeat_loop_start',
              logEvent: (payload) => logScenarioEvent(withScenarioMetadata(currentConfig, payload)),
            });
          }
          if (event.phase === 'measured_repeat_loop_end') {
            stopPerfScenarioHermesSamplingProfiler({
              config: currentConfig,
              reason: 'measured_repeat_loop_end',
              logEvent: (payload) => logScenarioEvent(withScenarioMetadata(currentConfig, payload)),
            });
            flushPerfScenarioStackAttributionAggregates(currentConfig, 'measured_repeat_loop_end');
            flushPerfScenarioAttributionEventBuffer(currentConfig, 'measured_repeat_loop_end');
            flushBufferedSamplerEvents(currentConfig, 'measured_repeat_loop_end');
            measuredRepeatLoopActiveRef.current = false;
            setMeasuredRepeatLoopActive(false);
            void flushNativeMapApplySummary(currentConfig, 'measured_repeat_loop_end');
          }
        } else {
          logScenarioEvent({
            event: 'scenario_phase_mark',
            phase: event.phase,
            label: event.label,
            scenarioRunId: event.scenarioRunId,
          });
        }
        return;
      }
      if (event.type === 'command') {
        executeCommandEvent(event);
        return;
      }
      measuredRepeatLoopActiveRef.current = false;
      setActiveConfig(event.config);
      void resetNativeMapApplySummary(event.config, 'scenario_start');
      logScenarioEvent({
        event: 'scenario_config_received',
        scenarioName: event.config.scenario,
        scenarioRunId: event.config.runId,
        requestId: event.config.requestId,
        durationMs: event.config.durationMs,
        signature: event.config.signature,
      });
    },
    [
      clearActiveConfig,
      executeCommandEvent,
      flushBufferedSamplerEvents,
      setActiveConfig,
      setMeasuredRepeatLoopActive,
    ]
  );

  React.useEffect(() => {
    let disposed = false;
    Linking.getInitialURL()
      .then((url) => {
        if (!disposed) {
          handleUrl(url);
        }
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [handleUrl]);

  React.useEffect(() => {
    if (!activeConfig) {
      return undefined;
    }

    const stopCallbacks: Array<() => void> = [];
    logScenarioEvent(
      withScenarioMetadata(activeConfig, {
        event: 'scenario_sampling_started',
        durationMs: activeConfig.durationMs,
        jsFrameSamplerEnabled: activeConfig.jsFrameSampler.enabled,
        jsTaskLatencySamplerEnabled: activeConfig.jsTaskLatencySampler.enabled,
        uiFrameSamplerEnabled: activeConfig.uiFrameSampler.enabled,
      })
    );

    if (activeConfig.jsFrameSampler.enabled) {
      stopCallbacks.push(
        startJsFrameSampler({
          windowMs: activeConfig.jsFrameSampler.windowMs,
          stallFrameMs: activeConfig.jsFrameSampler.stallFrameMs,
          logOnlyBelowFps: activeConfig.jsFrameSampler.logOnlyBelowFps,
          onWindow: (summary) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'JsFrameSampler', summary);
          },
          onStall: (event) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'JsFrameSampler', event);
          },
        })
      );
    }

    if (activeConfig.jsTaskLatencySampler.enabled) {
      stopCallbacks.push(
        startJsTaskLatencySampler({
          windowMs: activeConfig.jsTaskLatencySampler.windowMs,
          sampleIntervalMs: activeConfig.jsTaskLatencySampler.sampleIntervalMs,
          stallLagMs: activeConfig.jsTaskLatencySampler.stallLagMs,
          logOnlyAboveLagMs: activeConfig.jsTaskLatencySampler.logOnlyAboveLagMs,
          onWindow: (summary) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'JsTaskLatencySampler', summary);
          },
          onStall: (event) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'JsTaskLatencySampler', event);
          },
        })
      );
    }

    if (activeConfig.uiFrameSampler.enabled) {
      stopCallbacks.push(
        startUiFrameSampler({
          windowMs: activeConfig.uiFrameSampler.windowMs,
          stallFrameMs: activeConfig.uiFrameSampler.stallFrameMs,
          logOnlyBelowFps: activeConfig.uiFrameSampler.logOnlyBelowFps,
          onWindow: (summary) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'UiFrameSampler', summary);
          },
          onStall: (event) => {
            emitOrBufferJsSamplerEvent(activeConfig, 'UiFrameSampler', event);
          },
        })
      );
    }

    const timeoutHandle = setTimeout(() => {
      flushPerfScenarioStackAttributionAggregates(
        activeConfig,
        'scenario_sampling_duration_elapsed'
      );
      flushPerfScenarioAttributionEventBuffer(activeConfig, 'scenario_sampling_duration_elapsed');
      flushBufferedSamplerEvents(activeConfig, 'scenario_sampling_duration_elapsed');
      void flushNativeMapApplySummary(activeConfig, 'scenario_sampling_duration_elapsed');
      clearActiveConfig(activeConfig.runId);
      logScenarioEvent(
        withScenarioMetadata(activeConfig, {
          event: 'scenario_sampling_duration_elapsed',
          durationMs: activeConfig.durationMs,
        })
      );
    }, activeConfig.durationMs);

    return () => {
      clearTimeout(timeoutHandle);
      flushPerfScenarioStackAttributionAggregates(activeConfig, 'scenario_sampling_stopped');
      flushPerfScenarioAttributionEventBuffer(activeConfig, 'scenario_sampling_stopped');
      flushBufferedSamplerEvents(activeConfig, 'scenario_sampling_stopped');
      stopCallbacks.forEach((stop) => {
        stop();
      });
      logScenarioEvent(
        withScenarioMetadata(activeConfig, {
          event: 'scenario_sampling_stopped',
        })
      );
    };
  }, [activeConfig, clearActiveConfig, emitOrBufferJsSamplerEvent, flushBufferedSamplerEvents]);

  return null;
};
