import { readFileSync } from 'fs';
import { join } from 'path';
import { identityDomain } from './business-identity-rules';

/**
 * canonicalDomain writes are TRUSTED, not merely parsed (red team
 * 2026-08-19). Entity.canonicalDomain is an ownership claim that the
 * domain-first merge and secondary expansion navigate by; before this law,
 * the write sites applied only URL parsing, and 168 entities accumulated
 * aggregator canonical_domains (instagram.com 66, facebook.com 52,
 * toasttab.com 21, …) — each one asserting a brand identity the venue does
 * not own. The mutations pinned here:
 * 1. identityDomain refuses the aggregator classes (the trust authority).
 * 2. No canonicalDomain write site in the enrichment service derives from
 *    bare normalizeWebsiteDomain — every write goes through
 *    trustedIdentityDomain (a source scan, because the defect was exactly
 *    a site that skipped the authority).
 */
describe('canonicalDomain trust law', () => {
  it('identityDomain refuses aggregator/social/ordering domains', () => {
    for (const domain of [
      'instagram.com',
      'facebook.com',
      'toasttab.com',
      'chowbus.com',
      'linktr.ee',
      'clover.com',
      'doordash.com',
      'chimchimnyc.square.site',
      'burrosbarandgrill.wixsite.com',
    ]) {
      expect(identityDomain(domain)).toBeNull();
    }
    expect(identityDomain('franklinbbq.com')).toBe('franklinbbq.com');
    expect(identityDomain('uchirestaurants.com')).toBe('uchirestaurants.com');
  });

  it('every canonicalDomain derivation in the enrichment service goes through the trust authority', () => {
    const source = readFileSync(
      join(__dirname, 'restaurant-location-enrichment.service.ts'),
      'utf8',
    );
    const lines = source.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, index) => {
      // A canonicalDomain-feeding derivation spelled with the bare parser.
      // The parser itself and the trust authority's own body are exempt.
      if (
        line.includes('normalizeWebsiteDomain(') &&
        !line.trim().startsWith('normalizeWebsiteDomain(value') &&
        !lines[index - 1]?.includes('trustedIdentityDomain(value') &&
        (line.includes('canonicalDomain') ||
          lines[index + 1]?.includes('canonicalDomain') ||
          line.includes('trustedWebsiteDomain') ||
          line.includes('trustedCanonicalDomain'))
      ) {
        offenders.push(`${index + 1}: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});
