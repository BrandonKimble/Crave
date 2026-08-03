import { createHash } from 'node:crypto';

/**
 * THE IDEMPOTENCY KEY IS THE EVENT'S IDENTITY — NEVER A TIMESTAMP.
 *
 * The exactly-once check on billing_event_log keys on this value. The previous
 * shape ended `... || `${Date.now()}``, which is not an identity: it is a
 * GUARANTEE OF NON-IDENTITY. Every redelivery of an id-less event minted a
 * fresh key, the replay lookup could never match, and RevenueCat's retries
 * re-applied the event — duplicate grants on the money path.
 *
 * So: the vendor's own event id when it sends one (it does), then its
 * transaction ids, and where a payload genuinely carries none of those, a
 * STABLE CONTENT HASH of the canonical payload fields. A content hash is a
 * real identity: the same delivery hashes the same way every time, so a replay
 * is recognised; two genuinely different events differ in at least one of
 * these fields and do not collide.
 *
 * Deliberately excluded from the hash: nothing time-of-receipt, nothing
 * generated locally. Every input is a field the VENDOR sent.
 */

/** The fields that make a RevenueCat event what it is. */
const CANONICAL_FIELDS = [
  'type',
  'app_user_id',
  'original_app_user_id',
  'product_id',
  'entitlement_id',
  'entitlement_ids',
  'period_type',
  'purchased_at_ms',
  'expiration_at_ms',
  'event_timestamp_ms',
  'store',
  'environment',
  'price',
  'currency',
] as const;

/** Stable JSON: object keys sorted, so key order in the payload cannot change
 *  the hash of an otherwise identical event. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = canonicalize(source[key]);
        return out;
      }, {});
  }
  return value;
}

/**
 * The idempotency key for one RevenueCat event delivery.
 *
 * Returns the vendor id when present; otherwise a `content:<sha256>` key
 * derived only from vendor-sent fields, so the SAME delivery always produces
 * the SAME key.
 */
export function revenueCatEventIdentity(
  event: Record<string, unknown>,
): string {
  const vendorId =
    asId(event.id) ||
    asId(event.original_transaction_id) ||
    asId(event.transaction_id);
  if (vendorId) return vendorId;

  const canonical: Record<string, unknown> = {};
  for (const field of CANONICAL_FIELDS) {
    if (event[field] !== undefined)
      canonical[field] = canonicalize(event[field]);
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
  return `content:${digest}`;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
