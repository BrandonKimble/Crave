import React from 'react';

import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from './search-chrome-scalar-surface-primitive-source-runtime';

export const useSearchChromeScalarSurfaceRuntimeBusPrimitiveSourceRuntime = ({
  primitiveSourceRuntime,
  searchRuntimeBus,
}: {
  primitiveSourceRuntime: SearchChromeScalarSurfacePrimitiveSourceRuntime;
  searchRuntimeBus: SearchRuntimeBus;
}) => {
  React.useEffect(
    () => searchRuntimeBus.setSearchChromeScalarPrimitiveTarget(primitiveSourceRuntime),
    [primitiveSourceRuntime, searchRuntimeBus]
  );
};
