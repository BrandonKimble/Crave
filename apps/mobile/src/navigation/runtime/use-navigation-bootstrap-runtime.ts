import React from 'react';
import { useAuth } from '@clerk/clerk-expo';

import { useOnboardingStore } from '../../store/onboardingStore';

export type NavigationBootstrapRuntime = {
  isReady: boolean;
  hasCompletedOnboarding: boolean;
  isSignedIn: boolean;
};

export const useNavigationBootstrapRuntime = (): NavigationBootstrapRuntime => {
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const { isLoaded, isSignedIn } = useAuth();
  const [isHydrated, setIsHydrated] = React.useState(() =>
    useOnboardingStore.persist.hasHydrated()
  );

  React.useEffect(() => {
    if (useOnboardingStore.persist.hasHydrated()) {
      setIsHydrated(true);
      return;
    }
    const unsubscribe = useOnboardingStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isReady: isHydrated && isLoaded,
    hasCompletedOnboarding,
    isSignedIn: isSignedIn ?? false,
  };
};
