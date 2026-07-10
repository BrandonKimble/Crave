import type { MainSearchIntent } from '../../types/navigation';
import type { EntityRefAction } from './entity-ref-action-policy';
import { isPerfScenarioUrl } from '../../perf/perf-scenario-deep-link';

export type AppRouteDestination = 'onboarding' | 'sign_in' | 'paywall' | 'main';

export type LaunchIntent =
  | { type: 'none' }
  // S-D.4 (plans/s-d-one-desire-entitylink.md): the search-shaped launches (restaurant /
  // entity / favorites-list) collapse into ONE member carrying the EntityRefAction — the
  // SAME action vocabulary resolveEntityRefAction produces. The channel exists because the
  // search runtime bus is hook-scoped (dispatchers live outside the search screen's tree);
  // the VALUE no longer duplicates that vocabulary. A restaurant deep link constructs
  // restaurantWorld with an empty name (the consumer's fetch fallback resolves it).
  | { type: 'entityAction'; action: EntityRefAction }
  | { type: 'polls'; marketKey?: string | null; pollId?: string | null }
  | { type: 'search'; searchIntent: MainSearchIntent }
  | { type: 'external'; rawUrl: string };

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export type OnboardingRouteStatus = 'not_started' | 'in_progress' | 'completed';

export type AppRouteState = {
  destination: AppRouteDestination;
  authStatus: AuthStatus;
  onboardingStatus: OnboardingRouteStatus;
  launchIntent: LaunchIntent;
  deferredIntent: LaunchIntent | null;
};

export const NO_LAUNCH_INTENT: LaunchIntent = { type: 'none' };

export const parseLaunchIntentFromUrl = (url: string | null): LaunchIntent => {
  if (!url) {
    return NO_LAUNCH_INTENT;
  }

  if (isPerfScenarioUrl(url)) {
    return NO_LAUNCH_INTENT;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const restaurantIndex = segments.findIndex((segment) => segment === 'restaurant');
    if (restaurantIndex >= 0 && segments[restaurantIndex + 1]) {
      return {
        type: 'entityAction',
        action: {
          kind: 'restaurantWorld',
          restaurantId: segments[restaurantIndex + 1],
          restaurantName: '',
        },
      };
    }

    return {
      type: 'external',
      rawUrl: url,
    };
  } catch {
    return {
      type: 'external',
      rawUrl: url,
    };
  }
};
