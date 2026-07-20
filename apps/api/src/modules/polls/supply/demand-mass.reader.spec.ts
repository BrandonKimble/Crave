import 'reflect-metadata';
import {
  DemandMassReader,
  demandMassFromActorActs,
} from './demand-mass.reader';

/**
 * Wave-5 F2 specs — ACT-GRAIN dedupe in the poll-supply mass reads. One user
 * act can write several ledger rows sharing an idempotency id: a selected
 * failing search = 'search' + 'autocomplete_selection' (meta.searchRequestId)
 * + 'on_demand_ask' (meta.askSearchRequestId carrying the SAME id). For mass
 * those are ONE act; a genuine second act (its own id) weighs separately.
 * Structure is asserted over the emitted SQL (the same harness style as the
 * aggregate spec); the arithmetic law is asserted through the canonical TS
 * kernel the SQL implements.
 */

const PLACE = '11111111-1111-1111-1111-111111111111';

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

const ACT_KEY =
  "COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId', s.signal_id::text)";

describe('DemandMassReader act-grain dedupe (wave-5 F2)', () => {
  it('placeDemandMass collapses ledger rows to acts per actor BEFORE the kernel (search+selection+ask echo = one act)', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    const sql = flatten(queries[0]);
    // The act key includes askSearchRequestId — the on_demand_ask row of a
    // failing search carries the ORIGINATING searchRequestId there, so the
    // echo collapses for free.
    expect(sql).toContain(ACT_KEY);
    // Dedupe happens at act grain (GROUP BY actor + act key) in a CTE that
    // feeds the kernel; first occurrence wins (the aggregate's law).
    expect(sql).toContain('per_act');
    expect(sql).toContain('MIN(s.occurred_at)');
    // The kernel then sums over deduped ACTS, never raw rows.
    expect(sql).toMatch(/FROM per_act pa/);
    expect(sql).toContain('SUM(ln(1 + acts) / ln(2))');
  });

  it('subjectDemandMass carries the same act-grain dedupe per (place, subject, actor)', async () => {
    const { reader, queries } = createHarness();
    await reader.subjectDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    const sql = flatten(queries[0]);
    expect(sql).toContain(ACT_KEY);
    expect(sql).toContain('MIN(s.occurred_at)');
    expect(sql).toMatch(
      /GROUP BY pb\.place_id, COALESCE\(r\.to_entity_id, s\.subject_id\), s\.actor_id,/,
    );
    // Redirect resolution still happens at read; kinds stay unfiltered.
    expect(sql).toContain('entity_redirects');
    expect(sql).not.toMatch(/s\.kind\s*=/);
  });

  it('the mass law: a 3-row act weighs exactly 1; a genuine second act weighs 2 (then log2-saturates per actor)', () => {
    // Ledger rows: search + selection + ask sharing one id → ONE act at
    // weight 1.0 (flat recency); a second submit adds its own act.
    const oneActActor = demandMassFromActorActs([1]);
    const twoActActor = demandMassFromActorActs([2]);
    expect(oneActActor).toBeCloseTo(1, 9); // log2(1 + 1)
    expect(twoActActor).toBeCloseTo(Math.log2(3), 9); // log2(1 + 2)
    // Without dedupe the 3-row act would have weighed log2(1+3) = 2 — the
    // F2 defect this spec pins shut.
    expect(oneActActor).toBeLessThan(demandMassFromActorActs([3]));
  });

  it('kind-FILTERED ask reads stay OUT of this dedupe (territoryUnmetAsks reads ask rows directly) — the mass paths alone collapse', async () => {
    const { reader, queries } = createHarness();
    await reader.placesWithAnySignal(new Date('2026-07-19T00:00:00Z'));
    // Existence probe: no act dedupe needed (any row = any signal).
    expect(flatten(queries[0])).not.toContain('per_act');
  });
});

describe('DemandMassReader naive-UTC instant law (wave-5, live-proven)', () => {
  it('every bound instant compared against occurred_at passes through AT TIME ZONE UTC (session-TZ skew fix)', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    await reader.subjectDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    await reader.placesWithAnySignal(new Date('2026-07-19T00:00:00Z'));
    for (const query of queries) {
      // signals.occurred_at is naive UTC; Prisma binds Dates as timestamptz —
      // without the coercion the session time zone shifts every window
      // boundary (live-proven: the last UTC-offset hours of signals vanished).
      expect(flatten(query)).toContain("AT TIME ZONE 'UTC'");
    }
  });
});

describe('DemandMassReader wrap-aware longitude (wave-5 F4 convergence)', () => {
  it('every signals join goes through the canonical crossing-aware CASE, never a plain range test', async () => {
    const { reader, queries } = createHarness();
    await reader.placeDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    await reader.subjectDemandMass([PLACE], new Date('2026-07-19T00:00:00Z'));
    await reader.placesWithAnySignal(new Date('2026-07-19T00:00:00Z'));
    for (const query of queries) {
      const sql = flatten(query);
      // The canonical CASE from signals/lng-intersect.ts: both-cross ⇒ TRUE,
      // one-cross ⇒ OR of the two arcs.
      expect(sql).toContain('s.geo_min_lng > s.geo_max_lng');
      expect(sql).toContain('THEN TRUE');
    }
  });
});
