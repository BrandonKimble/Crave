/**
 * TRANSLATING A VENDOR'S ENTITLEMENT VOCABULARY INTO OURS.
 *
 * WHY THIS IS NOT A `Map.get(x) ?? x` (rederived 2026-08-02; owner-ratified
 * 2026-08-03, F101/D1).
 *
 * The ledger is denominated in OUR entitlement codes. RevenueCat speaks its
 * own. The old translation was `reverseEntitlementMap.get(raw) ?? raw`, so an
 * RC entitlement id that is not in the map silently BECAME our code — and a
 * paid grant was written under vendor vocabulary that `accessVerdict()` never
 * asks about. The customer paid and then got a 403, with nothing anywhere
 * saying why. That is the same error class access-verdict.ts already rederived
 * away one level up: inventing an assertion out of ABSENT information.
 *
 * A vendor id we cannot translate is an UNKNOWN. So translation returns a sum
 * type, and the caller must handle `unknown` — there is no fallback that turns
 * it into a code.
 *
 * THE MAP HAS NO DEFAULT. `REVENUECAT_ENTITLEMENT_MAP` previously defaulted to
 * a guessed pair, `'premium:premium_monthly'` — a value nobody chose, which
 * made the silent-passthrough path *likely* rather than hypothetical. Under
 * the no-fake-estimates law, unconfigured is unconfigured: an unset map means
 * NOTHING translates, so every RC event fails loudly and RevenueCat redelivers
 * once the owner supplies the real map. A guess that mints grants is strictly
 * worse than a refusal that retries.
 *
 * MALFORMED REFUSES BOOT. A misconfigured money map is not a runnable state,
 * and the failure it produces at runtime (grants under the wrong code) is
 * invisible. Boot is where it must be found.
 *
 * THE RESIDUAL IS NOW RULED (owner 2026-08-03, D1-residual): PREMIUM IS THE
 * ONLY PRODUCT, EVER. `accessVerdict()` asks only about the DEFAULT
 * entitlement code, so a map entry whose `ourCode` is anything else would mint
 * a live, PAID grant under a code no access check consults — the same "paid
 * and then got a 403" failure the passthrough fix above closed, arriving by
 * the other door. There is no second product to gate on, so an unconsulted
 * code is not a feature awaiting a paywall; it is a typo. Boot REFUSES it.
 *
 * That is why `entitlementCodes` is now, necessarily, the single-element set
 * `{defaultCode}` — it is kept as a set rather than collapsed to a string
 * because it is the CLOSED LEDGER VOCABULARY, and the day a second product
 * exists the refusal below is the one place that has to be re-decided, with
 * `accessVerdict()` in the same hand.
 */

/** Our entitlement code, once translation has succeeded. */
export type RevenueCatTranslation =
  | { readonly kind: 'mapped'; readonly entitlementCode: string }
  | { readonly kind: 'unknown'; readonly vendorEntitlementId: string };

export class MalformedEntitlementMapError extends Error {}

export class RevenueCatEntitlementMap {
  /**
   * The CLOSED set of entitlement codes this deployment may write to the
   * ledger: the paywall's default code, plus every code the owner declared in
   * the map. Derived from the two config facts — never invented here.
   */
  readonly entitlementCodes: ReadonlySet<string>;

  private constructor(
    private readonly byVendorId: ReadonlyMap<string, string>,
    entitlementCodes: ReadonlySet<string>,
  ) {
    this.entitlementCodes = entitlementCodes;
  }

  /**
   * Parse `REVENUECAT_ENTITLEMENT_MAP` — `'ourCode:rcEntitlementId,...'`.
   *
   * STRICT: every comma-separated entry must be exactly two non-empty
   * colon-separated halves. Anything else throws, naming the entry. Unset or
   * empty is legal and means "nothing is mapped" (see the header) — it is the
   * one absence that is a decision rather than a typo.
   */
  static parse(
    raw: string | undefined,
    defaultCode: string,
  ): RevenueCatEntitlementMap {
    const byVendorId = new Map<string, string>();
    const codes = new Set<string>([defaultCode]);

    for (const entry of (raw ?? '').split(',')) {
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      const parts = trimmed.split(':').map((part) => part.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new MalformedEntitlementMapError(
          `REVENUECAT_ENTITLEMENT_MAP entry ${JSON.stringify(trimmed)} is not ` +
            `'ourCode:revenueCatEntitlementId'. A malformed money map is not a ` +
            `runnable state — fix the env var or unset it entirely.`,
        );
      }
      const [ourCode, vendorId] = parts;
      if (ourCode !== defaultCode) {
        // D1-residual, owner-ruled 2026-08-03. See the header: no access check
        // consults any code but the default, so this entry can only produce a
        // paid grant that grants nothing.
        throw new MalformedEntitlementMapError(
          `REVENUECAT_ENTITLEMENT_MAP declares entitlement code ` +
            `${JSON.stringify(ourCode)}, which NO access check consults — ` +
            `accessVerdict() asks only about the default code ` +
            `${JSON.stringify(defaultCode)}. Premium is the only product ` +
            `(owner ruling 2026-08-03), so a grant written under ` +
            `${JSON.stringify(ourCode)} would be paid for and grant nothing. ` +
            `Map ${JSON.stringify(vendorId)} to ${JSON.stringify(defaultCode)}, ` +
            `or teach the paywall the new code first.`,
        );
      }
      // NOTE: there used to be a "one vendor id maps to two of our codes"
      // check here. Under the single-product refusal above every surviving
      // `ourCode` IS `defaultCode`, so that conflict is unreachable — a
      // repeated vendor id can now only repeat the same code. Deleted rather
      // than left as an untestable guard; the ruling makes the refusal above
      // its replacement, and the spec still feeds it the same input.
      byVendorId.set(vendorId, ourCode);
      codes.add(ourCode);
    }

    return new RevenueCatEntitlementMap(byVendorId, codes);
  }

  /** mapped | unknown. There is deliberately no third answer and no fallback. */
  translate(vendorEntitlementId: string): RevenueCatTranslation {
    const entitlementCode = this.byVendorId.get(vendorEntitlementId);
    return entitlementCode === undefined
      ? { kind: 'unknown', vendorEntitlementId }
      : { kind: 'mapped', entitlementCode };
  }

  /** Is this one of the codes this deployment is allowed to write? */
  isKnownCode(code: string): boolean {
    return this.entitlementCodes.has(code);
  }
}
