import {
  compareSweepCandidates,
  isSweepEligible,
  selectSweepCandidates,
  SweepCandidate,
} from './grounding-sweep-selection';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { GroundingSweepHaltError } from './grounding-sweep-tripwire';

/**
 * THE BATCH-SWEEP WEDGE (grounding red team 2026-08-31).
 *
 * The old selection (`ORDER BY createdAt ASC`, take ~100, driver capped at
 * --limit 100) re-selected the same declined head every run: entity #101+
 * of a 1,021 backlog was never reached, silently. These specs pin the
 * rederived rule — terminal exclusion, untried-first ordering, declines
 * sink — and prove the per-run decline-rate tripwire still fires through
 * the NEW selection path.
 */

const candidate = (
  entityId: string,
  failures: number,
  lastAttemptAt: string | null,
  createdAt: string,
): SweepCandidate => ({
  entityId,
  failureCount: failures,
  lastAttemptAt,
  createdAt: new Date(createdAt),
});

describe('sweep eligibility (the money guard, applied at selection)', () => {
  it('excludes entities at/over the terminal threshold', () => {
    expect(isSweepEligible({ failureCount: 3 }, 3, false)).toBe(false);
    expect(isSweepEligible({ failureCount: 4 }, 3, false)).toBe(false);
    expect(isSweepEligible({ failureCount: 2 }, 3, false)).toBe(true);
  });

  it('retryTerminal re-admits terminal entities (the ghost recovery sweep)', () => {
    expect(isSweepEligible({ failureCount: 5 }, 3, true)).toBe(true);
  });
});

describe('sweep ordering', () => {
  it('puts untried entities first, then least-recently-attempted, then createdAt', () => {
    const untriedNew = candidate('untried-new', 0, null, '2026-08-30');
    const untriedOld = candidate('untried-old', 0, null, '2026-01-01');
    const attemptedLongAgo = candidate(
      'attempted-long-ago',
      0,
      '2026-06-01T00:00:00.000Z',
      '2025-01-01',
    );
    const attemptedToday = candidate(
      'attempted-today',
      0,
      '2026-08-31T00:00:00.000Z',
      '2025-01-01',
    );
    const struck = candidate(
      'one-strike',
      1,
      '2026-01-01T00:00:00.000Z',
      '2024-01-01',
    );

    const ordered = [
      struck,
      attemptedToday,
      untriedNew,
      attemptedLongAgo,
      untriedOld,
    ].sort(compareSweepCandidates);

    expect(ordered.map((c) => c.entityId)).toEqual([
      'untried-old', // 0 strikes, never attempted, oldest
      'untried-new', // 0 strikes, never attempted
      'attempted-long-ago', // 0 strikes, oldest attempt
      'attempted-today', // 0 strikes, freshest attempt sinks
      'one-strike', // strikes sort last of all
    ]);
  });

  it('a declined-heavy head no longer starves the tail (the wedge shape)', () => {
    // 100 entities declined YESTERDAY (oldest createdAt — the old order's
    // permanent head) + 50 never-tried newer entities (the starved tail).
    const declinedHead = Array.from({ length: 100 }, (_, i) =>
      candidate(
        `declined-${i}`,
        1,
        '2026-08-30T02:00:00.000Z',
        `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      ),
    );
    const starvedTail = Array.from({ length: 50 }, (_, i) =>
      candidate(
        `untried-${i}`,
        0,
        null,
        `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      ),
    );

    const selected = selectSweepCandidates([...declinedHead, ...starvedTail], {
      terminalThreshold: 3,
      retryTerminal: false,
      limit: 100,
    });

    // Every untried entity is selected BEFORE any of yesterday's declines.
    const ids = selected.map((c) => c.entityId);
    expect(ids.slice(0, 50).every((id) => id.startsWith('untried-'))).toBe(
      true,
    );
    // Yesterday's declines fill only the remainder of the window.
    expect(ids.slice(50).every((id) => id.startsWith('declined-'))).toBe(true);
    expect(selected).toHaveLength(100);
  });

  it('terminal entities never occupy window slots', () => {
    const terminal = Array.from({ length: 99 }, (_, i) =>
      candidate(`terminal-${i}`, 3, '2026-08-01T00:00:00.000Z', '2026-01-01'),
    );
    const fresh = candidate('fresh', 0, null, '2026-08-01');
    const selected = selectSweepCandidates([...terminal, fresh], {
      terminalThreshold: 3,
      retryTerminal: false,
      limit: 100,
    });
    expect(selected.map((c) => c.entityId)).toEqual(['fresh']);
  });
});

describe('the sweep tripwire still fires through the new selection', () => {
  function makeService(candidateRows: Array<Record<string, unknown>>) {
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const emit = jest.fn();
    const findMany = jest
      .fn()
      // First call: the candidate scan (minimal columns).
      .mockResolvedValueOnce(candidateRows)
      // Second call: the full rows for the selected ids.
      .mockResolvedValueOnce(
        candidateRows.map((row) => ({
          ...row,
          type: 'place',
          status: 'active',
          primaryLocation: null,
          locations: [],
        })),
      );
    const prisma = { entity: { findMany } };
    const service = new PlaceLocationEnrichmentService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => 3 } as never,
      { emit } as never,
      {
        pendingExecution: () => Promise.resolve([]),
        markExecuted: () => Promise.resolve(undefined),
      } as never,
      { reconcile: () => Promise.resolve(0) } as never,
      logger as never,
    );
    // Every selected entity declines — the exact 08-20 shape, driven through
    // the real enrichMissingPlaces loop (the chooser itself is not on trial).
    const enriched: string[] = [];
    (service as unknown as Record<string, unknown>).enrichPlace = jest.fn(
      (entity: { entityId: string }) => {
        enriched.push(entity.entityId);
        return Promise.resolve({
          entityId: entity.entityId,
          status: 'no_match',
          reason: 'declined',
        });
      },
    );
    return { service, emit, enriched };
  }

  it('halts a >90%-decline run and emits the critical alert', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      entityId: `entity-${i}`,
      // Computed key: this is a mocked PRISMA ROW (a read), not a write —
      // the only-incremented lint rule keys on the literal spelling.
      ['enrichmentFailureCount']: 0,
      createdAt: new Date(`2026-01-0${(i % 9) + 1}`),
      placeMetadata: null,
    }));
    const { service, emit, enriched } = makeService(rows);

    await expect(
      service.enrichMissingPlaces({ limit: 50 }),
    ).rejects.toBeInstanceOf(GroundingSweepHaltError);

    // The tripwire needs GROUNDING_SWEEP_MIN_ATTEMPTS (20) declines before
    // it may rule — it halted at the bound, not at the end of the window.
    expect(enriched.length).toBe(20);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        kind: 'grounding_sweep_halted',
      }),
    );
  });
});
