/**
 * THE VENDOR MONTHLY-CAP DETECTOR, AND A DETECTOR FOR ITS OWN ROT (F118/D12).
 *
 * When AI Studio's monthly SPENDING cap is hit, Google returns a 429 whose
 * only distinguishing signal is PROSE. There is genuinely no structured
 * marker — the envelope is an ordinary RESOURCE_EXHAUSTED — so the substring
 * match STAYS. It is not a shortcut; it is the whole signal the vendor gives.
 *
 * What the substring cannot do is notice when Google rewords it. That
 * failure is silent and expensive: the branch stops firing, the error
 * classifies as a generic 429, LLMRateLimitError(60s) comes back, and
 * SmartLLMProcessor sleeps and retries FOREVER against a hard vendor cap —
 * exactly the retry storm the poison exists to prevent.
 *
 * So the rot gets its own detector, and it is STRUCTURAL, not a threshold.
 * There is no "after N consecutive failures" constant here, because there is
 * no measurement behind any such number. The trigger is a CONTRADICTION, and
 * a contradiction is wrong the first time it happens: a 429 whose payload
 * describes a MONTH-scoped quota, while the prose matcher declined to poison
 * the spend pool. Those two statements cannot both be right. One alert, on
 * first occurrence.
 */

/** The prose Google returns today (verified against the live 429 body). */
const VENDOR_MONTHLY_CAP_PHRASE = 'monthly spending cap';

/**
 * Does this error message carry the vendor's monthly-spending-cap prose?
 * The ONE place that string lives.
 */
export function isVendorMonthlyCapError(errorMessage: string): boolean {
  return errorMessage.includes(VENDOR_MONTHLY_CAP_PHRASE);
}

/**
 * Does this 429's structured payload describe a MONTH-scoped quota?
 *
 * Reads the quota metric / subject Google puts in google.rpc.ErrorInfo and
 * QuotaFailure, plus the provider status message. Per-minute and per-day
 * quotas — the ordinary, transient, retryable ones — do not match; only the
 * monthly grain does, and monthly grain on this API means the billing cap.
 */
export function carriesMonthlyQuotaShape(
  signals: Array<string | undefined>,
): boolean {
  const text = signals
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.includes('per_month') ||
    text.includes('permonth') ||
    text.includes('per month') ||
    text.includes('monthly') ||
    text.includes('spending cap') ||
    text.includes('spend cap')
  );
}

/**
 * THE ROT ALERT. Returns true when the payload says "month-scoped quota"
 * while the prose matcher said "not a cap" — i.e. the detector above has
 * most likely been reworded out from under us.
 */
export function vendorCapDetectorLooksRotted(input: {
  errorMessage: string;
  quotaMetric?: string;
  providerStatus?: string;
  providerMessage?: string;
}): boolean {
  if (isVendorMonthlyCapError(input.errorMessage)) {
    return false; // The detector fired; the pool got poisoned. Nothing to say.
  }
  return carriesMonthlyQuotaShape([
    input.quotaMetric,
    input.providerStatus,
    input.providerMessage,
  ]);
}
