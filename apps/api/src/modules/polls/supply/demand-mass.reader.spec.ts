import 'reflect-metadata';
import {
  DemandMassReader,
  demandMassFromActorActs,
  recencyWeight,
} from './demand-mass.reader';
import { ECHO_SIGNAL_KINDS } from '../../signals/signals.service';
import {
  DEMAND_HALF_LIFE_DAYS,
  RECENCY_FLAT_DAYS,
} from './poll-supply.constants';

/**
 * Poll-supply swap specs (owner-ratified docket item 7): the mass reads are
 * AGGREGATE-BACKED — containment lineage + ancestors at weight 1 with MAX
 * set-semantics for closed days, a fresh-today ledger arm with true act-grain
 * dedupe, and the ECHO-KIND rule as the aggregate-compatible statement of the
 * wave-5 F2 act-grain law. Structure is asserted over the emitted SQL (the
 * same harness style as the aggregate spec); arithmetic laws through the
 * canonical TS kernel.
 */

const PLACE = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-07-19T14:30:00Z');

interface CapturedQuery {
  text: string;
  values: unknown[];
}

function flatten(query: CapturedQuery): string {
  const parts = [query.text];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      const fragment = value as { strings: string[]; values?: unknown[] };
      parts.push((fragment.strings ?? []).join('¤'));
      (fragment.values ?? []).forEach(walk);
    }
  };
  query.values.forEach(walk);
  return parts.join('¤');
}

/** Every plain (non-fragment) bound value, recursively. */
function boundValues(query: CapturedQuery): unknown[] {
  const found: unknown[] = [];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      ((value as { values?: unknown[] }).values ?? []).forEach(walk);
    } else {
      found.push(value);
    }
  };
  query.values.forEach(walk);
  return found;
}

function createHarness() {
  const queries: CapturedQuery[] = [];
  const prisma = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push({ text: strings.join('¤'), values });
        return Promise.resolve([]);
      },
    ),
  };
  const reader = new DemandMassReader(prisma as never);
  return { reader, queries };
}

const FRESH_ACT_KEY =
  "COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId', s.signal_id::text)";

describe('the ECHO-KIND rule (act-grain law restated at kind granularity)', () => {
  it('ECHO_SIGNAL_KINDS is exactly the kinds whose writers always attach a parent act id (writer specs pin the invariant)', () => {
    // RED-able both ways: adding a kind here without a writer invariant, or
    // a writer dropping its parent key (search-signals-write.spec asserts
    // selection meta.searchRequestId; on-demand-ask-signal.spec asserts
    // meta.askSearchRequestId), breaks the derivation this list states.
    expect([...ECHO_SIGNAL_KINDS].sort()).toEqual([
      'autocomplete_selection',
      'on_demand_ask',
    ]);
  });

  it('both mass reads exclude echo kinds from the aggregate arm — the parent search row alone carries the act weight', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    await reader.subjectDemandMass([PLACE], NOW);
    for (const query of queries) {
      expect(flatten(query)).toContain('<> ALL(');
      expect(boundValues(query)).toContainEqual([...ECHO_SIGNAL_KINDS]);
    }
  });

  it('placesWithAnySignal (existence probe) needs no echo/act dedupe — any place-attributed row is enough', async () => {
    const { reader, queries } = createHarness();
    await reader.placesWithAnySignal(NOW);
    const sql = flatten(queries[0]);
    expect(sql).not.toContain('<> ALL(');
    expect(sql).toContain('place_id IS NOT NULL'); // never the GLOBAL tile
  });
});

describe('containment lineage + MAX set-semantics (docket item 7 algebra)', () => {
  it('closed days read signal_demand_daily over the LINEAGE (self + ancestors + descendants), never a signals-geo intersection scan', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    const sql = flatten(queries[0]);
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('signal_demand_daily');
    // Both walks: ancestors (up via parent_place_ids unnest) and descendants
    // (down via member-of-parent-array join).
    expect(sql).toMatch(/unnest\(p\.parent_place_ids\)/);
    expect(sql).toMatch(/ANY\(p\.parent_place_ids\)/);
    // Count-once across a root's tiles: a signal stored at both a member and
    // an ancestor collapses via MAX per (actor, day, kind, subject).
    expect(sql).toContain('MAX(a.signal_count)');
  });

  it('subjectDemandMass MAX-dedupes tiles at RAW subject grain BEFORE redirect folding (two folded raw ids stay two acts)', async () => {
    const { reader, queries } = createHarness();
    await reader.subjectDemandMass([PLACE], NOW);
    const sql = flatten(queries[0]);
    expect(sql).toContain('MAX(a.signal_count)');
    // Redirects at read (§3), folded AFTER the tile MAX, by SUM.
    expect(sql).toContain('entity_redirects');
    expect(sql).toMatch(/SUM\(d\.acts\)/);
  });
});

