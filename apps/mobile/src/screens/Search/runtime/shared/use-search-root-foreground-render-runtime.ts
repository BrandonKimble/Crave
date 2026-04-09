import { SEARCH_BOTTOM_NAV_ICON_RENDERERS } from '../../components/search-bottom-nav-icons';
import { useSearchBottomNavProps } from './use-search-bottom-nav-props';
import { useSearchOverlayChromeRenderModel } from './use-search-overlay-chrome-render-model';
import type {
  SearchRootBottomNavArgs,
  SearchRootChromeArgs,
  SearchRootRenderRuntime,
} from './search-root-render-runtime-contract';

type UseSearchRootForegroundRenderRuntimeArgs = {
  chromeArgs: SearchRootChromeArgs;
  bottomNavArgs: SearchRootBottomNavArgs;
};

export type SearchRootForegroundRenderRuntime = Pick<
  SearchRootRenderRuntime,
  'searchOverlayChromeModel' | 'bottomNavProps'
>;

export const useSearchRootForegroundRenderRuntime = ({
  chromeArgs,
  bottomNavArgs,
}: UseSearchRootForegroundRenderRuntimeArgs): SearchRootForegroundRenderRuntime => {
  const searchOverlayChromeModel = useSearchOverlayChromeRenderModel(chromeArgs);
  const bottomNavProps = useSearchBottomNavProps({
    ...bottomNavArgs,
    navIconRenderers: SEARCH_BOTTOM_NAV_ICON_RENDERERS,
  });

  return {
    searchOverlayChromeModel,
    bottomNavProps,
  };
};
