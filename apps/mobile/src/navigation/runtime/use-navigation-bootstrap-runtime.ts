import { useAppRouteCoordinator } from './AppRouteCoordinator';
import { useMainLaunchCoordinator } from './MainLaunchCoordinator';

export const useNavigationBootstrapRuntime = () => {
  const { isReady, routeState } = useAppRouteCoordinator();
  const { isReadyToRender } = useMainLaunchCoordinator();

  return {
    isReady,
    isReadyToRender,
    routeState,
  };
};
