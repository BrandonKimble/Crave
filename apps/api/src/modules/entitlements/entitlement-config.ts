import type { ConfigService } from '@nestjs/config';

/**
 * ONE HOME FOR THE TWO FACTS THE PAYWALL RUNS ON.
 *
 * Both of these used to be re-derived at each call site:
 *
 *  - ENTITLEMENT_GATING was parsed TWICE, independently — once by the
 *    enforcement interceptor (trim + lowercase + three-value whitelist) and
 *    once by user.service, which re-read process.env to answer
 *    `access.enforced` in the profile payload. Two readers, two parsers, one
 *    truth: the client's paywall routing axis and the server's actual
 *    behaviour could disagree the moment either was edited.
 *
 *  - `|| 'premium'` was written FOUR times. configuration.ts already defaults
 *    `billing.defaultEntitlement`; three services then re-defaulted it
 *    independently, so changing the config fallback left three services
 *    silently disagreeing.
 *
 * A default is a value the OWNER chose once. Repeating it is not
 * defensiveness — it is three more places for it to be wrong. Config is the
 * sole default; everything else reads it through here.
 *
 * NOTE: the VALUES are unchanged. This file deduplicates; it decides nothing.
 */

export type GatingMode = 'off' | 'log' | 'enforce';

/**
 * The paywall rollout switch, read per call (the rollout is a live env flip,
 * not a boot-time constant). Anything that is not `log` or `enforce` — unset,
 * misspelled, empty — is `off`, the safe end.
 */
export function readGatingMode(): GatingMode {
  const mode = process.env.ENTITLEMENT_GATING?.trim().toLowerCase();
  return mode === 'enforce' || mode === 'log' ? mode : 'off';
}

/**
 * The entitlement code the paywall asks about. Throws rather than guessing: a
 * paywall with no entitlement code is not a runnable state, and a guess here
 * is a grant nobody looks at.
 */
export function readDefaultEntitlementCode(config: ConfigService): string {
  const code = config.get<string>('billing.defaultEntitlement');
  if (typeof code === 'string' && code.trim().length > 0) return code.trim();
  throw new Error(
    'billing.defaultEntitlement is not configured. Config owns this default ' +
      '(BILLING_DEFAULT_ENTITLEMENT) — do not re-default it at the call site.',
  );
}
