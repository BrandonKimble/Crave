import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACES_OPERATIONS } from './vendor-pricing';
import configuration from '../../../config/configuration';

// ONE VOCABULARY FOR ONE OPERATION.
//
// There were three: the rate limiter said `findPlaceFromText`, the ledger and
// pricing table say `textSearch`, and config had no key for it at all. An
// owner reacting to a Places bill by adding a `textSearch` limit to
// operationLimits got NO EFFECT — the scope lookup missed and fell back to the
// 600/min service default. The cap you would most want was the one you could
// not set, on the most expensive Places call, and nothing warned.

const SERVICE = readFileSync(
  join(__dirname, '..', 'google-places', 'google-places.service.ts'),
  'utf8',
);

describe('Places operation vocabulary', () => {
  it('every config operationLimits key is a real PlacesOperation', () => {
    const config = configuration() as {
      googlePlaces?: { operationLimits?: Record<string, unknown> };
    };
    const keys = Object.keys(config.googlePlaces?.operationLimits ?? {});
    expect(keys.length).toBeGreaterThan(0);
    // A key outside the union is a limit that silently does nothing.
    expect(keys.filter((k) => !PLACES_OPERATIONS.includes(k as never))).toEqual(
      [],
    );
  });

  it('the EXPENSIVE operation is settable — it had no key at all', () => {
    const config = configuration() as {
      googlePlaces?: { operationLimits?: Record<string, unknown> };
    };
    expect(Object.keys(config.googlePlaces?.operationLimits ?? {})).toContain(
      'textSearch',
    );
  });

  it('every operation named in the service belongs to the union', () => {
    const named = [...SERVICE.matchAll(/operation: '([A-Za-z]+)'/g)].map(
      (m) => m[1],
    );
    expect(named.length).toBeGreaterThan(0);
    const strays = [...new Set(named)].filter(
      (name) => !PLACES_OPERATIONS.includes(name as never),
    );
    expect(strays).toEqual([]);
  });

  it('the dead names are gone — they are how the mismatch happened', () => {
    expect(SERVICE).not.toContain("'findPlaceFromText'");
    expect(SERVICE).not.toContain("'placeAutocomplete'");
  });
});
