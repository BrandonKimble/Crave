import React from 'react';
import { Linking } from 'react-native';

import { logger } from '../utils';
import { parsePerfHarnessConfigFromUrl } from './perf-harness-deep-link';
import { usePerfHarnessRuntimeStore } from './perf-harness-runtime-store';

export const PerfHarnessCoordinator: React.FC = () => {
  const setActiveConfig = usePerfHarnessRuntimeStore((state) => state.setActiveConfig);

  React.useEffect(() => {
    const handleUrl = (url: string | null) => {
      const config = parsePerfHarnessConfigFromUrl(url);
      if (!config) {
        return;
      }
      setActiveConfig(config);
      logger.debug('[SearchPerf][Harness]', {
        event: 'runtime_config_received',
        harnessRunId: config.runId,
        scenario: config.scenario,
        requestId: config.requestId,
        runs: config.runs,
        sequence: config.navSwitchLoop.sequence,
        startDelayMs: config.startDelayMs,
        cooldownMs: config.cooldownMs,
      });
    };

    void Linking.getInitialURL()
      .then((url) => {
        handleUrl(url);
      })
      .catch((error) => {
        logger.warn('Failed to read initial perf harness URL', error);
      });

    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [setActiveConfig]);

  return null;
};
