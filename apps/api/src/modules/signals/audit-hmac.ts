import { createHmac } from 'crypto';

/**
 * Vote-time IP audit HMACs (plans/vote-integrity-ladder.md, irreversibility
 * rung): the poll_vote signal meta carries HMAC-SHA256(ip) and
 * HMAC-SHA256(subnet) keyed by SIGNAL_AUDIT_HMAC_KEY — equality-joinable for
 * clustering ("same subnet, same poll, same choice, minutes apart"), never
 * reversible. THE RAW IP NEVER ENTERS THE FOREVER-LEDGER. When the key env is
 * absent the fields are OMITTED (no fake values, no-fake-estimates law) and a
 * one-time warn fires via the caller-supplied logger.
 */

export interface IpAuditHmacs {
  ipHmac: string;
  ipSubnetHmac: string;
}

// §16 class: published-convention constants, not tuned values — /24 is the
// standard IPv4 "same household/NAT" aggregation grain; /48 is the standard
// IPv6 site-assignment grain. Equality-join semantics only; no read changes
// meaning if the industry grain ever shifts.
const IPV4_SUBNET_OCTETS = 3; // /24
const IPV6_SUBNET_GROUPS = 3; // /48

let missingKeyWarned = false;

/** Subnet string for equality-joining: v4 → first 3 octets, v6 → first 3
 *  colon groups of the expanded-enough form. Null for unparseable input. */
const subnetOf = (ip: string): string | null => {
  // Fastify may hand back v4-mapped-v6 ("::ffff:1.2.3.4") — unwrap it.
  const unwrapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(unwrapped)) {
    return unwrapped.split('.').slice(0, IPV4_SUBNET_OCTETS).join('.');
  }
  if (unwrapped.includes(':')) {
    const groups = unwrapped.split(':');
    if (groups.length < IPV6_SUBNET_GROUPS) {
      return null;
    }
    return groups.slice(0, IPV6_SUBNET_GROUPS).join(':');
  }
  return null;
};

/**
 * Compute the audit HMAC pair for an IP. Returns null (fields omitted by the
 * caller) when the ip is absent/unparseable or SIGNAL_AUDIT_HMAC_KEY is
 * unset. `warnMissingKey` fires at most once per process.
 */
export const computeIpAuditHmacs = (
  ip: string | null | undefined,
  warnMissingKey?: (message: string) => void,
): IpAuditHmacs | null => {
  if (!ip) {
    return null;
  }
  const key = process.env.SIGNAL_AUDIT_HMAC_KEY;
  if (!key) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      warnMissingKey?.(
        'SIGNAL_AUDIT_HMAC_KEY unset — poll_vote ip audit hmacs omitted',
      );
    }
    return null;
  }
  const subnet = subnetOf(ip.trim());
  if (!subnet) {
    return null;
  }
  const hmac = (value: string): string =>
    createHmac('sha256', key).update(value).digest('hex');
  return { ipHmac: hmac(ip.trim()), ipSubnetHmac: hmac(subnet) };
};

/** Test seam: reset the one-time warn latch. */
export const resetIpAuditHmacWarnLatch = (): void => {
  missingKeyWarned = false;
};
