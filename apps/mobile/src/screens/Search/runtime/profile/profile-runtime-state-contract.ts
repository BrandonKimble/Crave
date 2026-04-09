import type { RestaurantResult } from '../../../../types';
import type { SearchRuntimeProfileShellState } from '../shared/search-runtime-bus';
import type { ProfileAutoOpenRuntimeState } from './profile-auto-open-runtime-state';
import type { ProfileCloseFinalizationRuntimeState } from './profile-close-finalization-runtime-state';
import type { ProfileCloseForegroundRuntimeState } from './profile-close-foreground-runtime-state';
import type { ProfileClosePolicyRuntimeState } from './profile-close-policy-runtime-state';
import type { ProfileFocusRuntimeState } from './profile-focus-runtime-state';
import type { ProfileShellStatePublisher } from './profile-shell-state-publisher';
import type { ProfileTransitionRuntimeState } from './profile-transition-runtime-state';

export type ProfileCloseRuntimeState = {
  policyRuntimeState: ProfileClosePolicyRuntimeState;
  foregroundRuntimeState: ProfileCloseForegroundRuntimeState;
  finalizationRuntimeState: ProfileCloseFinalizationRuntimeState;
};

export type ProfileHydrationRuntimeState = {
  getRestaurantProfileRequestSeq: () => number;
  setRestaurantProfileRequestSeq: (requestSeq: number) => void;
  cancelActiveHydrationIntent: (
    reason:
      | 'superseded_profile_hydration_intent'
      | 'profile_hydration_cancelled_on_overlay_dismiss',
    context?: {
      nextRequestSeq?: number;
      nextRestaurantId?: string | null;
    }
  ) => void;
  seedRestaurantProfile: (restaurant: RestaurantResult, queryLabel: string) => void;
  hydrateRestaurantProfileById: (restaurantId: string) => void;
};

export type ProfileRuntimeStateOwner = {
  shellRuntimeState: {
    profileShellState: SearchRuntimeProfileShellState;
    setProfileCameraPadding: ProfileShellStatePublisher['setProfileCameraPadding'];
  };
  transitionRuntimeState: ProfileTransitionRuntimeState;
  closeRuntimeState: ProfileCloseRuntimeState;
  hydrationRuntime: ProfileHydrationRuntimeState;
  focusRuntime: ProfileFocusRuntimeState;
  autoOpenRuntime: ProfileAutoOpenRuntimeState;
};
