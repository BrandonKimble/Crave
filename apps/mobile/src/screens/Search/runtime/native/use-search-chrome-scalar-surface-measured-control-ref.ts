import React from 'react';
import { findNodeHandle } from 'react-native';

import {
  SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY,
  searchChromeScalarSurfaceRegistry,
  type SearchChromeScalarSurfaceControlId,
} from './search-chrome-scalar-surface';

type NativeNodeHandleTarget = Parameters<typeof findNodeHandle>[0];

export const useSearchChromeScalarSurfaceMeasuredControlRef = (
  controlId: SearchChromeScalarSurfaceControlId,
  hostKey = SEARCH_CHROME_SCALAR_SURFACE_HOST_KEY
) => {
  const registeredTagRef = React.useRef<number | null>(null);

  return React.useCallback(
    (node: unknown | null) => {
      if (node == null) {
        if (registeredTagRef.current != null) {
          searchChromeScalarSurfaceRegistry.clearMeasuredControl(hostKey, controlId);
          registeredTagRef.current = null;
        }
        return;
      }

      const nativeTag = findNodeHandle(node as NativeNodeHandleTarget);
      if (typeof nativeTag !== 'number' || registeredTagRef.current === nativeTag) {
        return;
      }

      if (registeredTagRef.current != null) {
        searchChromeScalarSurfaceRegistry.clearMeasuredControl(hostKey, controlId);
      }
      if (
        searchChromeScalarSurfaceRegistry.registerMeasuredControl({
          hostKey,
          controlId,
          nativeTag,
        })
      ) {
        registeredTagRef.current = nativeTag;
      }
    },
    [controlId, hostKey]
  );
};
