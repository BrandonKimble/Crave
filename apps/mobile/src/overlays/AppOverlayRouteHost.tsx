import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import type { RouteSceneSwitchTransitionActions } from '../navigation/runtime/app-route-scene-switch-controller';
import type {
  SearchOverlayChromeContainerHostAuthority,
  SearchOverlayChromeFrameHostAuthority,
  SearchOverlayChromeHeaderHostAuthority,
  SearchOverlayChromeSuggestionSurfaceHostAuthority,
  SearchOverlayGateHostAuthority,
  SearchOverlayGlobalRestaurantHostAuthority,
  SearchOverlayLocalRestaurantSheetHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { AppRouteSheetHostRuntime } from '../navigation/runtime/app-route-sheet-host-runtime-contract';
import { SearchOverlayChromeHost } from './SearchOverlayChromeHost';
import GlobalRestaurantSheetLayerHost from './GlobalRestaurantSheetLayerHost';
import LocalRestaurantSheetLayerHost from './LocalRestaurantSheetLayerHost';
import { SearchOverlayRouteGateHost } from './SearchOverlayRouteGateHost';
import { SearchOverlayRouteSheetSurfaceHost } from './SearchOverlayRouteSheetSurfaceHost';
import { SearchOverlayShellHost } from './SearchOverlayShellHost';
import { AppRouteBottomNavHost } from './AppRouteBottomNavHost';

export type AppOverlayRouteHostRuntime = {
  overlayChromeFrameHostAuthority: SearchOverlayChromeFrameHostAuthority;
  overlayChromeContainerHostAuthority: SearchOverlayChromeContainerHostAuthority;
  overlayChromeHeaderHostAuthority: SearchOverlayChromeHeaderHostAuthority;
  overlayChromeSuggestionSurfaceHostAuthority: SearchOverlayChromeSuggestionSurfaceHostAuthority;
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  overlayGlobalRestaurantHostAuthority: SearchOverlayGlobalRestaurantHostAuthority;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
  routeSheetHostRuntime: AppRouteSheetHostRuntime;
};

const AppOverlayRouteHost = ({
  overlayChromeFrameHostAuthority,
  overlayChromeContainerHostAuthority,
  overlayChromeHeaderHostAuthority,
  overlayChromeSuggestionSurfaceHostAuthority,
  overlayGateHostAuthority,
  overlayShellHostAuthority,
  overlayGlobalRestaurantHostAuthority,
  overlayLocalRestaurantSheetHostAuthority,
  routeSceneDisplayTargetRegistry,
  routeOverlayTransitionActions,
  routeSheetHostRuntime,
}: AppOverlayRouteHostRuntime) => {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <>
        <SearchOverlayChromeHost
          overlayChromeFrameHostAuthority={overlayChromeFrameHostAuthority}
          overlayChromeContainerHostAuthority={overlayChromeContainerHostAuthority}
          overlayChromeHeaderHostAuthority={overlayChromeHeaderHostAuthority}
          overlayChromeSuggestionSurfaceHostAuthority={overlayChromeSuggestionSurfaceHostAuthority}
        />
        <SearchOverlayShellHost overlayShellHostAuthority={overlayShellHostAuthority} />
        <AppRouteBottomNavHost
          overlayGateHostAuthority={overlayGateHostAuthority}
          overlayShellHostAuthority={overlayShellHostAuthority}
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          routeOverlayTransitionActions={routeOverlayTransitionActions}
        />
        <GlobalRestaurantSheetLayerHost
          overlayGlobalRestaurantHostAuthority={overlayGlobalRestaurantHostAuthority}
        />
        <LocalRestaurantSheetLayerHost
          overlayLocalRestaurantSheetHostAuthority={overlayLocalRestaurantSheetHostAuthority}
        />
        <SearchOverlayRouteGateHost overlayGateHostAuthority={overlayGateHostAuthority}>
          <SearchOverlayRouteSheetSurfaceHost routeSheetHostRuntime={routeSheetHostRuntime} />
        </SearchOverlayRouteGateHost>
      </>
    </View>
  );
};

export default React.memo(AppOverlayRouteHost);
