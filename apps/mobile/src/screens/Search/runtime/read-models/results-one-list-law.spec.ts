import { execFileSync } from 'child_process';
import path from 'path';

import {
  buildSafeResultsData,
  buildSafeResultsDataByTab,
  type ResultsListItem,
} from './list-read-model-builder';
import { createResultsSurfaceReadModelPolicySnapshot } from '../shared/results-surface-read-model-policy-contract';

// THE ONE-LIST LAW (owner ruling, plans/concept-graph.md §10, adjudication a2eedea3a):
// search results are ONE continuous list in the server's Crave-Score rank order.
// `exactMatch` is row METADATA, never a grouping — no section row, no divider, no
// collapse-at-5 "show more exact" affordance.
//
// THE MUTATION these specs exist to catch: reintroduce a section/divider row (or any
// partition-and-truncate step) into the built list and they go RED — the built rows
// stop being the server's rows, in the server's order, with exactMatch intact.

type Row = { restaurantId: string; exactMatch?: boolean; craveScore: number };

const restaurantRow = (restaurantId: string, exactMatch: boolean, craveScore: number): Row => ({
  restaurantId,
  exactMatch,
  craveScore,
});

// A page the OLD sectioned projection provably mangled: 7 exact rows (> the dead
// collapse-at-5 limit) followed by broader rows. Sectioning inserted 2 header rows and
// HID rows 6-7 behind a "show more" affordance.
const SERVER_RANKED_RESTAURANTS: Row[] = [
  restaurantRow('r1', true, 99),
  restaurantRow('r2', true, 95),
  restaurantRow('r3', true, 91),
  restaurantRow('r4', true, 88),
  restaurantRow('r5', true, 84),
  restaurantRow('r6', true, 80),
  restaurantRow('r7', true, 77),
  restaurantRow('r8', false, 74),
  restaurantRow('r9', false, 70),
];

const SERVER_RANKED_DISHES = [
  { foodId: 'd1', exactMatch: true, craveScore: 98 },
  { foodId: 'd2', exactMatch: false, craveScore: 61 },
];

const isRowShaped = (item: ResultsListItem): boolean =>
  !(item && typeof item === 'object' && 'kind' in item && item.kind !== 'mounted_restaurant_card');

describe('the one-list law: the built list is the server list', () => {
  it('emits every server row, in server order, and nothing else', () => {
    const rows = buildSafeResultsData({
      activeTab: 'restaurants',
      dishes: [],
      restaurants: SERVER_RANKED_RESTAURANTS as never,
    });

    expect(rows).toHaveLength(SERVER_RANKED_RESTAURANTS.length);
    expect(rows.map((row) => (row as Row).restaurantId)).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      'r6',
      'r7',
      'r8',
      'r9',
    ]);
    // No row is a section/divider/show-more marker.
    expect(rows.every((row) => isRowShaped(row as ResultsListItem))).toBe(true);
  });

  it('keeps exactMatch on the row as metadata (the card reads it), not as grouping', () => {
    const rows = buildSafeResultsData({
      activeTab: 'restaurants',
      dishes: [],
      restaurants: SERVER_RANKED_RESTAURANTS as never,
    });

    expect(rows.map((row) => (row as Row).exactMatch)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('never reorders: rank order out === rank order in, on both tabs', () => {
    const rowsByTab = buildSafeResultsDataByTab({
      dishes: SERVER_RANKED_DISHES as never,
      restaurants: SERVER_RANKED_RESTAURANTS as never,
    });

    expect(rowsByTab.restaurants.map((row) => (row as Row).craveScore)).toEqual([
      99, 95, 91, 88, 84, 80, 77, 74, 70,
    ]);
    expect(rowsByTab.dishes.map((row) => (row as { foodId: string }).foodId)).toEqual(['d1', 'd2']);
  });

  it('gives the policy snapshot ONE row list per tab — rows ARE the safe rows', () => {
    const snapshot = createResultsSurfaceReadModelPolicySnapshot({
      activeTab: 'restaurants',
      retainedReadModel: {
        dishes: SERVER_RANKED_DISHES as never,
        restaurants: SERVER_RANKED_RESTAURANTS as never,
      } as never,
    });

    expect(snapshot.rowsByTab).toBe(snapshot.safeResultsDataByTab);
    expect(snapshot.rowCountByTab.restaurants).toBe(SERVER_RANKED_RESTAURANTS.length);
    expect(snapshot.activeTabRowCount).toBe(SERVER_RANKED_RESTAURANTS.length);
    expect(snapshot.rowsByTab.restaurants.every((row) => isRowShaped(row as ResultsListItem))).toBe(
      true
    );
  });
});

// Banking scan (the class, not the instance): the sectioned vocabulary must not come
// back anywhere in the search runtime — not as a row kind, not as a header string, not
// as a collapse-at-N affordance. grep's exit status is discriminated (0 = hits found,
// 1 = clean, anything else = the scan itself failed and must NOT read as PASS).
describe('the one-list law: no section vocabulary survives in the search runtime', () => {
  const SEARCH_RUNTIME_DIR = path.resolve(__dirname, '..');

  const scan = (pattern: string): string[] => {
    let stdout = '';
    let status = 0;
    try {
      stdout = execFileSync(
        'grep',
        ['-rn', '-E', pattern, '--include=*.ts', '--include=*.tsx', SEARCH_RUNTIME_DIR],
        { encoding: 'utf8' }
      );
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      status = failure.status ?? 2;
      if (status > 1) {
        throw new Error(`section-vocabulary scan failed to run (status ${status})`);
      }
      stdout = failure.stdout ?? '';
    }
    return stdout
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !line.includes(path.basename(__filename)));
  };

  it('has no exact/broader section header string', () => {
    expect(scan('\'(Exact|Broader) matches\'|"(Exact|Broader) matches"')).toEqual([]);
  });

  it("has no 'section' or 'show_more_exact' row kind", () => {
    expect(scan("kind: 'section'|'show_more_exact'|show_more_exact")).toEqual([]);
  });

  it('has no exact-collapse state (showAllExact*, exactVisibleLimit)', () => {
    expect(scan('showAllExact|exactVisibleLimit|EXACT_VISIBLE_LIMIT')).toEqual([]);
  });
});
