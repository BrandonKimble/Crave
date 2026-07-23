import React from 'react';
import { Linking } from 'react-native';
import { useAuth, useSessionList } from '@clerk/clerk-expo';
import { ONBOARDING_VERSION, type UserOnboardingProfile } from '@crave-search/shared';
import { useOnboardingStore } from '../../store/onboardingStore';
import { usersService } from '../../services/users';
import { useQueryClient } from '@tanstack/react-query';
import { accessQueryKey, useAccess } from '../../hooks/useAccess';
import { logger } from '../../utils';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';
import {
  type AppRouteState,
  type LaunchIntent,
  type AuthStatus,
  NO_LAUNCH_INTENT,
  parseLaunchIntentFromUrl,
} from './app-route-types';

type AppRouteCoordinatorContextValue = {
  isReady: boolean;
  routeState: AppRouteState | null;
  activeMainIntent: LaunchIntent;
  consumeActiveMainIntent: () => void;
  dispatchLaunchIntent: (intent: LaunchIntent) => void;
};

const AppRouteCoordinatorContext = React.createContext<AppRouteCoordinatorContextValue | null>(
  null
);

const isStoreHydrated = (persistApi: { hasHydrated?: () => boolean } | undefined): boolean =>
  Boolean(persistApi?.hasHydrated?.());

const isMeaningfulIntent = (intent: LaunchIntent | null | undefined): intent is LaunchIntent =>
  Boolean(intent && intent.type !== 'none');

const normalizeLaunchIntent = (intent: LaunchIntent | null | undefined): LaunchIntent =>
  intent && intent.type !== 'none' ? intent : NO_LAUNCH_INTENT;

const areRouteStatesEqual = (left: AppRouteState | null, right: AppRouteState | null): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.destination === right.destination &&
    left.authStatus === right.authStatus &&
    left.onboardingStatus === right.onboardingStatus &&
    JSON.stringify(left.launchIntent) === JSON.stringify(right.launchIntent) &&
    JSON.stringify(left.deferredIntent) === JSON.stringify(right.deferredIntent)
  );
};

