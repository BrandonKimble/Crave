import React from 'react';

import type {
  SearchMapRenderEngineInputs,
  SearchMapRenderHostConfig,
  SearchMapRenderPresentationProps,
} from '../../components/SearchMapWithMarkerEngine';
import { logger } from '../../../../utils';
import {
  getSearchMapEngineInputChanges,
} from '../controller/search-root-map-engine-input-controller-runtime';
import {
  getSearchMapHostConfigChanges,
} from '../controller/search-root-map-host-config-controller-runtime';
import {
  getSearchMapPresentationPropChanges,
} from '../controller/search-root-map-presentation-props-controller-runtime';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';

const SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION =
  __DEV__ && shouldLogSearchNavSwitchDiagnosticLogs();

type UseSearchRootMapSurfaceAttributionRuntimeArgs = {
  engineInputs: SearchMapRenderEngineInputs;
  hostConfig: SearchMapRenderHostConfig;
  presentationProps: SearchMapRenderPresentationProps;
};

export const useSearchRootMapSurfaceAttributionRuntime = ({
  engineInputs,
  hostConfig,
  presentationProps,
}: UseSearchRootMapSurfaceAttributionRuntimeArgs) => {
  const previousAttributionRef = React.useRef<{
    engineInputs: SearchMapRenderEngineInputs;
    hostConfig: SearchMapRenderHostConfig;
    presentationProps: SearchMapRenderPresentationProps;
  } | null>(null);

  React.useEffect(() => {
    if (!SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION) {
      return;
    }

    const previous = previousAttributionRef.current;
    if (!previous) {
      previousAttributionRef.current = {
        engineInputs,
        hostConfig,
        presentationProps,
      };
      logger.debug('[ROOT-OVERLAY-ATTRIBUTION] mapSurfacePublication:init', {
        isStableEngineInputsReuse: true,
        isStableHostConfigReuse: true,
        isStablePresentationPropsReuse: true,
      });
      return;
    }

    const engineInputChanges = getSearchMapEngineInputChanges(
      previous.engineInputs,
      engineInputs
    );
    const hostConfigChanges = getSearchMapHostConfigChanges(
      previous.hostConfig,
      hostConfig
    );
    const presentationPropChanges = getSearchMapPresentationPropChanges(
      previous.presentationProps,
      presentationProps
    );

    if (
      Object.values(engineInputChanges).some(Boolean) ||
      Object.values(hostConfigChanges).some(Boolean) ||
      Object.values(presentationPropChanges).some(Boolean)
    ) {
      logger.debug('[ROOT-OVERLAY-ATTRIBUTION] mapSurfacePublication:propDiff', {
        isStableEngineInputsReuse: engineInputs === previous.engineInputs,
        isStableHostConfigReuse: hostConfig === previous.hostConfig,
        isStablePresentationPropsReuse:
          presentationProps === previous.presentationProps,
        engineInputChanges,
        hostConfigChanges,
        presentationPropChanges,
      });
    }

    previousAttributionRef.current = {
      engineInputs,
      hostConfig,
      presentationProps,
    };
  }, [engineInputs, hostConfig, presentationProps]);
};
