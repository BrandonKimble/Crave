import { createHmac } from 'crypto';
import {
  computeIpAuditHmacs,
  expandIpv6,
  hmacDeviceKey,
  resetIpAuditHmacWarnLatch,
} from './audit-hmac';

/**
 * RED-able checks on the audit-hmac canonicalization contract: every textual
 * spelling of one address must produce the SAME hmac (equality joins are
 * the entire point — a spelling-sensitive hash permanently corrupts the
 * forever-ledger's joins), different /48s must differ, and absent env/input
 * must yield nulls, never fakes.
 */

const KEY = 'test-audit-key';
const hmac = (value: string): string =>
  createHmac('sha256', KEY).update(value).digest('hex');

describe('audit-hmac', () => {
  beforeEach(() => {
    process.env.SIGNAL_AUDIT_HMAC_KEY = KEY;
    resetIpAuditHmacWarnLatch();
  });
  afterAll(() => {
    delete process.env.SIGNAL_AUDIT_HMAC_KEY;
  });

  describe('expandIpv6', () => {
    it('expands :: to 8 zero-padded groups, lowercased', () => {
      expect(expandIpv6('2001:DB8::1')).toBe(
        '2001:0db8:0000:0000:0000:0000:0000:0001',
      );
      expect(expandIpv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
      expect(expandIpv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
    });

    it('rejects malformed input', () => {
      expect(expandIpv6('not-an-ip')).toBeNull();
      expect(expandIpv6('1:2:3')).toBeNull(); // too few groups, no ::
      expect(expandIpv6('1::2::3')).toBeNull(); // double ::
      expect(expandIpv6('1:2:3:4:5:6:7:8:9')).toBeNull(); // too many
      expect(expandIpv6('12345::1')).toBeNull(); // >4 hex digits
    });
  });

  describe('computeIpAuditHmacs — IPv6 canonicalization', () => {
    it('all spellings of one v6 address share ipHmac AND subnet hmac', () => {
      const compressed = computeIpAuditHmacs('2001:db8::1');
      const expanded = computeIpAuditHmacs(
        '2001:0db8:0000:0000:0000:0000:0000:0001',
      );
      const uppercase = computeIpAuditHmacs('2001:DB8::1');
      expect(compressed).not.toBeNull();
      expect(expanded).toEqual(compressed);
      expect(uppercase).toEqual(compressed);
    });

    it('different /48s produce different subnet hmacs', () => {
      const a = computeIpAuditHmacs('2001:db8:1::1');
      const b = computeIpAuditHmacs('2001:db8:2::1');
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a?.ipSubnetHmac).not.toBe(b?.ipSubnetHmac);
    });

    it('hashes the fully-expanded canonical form (not the raw spelling)', () => {
      expect(computeIpAuditHmacs('2001:db8::1')?.ipHmac).toBe(
        hmac('2001:0db8:0000:0000:0000:0000:0000:0001'),
      );
      expect(computeIpAuditHmacs('2001:db8::1')?.ipSubnetHmac).toBe(
        hmac('2001:0db8:0000'),
      );
    });
  });

  describe('computeIpAuditHmacs — IPv4 path unchanged', () => {
    it('hashes the dotted quad and its /24 directly', () => {
      expect(computeIpAuditHmacs('1.2.3.4')).toEqual({
        ipHmac: hmac('1.2.3.4'),
        ipSubnetHmac: hmac('1.2.3'),
      });
    });

    it('unwraps v4-mapped-v6 to the same hmacs as the plain v4', () => {
      expect(computeIpAuditHmacs('::ffff:1.2.3.4')).toEqual(
        computeIpAuditHmacs('1.2.3.4'),
      );
    });
  });

  describe('absent env/input → nulls', () => {
    it('returns null and warns once when SIGNAL_AUDIT_HMAC_KEY is unset', () => {
      delete process.env.SIGNAL_AUDIT_HMAC_KEY;
      const warn = jest.fn();
      expect(computeIpAuditHmacs('1.2.3.4', warn)).toBeNull();
      expect(hmacDeviceKey('device-1', warn)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('returns null for absent or unparseable ip', () => {
      expect(computeIpAuditHmacs(null)).toBeNull();
      expect(computeIpAuditHmacs('')).toBeNull();
      expect(computeIpAuditHmacs('garbage')).toBeNull();
    });
  });

  describe('hmacDeviceKey', () => {
    it('is deterministic (equality joins preserved) and key-dependent', () => {
      expect(hmacDeviceKey('device-abc')).toBe(hmac('device-abc'));
      expect(hmacDeviceKey('device-abc')).toBe(hmacDeviceKey('device-abc'));
      expect(hmacDeviceKey('device-abc')).not.toBe(hmacDeviceKey('device-x'));
    });

    it('returns null for absent input', () => {
      expect(hmacDeviceKey(null)).toBeNull();
      expect(hmacDeviceKey(undefined)).toBeNull();
    });
  });
});