describe('the two-arm freshness seam (aggregate closed days + fresh today)', () => {
  it('the aggregate arm stops strictly BEFORE today; today reads fresh from the ledger', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    const sql = flatten(queries[0]);
    expect(sql).toMatch(/a\.day < ¤::date/); // closed days only
    expect(sql).toContain('s.occurred_at >='); // fresh arm floor = todayStart
    // Naive-UTC instant law (wave-5, live-proven).
    expect(sql).toContain("AT TIME ZONE 'UTC'");
  });

  it('the fresh arm keeps TRUE act-grain dedupe (4-way COALESCE incl. askSearchRequestId) with a first-occurrence gate against earlier days', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    await reader.subjectDemandMass([PLACE], NOW);
    for (const query of queries) {
      const sql = flatten(query);
      expect(sql).toContain(FRESH_ACT_KEY);
      // Cross-midnight retries: the aggregate counted the act on its first
      // day — the anti-join probes the indexed 2-way parent key (complete at
      // act grain by the echo invariant).
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('prior.occurred_at <');
    }
  });

  it('the fresh arm uses the canonical wrap-aware longitude intersect, never a plain range test', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    await reader.subjectDemandMass([PLACE], NOW);
    for (const query of queries) {
      const sql = flatten(query);
      expect(sql).toContain('s.geo_min_lng > s.geo_max_lng');
      expect(sql).toContain('THEN TRUE');
    }
  });
});

describe('the mass law + day quantization (documented delta)', () => {
  it('a 3-row echo act weighs exactly 1; a genuine second act weighs 2 (then log2-saturates per actor)', () => {
    const oneActActor = demandMassFromActorActs([1]);
    const twoActActor = demandMassFromActorActs([2]);
    expect(oneActActor).toBeCloseTo(1, 9); // log2(1 + 1)
    expect(twoActActor).toBeCloseTo(Math.log2(3), 9);
    // Without the echo rule the 3-row act would have weighed log2(1+3) = 2.
    expect(oneActActor).toBeLessThan(demandMassFromActorActs([3]));
  });

  it('day quantization drift is bounded by ONE day of half-life decay (the documented estimator re-learn delta)', () => {
    // Closed days weight at INTEGER day age (todayKey - day) where the old
    // reader used the signal's fractional age. |intAge - realAge| < 1, so
    // the worst-case weight ratio is a single day of decay: 2^(1/14) ≈ 5%.
    const oneDayDecay = Math.pow(2, 1 / DEMAND_HALF_LIFE_DAYS);
    for (const realAge of [0.4, 6.9, 7.5, 8.2, 20.7, 34.9, 146.5]) {
      for (const intAge of [Math.floor(realAge), Math.ceil(realAge)]) {
        const ratio = recencyWeight(intAge) / recencyWeight(realAge);
        expect(ratio).toBeLessThanOrEqual(oneDayDecay + 1e-12);
        expect(ratio).toBeGreaterThanOrEqual(1 / oneDayDecay - 1e-12);
      }
    }
    // Inside the flat cycle the quantization is invisible (weight 1 both ways).
    expect(recencyWeight(Math.floor(6.9))).toBe(recencyWeight(6.9));
    expect(recencyWeight(RECENCY_FLAT_DAYS)).toBe(1);
  });
});

describe('ONE read surface: the intersection reader is retired', () => {
  it('no mass query scans signals by geo over the kernel horizon (the aggregate carries closed days)', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], NOW);
    await reader.subjectDemandMass([PLACE], NOW);
    await reader.placesWithAnySignal(NOW);
    for (const query of queries) {
      // The old reader bounded a signals scan by the kernel horizon
      // (make_interval over DEMAND_KERNEL_HORIZON_DAYS); the swap leaves the
      // ledger only the TODAY slice.
      expect(flatten(query)).not.toContain('make_interval');
    }
    // The candidate probe touches the aggregate only — no ledger join at all.
    expect(flatten(queries[2])).not.toMatch(/JOIN signals/);
  });

  it('placesWithAnySignal expands tiles BOTH ways (ancestors read descendants rows; descendants read ancestor rows at weight 1)', async () => {
    const { reader, queries } = createHarness();
    await reader.placesWithAnySignal(NOW);
    const sql = flatten(queries[0]);
    expect(sql).toMatch(/unnest\(p\.parent_place_ids\)/);
    expect(sql).toMatch(/ANY\(p\.parent_place_ids\)/);
  });
});
