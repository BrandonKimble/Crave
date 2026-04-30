import type { RouteOverlayIdentityAuthority } from '../shared/route-authority-contract';
import type {
  SearchChromeScalarSurfacePrimitivePatch,
  SearchChromeScalarSurfacePrimitiveSourceRuntime,
} from './search-chrome-scalar-surface-primitive-source-runtime';

type SearchChromeScalarSurfacePrimitiveSourceWriterRuntimeArgs =
  SearchChromeScalarSurfacePrimitivePatch & {
    primitiveSourceRuntime: SearchChromeScalarSurfacePrimitiveSourceRuntime;
    routeOverlayIdentityAuthority: RouteOverlayIdentityAuthority;
  };

export const useSearchChromeScalarSurfacePrimitiveSourceWriterRuntime = ({
  primitiveSourceRuntime,
  routeOverlayIdentityAuthority,
  ...primitivePatch
}: SearchChromeScalarSurfacePrimitiveSourceWriterRuntimeArgs) => {
  const routeOverlayIdentitySnapshot = routeOverlayIdentityAuthority.getSnapshot();
  primitiveSourceRuntime.updatePrimitiveSnapshot({
    ...primitivePatch,
    isSearchOverlay: routeOverlayIdentitySnapshot.isSearchOverlay,
  });
};
