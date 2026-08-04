import { UsageLedgerService } from './usage-ledger.service';
import {
  DEFAULT_PLACE_DETAILS_FIELD_MASK_FIELDS,
  REFRESH_PLACE_DETAILS_FIELD_MASK_FIELDS,
  DEFAULT_TEXT_SEARCH_FIELD_MASK_FIELDS,
} from '../google-places/google-places.service';

/**
 * BILLING-DRIFT GUARD. A Places field the SKU classifier does not recognize
 * bills as the essentials floor whatever its true tier, so it UNDER-METERS
 * spend silently — the "photos" (F1256) and "takeout" class. This asserts that
 * every field WE request is classified into a known tier. It operates over our
 * OWN request masks (not a guess at Google's full catalogue), so it stays true
 * and it fails RED the moment someone adds a field to a mask without tiering it.
 */
describe('Places SKU coverage — every requested field is classified', () => {
  const masks: Array<[string, string[]]> = [
    [
      'place-details (first enrichment)',
      DEFAULT_PLACE_DETAILS_FIELD_MASK_FIELDS,
    ],
    ['place-details (refresh)', REFRESH_PLACE_DETAILS_FIELD_MASK_FIELDS],
    ['text-search', DEFAULT_TEXT_SEARCH_FIELD_MASK_FIELDS],
  ];

  it.each(masks)('%s mask has no unclassified fields', (_label, mask) => {
    expect(UsageLedgerService.unclassifiedPlacesFields(mask)).toEqual([]);
  });

  it('still DETECTS an unclassified field (the guard can show RED)', () => {
    expect(
      UsageLedgerService.unclassifiedPlacesFields(['id', 'someNewGoogleField']),
    ).toEqual(['someNewGoogleField']);
  });

  it('strips the places. prefix and sub-field leaves before classifying', () => {
    expect(
      UsageLedgerService.unclassifiedPlacesFields([
        'places.location',
        'places.displayName.text',
      ]),
    ).toEqual([]);
  });
});