export const AppRouteCoordinator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, userId: clerkUserId } = useAuth();
  const queryClient = useQueryClient();
  // Live server-truth access (shared query with useAccess consumers): the
  // paywall routing axis re-routes to 'main' the moment a purchase lands.
  const access = useAccess();
  const isPerfScenarioNavigationBypassActive = usePerfScenarioRuntimeStore(
    (state) => __DEV__ && state.activeConfig != null
  );
  const sessionListState = useSessionList();
  const sessionListIsLoaded = sessionListState.isLoaded;
  const availableSessions = sessionListIsLoaded ? sessionListState.sessions : undefined;
  const setActiveSession = sessionListIsLoaded ? sessionListState.setActive : undefined;

  const onboardingStatus = useOnboardingStore((state) => state.status);
  const onboardingSelectedCity = useOnboardingStore((state) => state.selectedCity);
  const onboardingPreviewCity = useOnboardingStore((state) => state.previewCity);
  const hydrateCompletionFromServer = useOnboardingStore(
    (state) => state.hydrateCompletionFromServer
  );
  const [isOnboardingHydrated, setIsOnboardingHydrated] = React.useState(() =>
    isStoreHydrated(useOnboardingStore.persist)
  );
  const [isInitialIntentResolved, setIsInitialIntentResolved] = React.useState(false);
  const [serverOnboardingProfile, setServerOnboardingProfile] =
    React.useState<UserOnboardingProfile | null>(null);
  const [hasResolvedSignedInProfile, setHasResolvedSignedInProfile] = React.useState(false);
  const [isRecoveringSession, setIsRecoveringSession] = React.useState(false);
  const [queuedLaunchIntent, setQueuedLaunchIntent] =
    React.useState<LaunchIntent>(NO_LAUNCH_INTENT);
  const [activeMainIntent, setActiveMainIntent] = React.useState<LaunchIntent>(NO_LAUNCH_INTENT);
  const [deferredIntent, setDeferredIntent] = React.useState<LaunchIntent | null>(null);
  const [stableRouteState, setStableRouteState] = React.useState<AppRouteState | null>(null);
  const sessionRecoveryInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const resumedSessionIdRef = React.useRef<string | null>(null);
  const onboardingSyncInFlightRef = React.useRef(false);
  const hasResolvedSignedInProfileRef = React.useRef(false);

  React.useEffect(() => {
    if (useOnboardingStore.persist.hasHydrated()) {
      setIsOnboardingHydrated(true);
      return;
    }
    const unsubscribe = useOnboardingStore.persist.onFinishHydration(() => {
      setIsOnboardingHydrated(true);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void Linking.getInitialURL()
      .then((url) => {
        if (!cancelled) {
          setQueuedLaunchIntent(parseLaunchIntentFromUrl(url));
          setIsInitialIntentResolved(true);
        }
      })
      .catch((error) => {
        logger.warn('Failed to read initial launch intent', error);
        if (!cancelled) {
          setIsInitialIntentResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      const parsed = parseLaunchIntentFromUrl(event.url);
      // Non-intent URLs (perf-scenario, lifecycle-harness, unrecognized) must not
      // WRITE the single-slot queue — an unconditional write let a harness command
      // URL overwrite a just-dispatched entityAction with 'none' (Leg-1 bring-up
      // bug, second variant). 'external' intents still pass (they are meaningful).
      if (parsed.type === 'none') {
        return;
      }
      setQueuedLaunchIntent(parsed);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const recoverExistingSession = React.useCallback(async (): Promise<boolean> => {
    if (sessionRecoveryInFlightRef.current) {
      return sessionRecoveryInFlightRef.current;
    }
    if (isSignedIn || !sessionListIsLoaded || typeof setActiveSession !== 'function') {
      return false;
    }

    const resumableSession = availableSessions?.find(
      (session) => typeof session?.id === 'string' && session.id.length > 0
    );
    if (!resumableSession?.id || resumedSessionIdRef.current === resumableSession.id) {
      return false;
    }

    const nextPromise = (async () => {
      resumedSessionIdRef.current = resumableSession.id;
      setIsRecoveringSession(true);
      try {
        await setActiveSession({ session: resumableSession.id });
        return true;
      } catch (error) {
        logger.warn('Failed to recover existing Clerk session', error);
        if (resumedSessionIdRef.current === resumableSession.id) {
          resumedSessionIdRef.current = null;
        }
        return false;
      } finally {
        sessionRecoveryInFlightRef.current = null;
        setIsRecoveringSession(false);
      }
    })();

    sessionRecoveryInFlightRef.current = nextPromise;
    return nextPromise;
  }, [availableSessions, isSignedIn, sessionListIsLoaded, setActiveSession]);

  React.useEffect(() => {
    if (isSignedIn || !sessionListIsLoaded || !availableSessions?.length || isRecoveringSession) {
      return;
    }
    void recoverExistingSession();
  }, [
    availableSessions,
    isRecoveringSession,
    isSignedIn,
    recoverExistingSession,
    sessionListIsLoaded,
  ]);

  const authStatus: AuthStatus = React.useMemo(() => {
    if (!isLoaded || !sessionListIsLoaded || isRecoveringSession) {
      return 'loading';
    }
    return isSignedIn ? 'signed_in' : 'signed_out';
  }, [isLoaded, isRecoveringSession, isSignedIn, sessionListIsLoaded]);

  React.useEffect(() => {
    if (authStatus !== 'signed_in') {
      hasResolvedSignedInProfileRef.current = false;
      setServerOnboardingProfile(null);
      setHasResolvedSignedInProfile(authStatus === 'signed_out');
      return;
    }

    let cancelled = false;
    if (!hasResolvedSignedInProfileRef.current) {
      setHasResolvedSignedInProfile(false);
    }
    void usersService
      .getMe()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setServerOnboardingProfile(profile.onboarding ?? null);
        if (profile.access) {
          queryClient.setQueryData(accessQueryKey(clerkUserId), profile.access);
        }
        if (profile.onboarding) {
          hydrateCompletionFromServer(profile.onboarding);
        }
      })
      .catch((error) => {
        logger.warn('Failed to hydrate signed-in onboarding profile', error);
      })
      .finally(() => {
        if (!cancelled) {
          hasResolvedSignedInProfileRef.current = true;
          setHasResolvedSignedInProfile(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, hydrateCompletionFromServer]);

  React.useEffect(() => {
    if (
      authStatus !== 'signed_in' ||
      onboardingStatus !== 'completed' ||
      onboardingSyncInFlightRef.current ||
      serverOnboardingProfile?.status === 'completed'
    ) {
      return;
    }

    onboardingSyncInFlightRef.current = true;
    void usersService
      .completeOnboarding({
        status: 'completed',
        onboardingVersion: ONBOARDING_VERSION,
        selectedCity: onboardingSelectedCity ?? null,
        previewCity: onboardingPreviewCity,
        answers: {},
        username: null,
      })
      .then((profile) => {
        setServerOnboardingProfile(profile.onboarding);
        hydrateCompletionFromServer(profile.onboarding);
      })
      .catch((error) => {
        logger.warn('Failed to mirror completed onboarding to server', error);
      })
      .finally(() => {
        onboardingSyncInFlightRef.current = false;
      });
  }, [
    authStatus,
    hydrateCompletionFromServer,
    onboardingPreviewCity,
    onboardingSelectedCity,
    onboardingStatus,
    serverOnboardingProfile?.status,
  ]);

  const effectiveOnboardingStatus = React.useMemo(() => {
    if (serverOnboardingProfile?.status === 'completed' || onboardingStatus === 'completed') {
      return 'completed' as const;
    }
    return onboardingStatus;
  }, [onboardingStatus, serverOnboardingProfile?.status]);

  const isReady =
    isOnboardingHydrated &&
    isInitialIntentResolved &&
    authStatus !== 'loading' &&
    (authStatus !== 'signed_in' || hasResolvedSignedInProfile);

  const routeState = React.useMemo<AppRouteState | null>(() => {
    if (!isReady) {
      return null;
    }
    // HARD PAYWALL routing axis (decided 2026-07-09): a signed-in,
    // onboarded user without access lands on the paywall, not 'main' —
    // but ONLY when the server wall is live (access.enforced rides the
    // profile payload; rollout stays a single server-side switch).
    const needsPaywall = access.enforced && !access.active;
    const destination = isPerfScenarioNavigationBypassActive
      ? 'main'
      : effectiveOnboardingStatus === 'completed'
        ? authStatus === 'signed_in'
          ? needsPaywall
            ? 'paywall'
            : 'main'
          : 'sign_in'
        : 'onboarding';
    return {
      destination,
      authStatus,
      onboardingStatus: effectiveOnboardingStatus,
      launchIntent: activeMainIntent,
      deferredIntent,
    };
  }, [
    activeMainIntent,
    authStatus,
    deferredIntent,
    effectiveOnboardingStatus,
    isPerfScenarioNavigationBypassActive,
    isReady,
    access.enforced,
    access.active,
  ]);

  React.useEffect(() => {
    if (!routeState) {
      return;
    }
    setStableRouteState((current) =>
      areRouteStatesEqual(current, routeState) ? current : routeState
    );
  }, [routeState]);

  const exposedRouteState = routeState ?? stableRouteState;
  const exposedIsReady = isReady || stableRouteState !== null;

  React.useEffect(() => {
    if (!routeState) {
      return;
    }
    if (routeState.destination === 'main') {
      if (isMeaningfulIntent(queuedLaunchIntent)) {
        setActiveMainIntent(queuedLaunchIntent);
        setQueuedLaunchIntent(NO_LAUNCH_INTENT);
        return;
      }
      if (!isMeaningfulIntent(activeMainIntent) && isMeaningfulIntent(deferredIntent)) {
        setActiveMainIntent(deferredIntent);
        setDeferredIntent(null);
      }
      return;
    }

    if (isMeaningfulIntent(queuedLaunchIntent)) {
      setDeferredIntent(queuedLaunchIntent);
      setQueuedLaunchIntent(NO_LAUNCH_INTENT);
      return;
    }
    if (isMeaningfulIntent(activeMainIntent) && !isMeaningfulIntent(deferredIntent)) {
      setDeferredIntent(activeMainIntent);
      setActiveMainIntent(NO_LAUNCH_INTENT);
    }
  }, [activeMainIntent, deferredIntent, queuedLaunchIntent, routeState]);

  const consumeActiveMainIntent = React.useCallback(() => {
    setActiveMainIntent(NO_LAUNCH_INTENT);
  }, []);

  const dispatchLaunchIntent = React.useCallback((intent: LaunchIntent) => {
    setQueuedLaunchIntent(normalizeLaunchIntent(intent));
  }, []);

  const value = React.useMemo<AppRouteCoordinatorContextValue>(
    () => ({
      isReady: exposedIsReady,
      routeState: exposedRouteState,
      activeMainIntent,
      consumeActiveMainIntent,
      dispatchLaunchIntent,
    }),
    [
      activeMainIntent,
      consumeActiveMainIntent,
      dispatchLaunchIntent,
      exposedIsReady,
      exposedRouteState,
    ]
  );

  return (
    <AppRouteCoordinatorContext.Provider value={value}>
      {children}
    </AppRouteCoordinatorContext.Provider>
  );
};

export const useAppRouteCoordinator = (): AppRouteCoordinatorContextValue => {
  const context = React.useContext(AppRouteCoordinatorContext);
  if (!context) {
    throw new Error('useAppRouteCoordinator must be used within AppRouteCoordinator');
  }
  return context;
};
