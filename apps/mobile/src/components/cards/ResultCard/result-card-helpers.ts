import type { RestaurantResult } from '../../../types';

// F3719 — the Call-pill phone-number fallback was written twice (RestaurantResultCard
// and DishResultCard), unnamed, once per card. CardActionPillRow documents "Null/absent
// = no Call pill"; the DERIVATION of that null is one named function, not a copy-pasted
// expression the two cards must keep in lockstep by hand.
export const resolveRestaurantPhoneNumber = (
  restaurant: Pick<RestaurantResult, 'displayLocation' | 'locations'> | null | undefined
): string | null =>
  restaurant?.displayLocation?.phoneNumber ??
  restaurant?.locations?.find((location) => location.phoneNumber != null)?.phoneNumber ??
  null;
