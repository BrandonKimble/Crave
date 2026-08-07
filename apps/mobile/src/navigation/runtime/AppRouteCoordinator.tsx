import React from 'react';
import { Linking } from 'react-native';
import { useAuth, useSessionList } from '@clerk/clerk-expo';
import { ONBOARDING_VERSION, type UserOnboardingProfile } from '@crave-search/shared';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSessionLapseStore } from '../../store/sessionLapseStore';
import { decideOnboardingCompletionReplay } from '../../screens/onboarding/onboarding-completion-replay';
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
import { resolveAppRouteDestination, resolveAppRouteReadiness } from './app-route-destination';
import { useAccountDeletedStore } from '../../store/accountDeletedStore';
import { useClearOnIdentityChange } from './use-clear-on-identity-change';

/**
 * THE STICKINESS IS UNCONDITIONAL, AND UNGUARDED (F917, corrected by F4500).
 *
 * `isReady` is STICKY: once any route state has been published the coordinator
 * reports ready forever, and `routeState` keeps serving the LAST known destination
 * even while auth is genuinely unresolved again (a session recovery, a lapse
 * re-entering 'loading'). That is deliberate — it is what stops the app tearing down
 * the current screen and flashing a splash on every auth blip.
 *
 * This type used to also publish `isResolving` (`!isReady && stableRouteState !== null`)
 * with a docblock telling the reader that "a consumer that must not act on stale
 * routing — a sign-out, an access-gated redirect — checks it". NOTHING CHECKED IT: a
 * whole-tree grep found zero readers, and reading the two named flows end to end says
 * why neither ever would. Sign-out (overlays/panels/runtime/use-account-actions-runtime)
 * is user-initiated and calls Clerk's `signOut` directly — it consults no routing at
 * all. The "access-gated redirect" is not a consumer either: it is PRODUCED here, by
 * the destination memo, which recomputes only when `isReady` (and is now gated on the
 * access axis too — F4501). So the field was deleted rather than left as a guard the
 * next reader would believe in.
 *
 * THE HAZARD IS THEREFORE UNHANDLED, ON PURPOSE, AND THAT IS THE HONEST STATEMENT:
 * while auth is re-resolving, every consumer (RootNavigator, MainLaunchCoordinator)
 * is handed the LAST known destination with no way to tell it from a current one, and
 * they keep painting it. If a future consumer genuinely must not act on stale routing,
 * it needs a fact that does not exist yet — do not assume one is here.
 */
