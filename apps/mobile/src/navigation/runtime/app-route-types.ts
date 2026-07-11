import type { MainSearchIntent } from '../../types/navigation';
import type { EntityRefAction } from './entity-ref-action-policy';
import { isPerfScenarioUrl } from '../../perf/perf-scenario-deep-link';
import { parseDesireLink } from './desire-url-codec';

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
  // S-E (addressability): a /l/<shareSlug> share link — resolution is ASYNC (getShared),
  // so the intent carries the slug and the consumer resolves it into a listWorld action.
  | { type: 'sharedList'; shareSlug: string; joinIntent?: boolean }
  // S-E: /q/<query> and /s/<tab> — the URL-addressable search desires.
  | {
      type: 'searchDesire';
      desire:
        | { kind: 'natural'; query: string }
        | { kind: 'shortcut'; shortcutTab: 'dishes' | 'restaurants' };
    }
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

  // S-E: THE codec is the one parser (desire-url-codec.ts) — this shim maps its vocabulary
  // onto the LaunchIntent channel. (The old inline parse also had a real bug: for crave://
  // links the first segment lands in URL.hostname, so the pathname-only restaurant match
  // never fired on real scheme links — the codec folds hostname in.)
  const link = parseDesireLink(url);
  switch (link.kind) {
    case 'entityAction':
      return { type: 'entityAction', action: link.action };
    case 'sharedList':
      return {
        type: 'sharedList',
        shareSlug: link.shareSlug,
        joinIntent: link.joinIntent === true,
      };
    case 'polls':
      return { type: 'polls', marketKey: link.marketKey ?? null, pollId: link.pollId ?? null };
    case 'naturalSearch':
      return { type: 'searchDesire', desire: { kind: 'natural', query: link.query } };
    case 'shortcutSearch':
      return { type: 'searchDesire', desire: { kind: 'shortcut', shortcutTab: link.shortcutTab } };
    case 'none':
      return { type: 'external', rawUrl: url };
  }
};
