import React from 'react';

import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from './search-nav-switch-runtime-attribution';

export const useSearchNavSwitchCommitAttribution = (owner: string): void => {
  const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();

  React.useLayoutEffect(() => {
    finishSearchNavSwitchRuntimeAttributionSpan({
      owner,
      operation: 'renderToLayoutEffect',
      startedAtMs: renderStartedAtMs,
    });
    markSearchNavSwitchRuntimeAttribution(owner, 'layoutEffectWakeup');
  });

  React.useEffect(() => {
    markSearchNavSwitchRuntimeAttribution(owner, 'passiveEffectWakeup');
  });
};
