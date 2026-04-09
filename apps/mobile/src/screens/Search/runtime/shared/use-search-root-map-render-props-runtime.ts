import { useSearchMapProps } from './use-search-map-props';
import type {
  SearchRootMapArgs,
  SearchRootRenderRuntime,
} from './search-root-render-runtime-contract';

type UseSearchRootMapRenderPropsRuntimeArgs = {
  mapArgs: SearchRootMapArgs;
};

export type SearchRootMapRenderPropsRuntime = Pick<SearchRootRenderRuntime, 'searchMapProps'>;

export const useSearchRootMapRenderPropsRuntime = ({
  mapArgs,
}: UseSearchRootMapRenderPropsRuntimeArgs): SearchRootMapRenderPropsRuntime => ({
  searchMapProps: useSearchMapProps(mapArgs),
});
