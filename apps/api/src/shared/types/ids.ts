/**
 * BRANDED IDS — a domain concept the type system can tell apart.
 *
 * WHY (derived from scratch, 2026-08-02). Every id in this codebase is a bare
 * `string`, so a signature like `(restaurantId: string, placeId: string)`
 * accepts them in either order and type-checks perfectly. A transposition is
 * silent, and the values are opaque uuids so it survives a code review too.
 * Measured across apps/api: 93 signatures take two or more distinct id
 * parameters.
 *
 * A brand costs nothing at runtime — it is erased — and turns that whole class
 * into a compile error.
 *
 *   function enrich(restaurantId: RestaurantId, placeId: PlaceId) { ... }
 *   enrich(placeId, restaurantId);   // <- now a type error
 *
 * WHAT BRANDING CANNOT DO, and this is the important half. It only separates
 * DIFFERENT entity types. Roughly a quarter of those 93 signatures take two
 * ids of the SAME type — `blockUser(blockerUserId, blockedUserId)`,
 * `mergeRestaurantEvents(canonicalId, duplicateId)`,
 * `getOrCreateConversation(viewerUserId, otherUserId)` — and both sides are
 * the same brand, so the compiler cannot help. Those are the MORE dangerous
 * ones (blocking the wrong person, merging into the wrong survivor) and they
 * need a different fix: a named object parameter, so order stops carrying
 * meaning at all. See user-block.service.ts for that shape.
 *
 * Two mechanisms, because there are two distinct failure modes.
 *
 * ADOPTION. Branding every id at once would touch thousands of call sites and
 * collide with everything in flight, for no extra safety: transposition only
 * happens where two ids sit ADJACENT in a signature. Brand at those
 * boundaries; leave interior plumbing alone. `asId` is the single documented
 * door from an unbranded string.
 */

declare const BRAND: unique symbol;

export type Id<TEntity extends string> = string & {
  readonly [BRAND]: TEntity;
};

export type UserId = Id<'user'>;
export type RestaurantId = Id<'restaurant'>;
export type FoodId = Id<'food'>;
export type EntityId = Id<'entity'>;
export type PlaceId = Id<'place'>;
export type LocationId = Id<'location'>;
export type ConnectionId = Id<'connection'>;
export type PollId = Id<'poll'>;
export type ListId = Id<'list'>;
/** A VENDOR's identifier (Google place id, TomTom geometry id) — deliberately
 *  distinct from our own PlaceId, which is the pair most likely to transpose. */
export type ProviderPlaceId = Id<'provider_place'>;

/**
 * The ONE door from an unbranded string into a branded id.
 *
 * Deliberately explicit rather than implicit: at every boundary where a raw
 * string becomes a typed id — a route param, a DB row, a vendor payload —
 * someone has to say which KIND it is, and that statement is greppable.
 */
export function asId<TEntity extends string>(value: string): Id<TEntity> {
  return value as Id<TEntity>;
}
