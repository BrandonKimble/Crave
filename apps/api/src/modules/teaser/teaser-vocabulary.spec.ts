import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  CONTEXT_OPTION_IDS,
  CRAVING_OPTION_IDS,
  CUISINE_OPTION_IDS,
  LIVE_CITY_VALUES,
} from '@crave-search/shared';
import {
  CITY_LOCATION_NAMES,
  CONTEXT_ATTR_NAMES,
  CUISINE_ATTRS,
  DISHES_BY_CRAVING_ID,
  TEASER_SCORE_CEILING,
} from './teaser.service';

/**
 * The onboarding option ids cross the network: mobile writes them, the teaser
 * reads them. They used to be declared in mobile's constants and RE-SPELLED as
 * record keys here — a rename degraded every teaser to the browse fallback,
 * silently, because the fallback is what hid it.
 */
describe('teaser reads the SHARED onboarding vocabulary', () => {
  it('every dish key is a real craving option id', () => {
    for (const id of Object.keys(DISHES_BY_CRAVING_ID)) {
      expect(CRAVING_OPTION_IDS).toContain(id);
    }
  });

  it('every context id is a real context option id', () => {
    for (const { contextId } of CONTEXT_ATTR_NAMES) {
      expect(CONTEXT_OPTION_IDS).toContain(contextId);
    }
  });

  it('every cuisine key is a real cuisine option id', () => {
    for (const id of Object.keys(CUISINE_ATTRS)) {
      expect(CUISINE_OPTION_IDS).toContain(id);
    }
  });

  it('the live-city table covers exactly the shared live cities', () => {
    expect(Object.keys(CITY_LOCATION_NAMES).sort()).toEqual(
      [...LIVE_CITY_VALUES].sort(),
    );
  });

  it('ONE record per dish — terms and label travel together', () => {
    // Two parallel records keyed by the same eleven ids was the defect:
    // adding a dish meant editing two literals, and nothing caught a miss.
    for (const entry of Object.values(DISHES_BY_CRAVING_ID)) {
      expect(entry?.terms.length).toBeGreaterThan(0);
      expect(entry?.label).toBeTruthy();
    }
  });
});

describe('the teaser display ceiling is declared once', () => {
  it('the value appears in exactly one line of code', () => {
    // It was hard-coded at two call sites, which is two places for one
    // presentation rule to drift from itself.
    const source = readFileSync(
      path.join(__dirname, 'teaser.service.ts'),
      'utf8',
    );
    const codeLinesWith99 = source
      .split('\n')
      .filter((line) => line.includes('9.9'))
      .filter((line) => !line.trim().startsWith('*'));
    expect(codeLinesWith99).toEqual([
      'export const TEASER_SCORE_CEILING = 9.9;',
    ]);
  });

  it('the ceiling value is unchanged', () => {
    expect(TEASER_SCORE_CEILING).toBe(9.9);
  });
});