type AppRouteCoordinatorContextValue = {
  /** True once a destination has EVER been published — sticky by design; see the
   *  block above for what that hides and for the fact this type does NOT publish. */
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

  // F804: the server has told us this session is dead (401). Clerk may still
  // report `isSignedIn` — its token cache does not know the server rejected it —
  // so the SERVER'S verdict wins and the user is routed to sign-in. Without this
  // the app kept every screen mounted and every request anonymous.
  const isSessionLapsed = useSessionLapseStore((state) => state.lapsed);
  const isAccountDeleted = useAccountDeletedStore((state) => state.deleted);
  const clearAccountDeleted = useAccountDeletedStore((state) => state.clearDeleted);
  const clearSessionLapse = useSessionLapseStore((state) => state.clearLapse);

  const authStatus: AuthStatus = React.useMemo(() => {
    if (!isLoaded || !sessionListIsLoaded || isRecoveringSession) {
      return 'loading';
    }
    if (isSessionLapsed) {
      return 'signed_out';
    }
    return isSignedIn ? 'signed_in' : 'signed_out';
  }, [isLoaded, isRecoveringSession, isSessionLapsed, isSignedIn, sessionListIsLoaded]);

  // On lapse: drop every cached server answer (they were fetched for a user we
  // can no longer prove) so the sign-in that follows starts clean.
  React.useEffect(() => {
    if (isSessionLapsed) {
      queryClient.clear();
    }
  }, [isSessionLapsed, queryClient]);

  // A takeover belongs to the person it was raised for — see
  // use-clear-on-identity-change. This guard was written INLINE here, so the
  // deleted-account takeover added beside it silently did not get it.
  useClearOnIdentityChange({
    active: isSessionLapsed,
    currentUserId: clerkUserId,
    isSignedIn,
    clear: clearSessionLapse,
  });
  useClearOnIdentityChange({
    active: isAccountDeleted,
    currentUserId: clerkUserId,
    isSignedIn,
    clear: clearAccountDeleted,
  });

  // ── F810: replay the unconfirmed onboarding completion ────────────────────
  // A completion the server never acknowledged is persisted verbatim. On the
  // next authenticated launch we send it again; only a CONFIRMED server write
  // clears it. Before this, that payload — every answer plus the username claim
  // — was destroyed by the very catch block that was supposed to protect the
  // user from a network blip.
  const pendingServerCompletion = useOnboardingStore((state) => state.pendingServerCompletion);
  const clearPendingServerCompletion = useOnboardingStore(
    (state) => state.clearPendingServerCompletion
  );
  const completionReplayInFlightRef = React.useRef(false);
  React.useEffect(() => {
    const decision = decideOnboardingCompletionReplay({
      pending: pendingServerCompletion,
      isSignedIn: authStatus === 'signed_in',
      inFlight: completionReplayInFlightRef.current,
    });
    if (decision.kind !== 'replay') {
      return;
    }
    const { failedAtMs, ...payload } = decision.payload;
    completionReplayInFlightRef.current = true;
    void usersService
      .completeOnboarding({ ...payload, source: 'replay' })
      .then((profile) => {
        // CONFIRMED — and only now is the outbox emptied.
        clearPendingServerCompletion();
        hydrateCompletionFromServer(profile.onboarding);
        logger.info('Replayed a queued onboarding completion', { failedAtMs });
      })
      .catch((error) => {
        // Still unlanded. The payload STAYS: it is the only copy of the answers.
        logger.warn('Onboarding completion replay failed; payload retained', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
      })
      .finally(() => {
        completionReplayInFlightRef.current = false;
      });
  }, [
    authStatus,
    clearPendingServerCompletion,
    hydrateCompletionFromServer,
    pendingServerCompletion,
  ]);

  // F916: A CACHE WRITE IS KEYED BY THE IDENTITY IT WAS FETCHED FOR.
  //
  // This effect used to depend on `[authStatus, hydrateCompletionFromServer]` and read
  // `clerkUserId` out of the enclosing scope. On a USER SWITCH where `authStatus` stays
  // 'signed_in' throughout — a Clerk `setActive` to a different session, which this very
  // file drives — the effect did not re-run at all, and an in-flight `getMe()` resolved
  // into a `.then` that wrote the NEW user's access payload under whatever `clerkUserId`
  // happened to be current. The access cache is the paywall routing axis, so a mis-keyed
  // write routes the wrong user. Two halves, both required:
  //   (1) `clerkUserId` is a DEPENDENCY — a user change re-runs the fetch, which is the
  //       correct behaviour independent of the bug;
  //   (2) the id is CAPTURED at request time and the `.then` writes under the id it
  //       asked for, so even a request that outlives its own effect cannot key its
  //       result to somebody else.
  React.useEffect(() => {
    if (authStatus !== 'signed_in') {
      hasResolvedSignedInProfileRef.current = false;
      setServerOnboardingProfile(null);
      setHasResolvedSignedInProfile(authStatus === 'signed_out');
      return;
    }

    const requestedForClerkUserId = clerkUserId;
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
          queryClient.setQueryData(accessQueryKey(requestedForClerkUserId), profile.access);
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
  }, [authStatus, clerkUserId, hydrateCompletionFromServer, queryClient]);

  React.useEffect(() => {
    if (
      authStatus !== 'signed_in' ||
      onboardingStatus !== 'completed' ||
      onboardingSyncInFlightRef.current ||
      serverOnboardingProfile?.status === 'completed' ||
      // D40: NEVER race the outbox. This mirror sends `answers: {}` — it
      // exists only to tell the server "this device already finished", and it
      // has nothing to say about WHAT was answered. An anonymous completer's
      // answers now ride the pending payload above, so while one is queued
      // this effect must stay silent: firing it would overwrite the answers
      // with an empty document, which is the loss it was meant to prevent.
      pendingServerCompletion != null
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
    pendingServerCompletion,
    serverOnboardingProfile?.status,
  ]);

  const effectiveOnboardingStatus = React.useMemo(() => {
    if (serverOnboardingProfile?.status === 'completed' || onboardingStatus === 'completed') {
      return 'completed' as const;
    }
    return onboardingStatus;
  }, [onboardingStatus, serverOnboardingProfile?.status]);

  // F4501: the access axis is one of the facts readiness AWAITS now, not a fifth
  // fact read after readiness has already declared the route trustworthy. The
  // composition and the destination both live in app-route-destination.ts, where
  // they are pure and specable (this package's jest lane cannot render).
  const isReady = resolveAppRouteReadiness({
    isOnboardingHydrated,
    isInitialIntentResolved,
    authStatus,
    hasResolvedSignedInProfile,
    accessIsLoading: access.isLoading,
  });

  const routeState = React.useMemo<AppRouteState | null>(() => {
    if (!isReady) {
      return null;
    }
    const destination = resolveAppRouteDestination({
      isPerfScenarioNavigationBypassActive,
      onboardingStatus: effectiveOnboardingStatus,
      authStatus,
      isAccountDeleted,
      access: {
        isLoading: access.isLoading,
        isKnown: access.isKnown,
        enforced: access.enforced,
        active: access.active,
      },
    });
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
    isAccountDeleted,
    deferredIntent,
    effectiveOnboardingStatus,
    isPerfScenarioNavigationBypassActive,
    isReady,
    access.isLoading,
    access.isKnown,
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
  // Sticky-ready: see the block above the context type for why, and for the fact this
  // hides. `stableRouteState` + `areRouteStatesEqual` exist to serve exactly this.
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
