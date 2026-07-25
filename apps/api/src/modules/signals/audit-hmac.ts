import { createHmac } from 'crypto';

/**
 * Vote-time audit HMACs (plans/vote-integrity-ladder.md, irreversibility
 * rung): the poll_vote signal meta carries HMAC-SHA256(ip),
 * HMAC-SHA256(subnet) and HMAC-SHA256(deviceKey) keyed by
 * SIGNAL_AUDIT_HMAC_KEY — equality-joinable for clustering ("same subnet,
 * same poll, same choice, minutes apart"), never reversible. NEITHER THE RAW
 * IP NOR THE RAW DEVICE KEY EVER ENTERS THE FOREVER-LEDGER (the raw device
 * key lives only in the retention-manageable user_devices table). When the
 * key env is absent the fields are OMITTED (no fake values,
 * no-fake-estimates law) and a one-time warn fires via the caller-supplied
 * logger.
 *
 * IPs are CANONICALIZED before hashing: an HMAC only equality-joins if the
 * same address always hashes to the same bytes, and IPv6 has many textual
 * spellings of one address ("2001:db8::1" ≡ "2001:0DB8:0:0:0:0:0:1"). We
 * hash the fully-expanded lowercase form so every spelling joins.
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
const IPV6_SUBNET_GROUPS = 3; // /48 = first 3 of the 8 expanded groups

// §16 class: protocol facts, not choices — an IPv6 address is 8 groups of
// 16 bits, each at most 4 hex digits.
const IPV6_GROUP_COUNT = 8;
const IPV6_GROUP_HEX_DIGITS = 4;

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_GROUP_RE = /^[0-9a-f]{1,4}$/;

let missingKeyWarned = false;

/**
 * Pure IPv6 expansion: lowercase, "::" expanded to the full 8 groups, every
 * group zero-padded to 4 hex digits ("2001:db8::1" →
 * "2001:0db8:0000:0000:0000:0000:0000:0001"). Returns null for anything
 * that is not a plain 8-group-expressible IPv6 literal (v4-mapped forms are
 * unwrapped to the v4 path by the caller BEFORE this runs).
 */
export const expandIpv6 = (ip: string): string | null => {
  const lower = ip.toLowerCase();
  let groups: string[];
  if (lower.includes('::')) {
    const halves = lower.split('::');
    if (halves.length > 2) {
      return null; // "::" may appear at most once
    }
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves[1] ? halves[1].split(':') : [];
    const fill = IPV6_GROUP_COUNT - head.length - tail.length;
    if (fill < 1) {
      return null;
    }
    groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  } else {
    groups = lower.split(':');
    if (groups.length !== IPV6_GROUP_COUNT) {
      return null;
    }
  }
  if (groups.some((g) => !IPV6_GROUP_RE.test(g))) {
    return null;
  }
  return groups.map((g) => g.padStart(IPV6_GROUP_HEX_DIGITS, '0')).join(':');
};

/** Canonical hashing form + subnet string. v4 → dotted quad unchanged /
 *  first 3 octets; v6 → fully-expanded lowercase form / first 3 EXPANDED
 *  groups (so "2001:db8::1" and "2001:0db8:0:…:1" land in the same /48).
 *  Null for unparseable input. */
const canonicalizeIp = (
  ip: string,
): { canonical: string; subnet: string } | null => {
  const lower = ip.trim().toLowerCase();
  // Fastify may hand back v4-mapped-v6 ("::ffff:1.2.3.4") — unwrap to the
  // v4 path so the mapped and plain spellings of one client join.
  const unwrapped =
    lower.startsWith('::ffff:') && IPV4_RE.test(lower.slice(7))
      ? lower.slice(7)
      : lower;
  if (IPV4_RE.test(unwrapped)) {
    return {
      canonical: unwrapped,
      subnet: unwrapped.split('.').slice(0, IPV4_SUBNET_OCTETS).join('.'),
    };
  }
  if (unwrapped.includes(':')) {
    const expanded = expandIpv6(unwrapped);
    if (!expanded) {
      return null;
    }
    return {
      canonical: expanded,
      subnet: expanded.split(':').slice(0, IPV6_SUBNET_GROUPS).join(':'),
    };
  }
  return null;
};

const hmacWithKey = (key: string, value: string): string =>
  createHmac('sha256', key).update(value).digest('hex');

const auditKeyOrWarn = (
  warnMissingKey?: (message: string) => void,
): string | null => {
  const key = process.env.SIGNAL_AUDIT_HMAC_KEY;
  if (!key) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      warnMissingKey?.(
        'SIGNAL_AUDIT_HMAC_KEY unset — poll_vote audit hmacs omitted',
      );
    }
    return null;
  }
  return key;
};

/**
 * Compute the audit HMAC pair for an IP (hashed in CANONICAL form — see
 * module doc). Returns null (fields omitted by the caller) when the ip is
 * absent/unparseable or SIGNAL_AUDIT_HMAC_KEY is unset. `warnMissingKey`
 * fires at most once per process.
 */
export const computeIpAuditHmacs = (
  ip: string | null | undefined,
  warnMissingKey?: (message: string) => void,
): IpAuditHmacs | null => {
  if (!ip) {
    return null;
  }
  const key = auditKeyOrWarn(warnMissingKey);
  if (!key) {
    return null;
  }
  const canonical = canonicalizeIp(ip);
  if (!canonical) {
    return null;
  }
  return {
    ipHmac: hmacWithKey(key, canonical.canonical),
    ipSubnetHmac: hmacWithKey(key, canonical.subnet),
  };
};

/**
 * HMAC a device key for the forever-ledger (same SIGNAL_AUDIT_HMAC_KEY):
 * the append-only signals ledger must hold NO redactable identifier, and
 * the raw device key is one — it lives only in the retention-manageable
 * user_devices table. The HMAC preserves every equality join (same device
 * → same hmac). Null when input or key is absent.
 */
export const hmacDeviceKey = (
  deviceKey: string | null | undefined,
  warnMissingKey?: (message: string) => void,
): string | null => {
  if (!deviceKey) {
    return null;
  }
  const key = auditKeyOrWarn(warnMissingKey);
  if (!key) {
    return null;
  }
  return hmacWithKey(key, deviceKey);
};

/** Test seam: reset the one-time warn latch. */
export const resetIpAuditHmacWarnLatch = (): void => {
  missingKeyWarned = false;
};
