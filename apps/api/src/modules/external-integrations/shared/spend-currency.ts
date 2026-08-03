/**
 * TWO CURRENCIES, AND THE ONE LEGAL EXCHANGE BETWEEN THEM.
 *
 * `cost-reconcile` publishes a billed/ledger ratio per service, because our
 * meter is not the bill: Gemini is measurably ~1.7x under-metered. The ratio
 * was applied in exactly one place — grossing an ESTIMATE for owner approval —
 * while every mechanism that decides WHEN TO STOP counted raw ledger dollars.
 * A campaign was therefore MINTED in billed dollars and DRAINED in ledger
 * dollars: an $82 envelope spent ~$139 billed before it registered as
 * breached, and the "3x" catastrophe backstop was really ~5.1x.
 *
 * A test used to scan the call sites for the string `reconciliation?.gross`.
 * That is the wrong level: both figures are `number`, so nothing stopped the
 * next author from passing the wrong one, and the scanner could only notice
 * afterwards — if its regex still matched. Brands make the two currencies
 * different TYPES. A ceiling that counts money now demands `BilledMicros`, and
 * the only function that produces one from a ledger figure is the multiplier's
 * `gross()`.
 *
 * The brands are erased at runtime — this is a compile-time distinction with
 * zero cost in the metering hot path.
 */

declare const CURRENCY: unique symbol;

/** What our meter counted. Never a ceiling; never a campaign drain. */
export type LedgerMicros = number & { readonly [CURRENCY]: 'ledger' };

/** What the vendor actually charges. The only currency a ceiling may count. */
export type BilledMicros = number & { readonly [CURRENCY]: 'billed' };

/** Tag a figure our own pricing tables computed. */
export function ledgerMicros(value: number): LedgerMicros {
  return value as LedgerMicros;
}

/**
 * Re-tag a billed figure ROUND-TRIPPED through storage — a campaign's
 * `spentMicros` column, replayed into its pool at boot or on re-registration.
 * It was billed when it was written; reading it back does not change that.
 *
 * This is the only other way to obtain `BilledMicros`, and it is deliberately
 * named after its narrow justification so a new call site has to argue for it.
 */
export function billedMicrosFromStore(value: number): BilledMicros {
  return value as BilledMicros;
}

/**
 * Scale a billed figure by a dimensionless factor (a safety multiple, a
 * growth clamp). Multiplication erases the brand, so without this the only
 * way to keep a derived CEILING in billed micros would be a bare cast at each
 * arithmetic site — which is how a ledger figure ends up governing a billed
 * counter in the first place.
 */
export function scaleBilled(
  billed: BilledMicros,
  factor: number,
): BilledMicros {
  return Math.round(billed * factor) as BilledMicros;
}

/**
 * The vendors we meter. Naming the set here rather than on `UsageEvent` keeps
 * the currency module free of a dependency on the ledger — and a drain has to
 * name the service whose ratio applies, so this is where the set belongs.
 */
export type MeteredService = 'gemini' | 'google_places' | 'tomtom';
