import { isNonRoutableIp } from './ip-location.service';

/**
 * F362. The old hand-rolled prefix list was a curated guess at an IANA fact.
 * Every case marked MISSED below is one it got WRONG — and each wrong answer
 * sends an address that cannot possibly be geolocated to a paid third-party
 * vendor. These are the fixtures; the old implementation returns false for
 * every one of them.
 */
describe('isNonRoutableIp — the IANA registries, not a curated prefix list', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.4.5.6', 'loopback is a /8, not one address — MISSED'],
    ['10.1.2.3', 'RFC 1918'],
    ['192.168.1.1', 'RFC 1918'],
    ['172.16.0.1', 'RFC 1918 lower edge'],
    ['172.31.255.255', 'RFC 1918 upper edge'],
    ['169.254.10.10', 'link-local — MISSED'],
    ['100.64.0.1', 'carrier-grade NAT — MISSED'],
    ['100.127.255.255', 'CGNAT upper edge — MISSED'],
    ['0.0.0.0', 'this network — MISSED'],
    ['224.0.0.1', 'multicast — MISSED'],
    ['255.255.255.255', 'broadcast — MISSED'],
    ['192.0.2.5', 'documentation TEST-NET-1 — MISSED'],
    ['198.51.100.5', 'documentation TEST-NET-2 — MISSED'],
    ['203.0.113.5', 'documentation TEST-NET-3 — MISSED'],
    ['::1', 'IPv6 loopback'],
    ['fd00::1', 'IPv6 unique-local'],
    ['FD00::1', 'unique-local in UPPER CASE — MISSED'],
    ['fe80::1', 'IPv6 link-local — MISSED'],
    ['ff02::1', 'IPv6 multicast — MISSED'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped RFC 1918 — MISSED'],
    ['::ffff:192.168.1.1', 'IPv4-mapped RFC 1918 — MISSED'],
    ['not-an-ip', 'unparseable is never worth a vendor call — MISSED'],
    ['', 'empty is never worth a vendor call'],
  ])('%s is non-routable (%s)', (ip) => {
    expect(isNonRoutableIp(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'Google public DNS'],
    ['1.1.1.1', 'Cloudflare'],
    ['172.15.0.1', 'just BELOW the 172.16/12 block'],
    ['172.32.0.1', 'just ABOVE the 172.16/12 block'],
    ['100.63.255.255', 'just below CGNAT'],
    ['100.128.0.0', 'just above CGNAT'],
    ['169.253.0.1', 'just below link-local'],
    ['223.255.255.255', 'just below multicast'],
    ['2001:4860:4860::8888', 'Google public DNS over IPv6'],
    ['2001:db9::1', 'just outside the documentation block'],
    ['fbff::1', 'just below fc00::/7'],
    ['fe7f::1', 'just below fe80::/10'],
    ['::ffff:8.8.8.8', 'IPv4-mapped PUBLIC address is still routable'],
  ])('%s is routable (%s)', (ip) => {
    expect(isNonRoutableIp(ip)).toBe(false);
  });
});
