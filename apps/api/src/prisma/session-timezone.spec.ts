import { pinSessionTimeZoneUtc } from './prisma.service';

// THE MECHANISM-LEVEL FIX, and the reason it must not silently regress.
//
// 162 of this schema's timestamp columns are `timestamp WITHOUT time zone`
// holding UTC wall-clock. Prisma binds a JS Date as `timestamptz`, and
// comparing the two makes Postgres coerce the naive column through the
// SESSION's TimeZone — so hand-written SQL means something different depending
// on where the server thinks it is. Pinning every pooled connection to UTC
// deletes the whole class, including for queries not yet written, and makes
// dev match prod (prod already runs UTC, which is why this was invisible
// there).
//
// Verified against the local database: with the pin, the exact polls-feed
// comparison that returned 3,175 rows returns 16,528.

describe('session timezone pin', () => {
  it('pins UTC on a url with no query string', () => {
    expect(pinSessionTimeZoneUtc('postgresql://u:p@host:5432/db')).toBe(
      'postgresql://u:p@host:5432/db?options=-c%20timezone%3DUTC',
    );
  });

  it('appends to an existing query string rather than clobbering it', () => {
    expect(
      pinSessionTimeZoneUtc('postgresql://u:p@host:5432/db?schema=public'),
    ).toBe(
      'postgresql://u:p@host:5432/db?schema=public&options=-c%20timezone%3DUTC',
    );
  });

  it('encodes the space as %20 — a `+` makes Postgres REJECT the connection', () => {
    // Measured: urlencode's `+` produced
    // `FATAL: unrecognized configuration parameter "+timezone"`.
    const url = pinSessionTimeZoneUtc('postgresql://u:p@host/db');
    expect(url).toContain('%20');
    expect(url).not.toContain('+timezone');
  });

  it('never fights an explicit options= the operator already set', () => {
    const explicit =
      'postgresql://u:p@host/db?options=-c%20statement_timeout%3D5000';
    expect(pinSessionTimeZoneUtc(explicit)).toBe(explicit);
  });

  it('leaves an empty url alone (config validation owns that failure)', () => {
    expect(pinSessionTimeZoneUtc('')).toBe('');
  });
});
