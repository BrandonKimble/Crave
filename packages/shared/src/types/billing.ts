/**
 * WHICH RAIL BILLS A SUBSCRIBER — the wire union, declared ONCE (F9802).
 *
 * It was written out twice: `BillingRail` in the API's identity/billing-rail.ts
 * and, independently, as a string literal union on the mobile `AccessSummary`.
 * Two hand-kept copies of a wire enum is a silent-divergence bug waiting on the
 * third rail: the server would start sending a value the client's dispatch has
 * never heard of, and the client would fall through to "no rail" — which routes
 * a paying customer to the paywall. That is exactly the F9801/F9800 failure
 * shape, arriving from a different direction.
 *
 * This package is the seam both apps already share, so the union lives here and
 * each side pins its own declaration to it (`satisfies` on the API side, a
 * direct import on the client). Adding `paypal` is one edit, and the client's
 * dispatch stops compiling until it handles it.
 */
export type BillingRail = 'app_store' | 'web';
