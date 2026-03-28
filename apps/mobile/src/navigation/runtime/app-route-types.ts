import type { MainSearchIntent } from '../../types/navigation';

export type AppRouteDestination = 'onboarding' | 'sign_in' | 'main';

export type LaunchIntent =
  | { type: 'none' }
  | { type: 'restaurant'; restaurantId: string }
  | { type: 'polls'; coverageKey?: string | null; pollId?: string | null }
  | { type: 'search'; searchIntent: MainSearchIntent }
  | { type: 'saved_place'; placeId: string }
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

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const restaurantIndex = segments.findIndex((segment) => segment === 'restaurant');
    if (restaurantIndex >= 0 && segments[restaurantIndex + 1]) {
      return {
        type: 'restaurant',
        restaurantId: segments[restaurantIndex + 1],
      };
    }

    const savedPlaceIndex = segments.findIndex((segment) => segment === 'saved-place');
    if (savedPlaceIndex >= 0 && segments[savedPlaceIndex + 1]) {
      return {
        type: 'saved_place',
        placeId: segments[savedPlaceIndex + 1],
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
