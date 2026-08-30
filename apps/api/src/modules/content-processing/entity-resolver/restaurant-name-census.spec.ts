import {
  RestaurantNameCensusService,
  CENSUS_DOCKET_CAP,
} from './restaurant-name-census.service';
import type { PlaceNameHearingService } from './restaurant-name-hearing.service';
import type { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { DrainExceedsStandingCapError } from './claim-rehearing-budget.service';
import { placeNameLane } from './restaurant-name-lane';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { LoggerService } from '../../../shared';

/**
 * THE GENERIC-WORD CENSUS — docket correctness on staging-shaped rows
 * (flywheel arming 2026-08-30). The SQL's ordering contract is asserted
 * against the shape the query RETURNS (the census rows), and the TypeScript
 * half — unheard-before-cap, cap, court handoff, budget-refusal containment
 * — is proven directly.
 *
 * Mutation proofs: swap the unheard filter and the cap in buildDocket and
 * the crowd-out test fails; make run() rethrow DrainExceedsStandingCapError
 * and the refusal test fails; strip the signals off the docket rows and the
 * ordering passthrough test fails.
 */
describe('RestaurantNameCensusService', () => {
  const logger = {
    setContext: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  } as unknown as LoggerService;

  // Staging-shaped census rows, in the order the SQL returns them:
  // ungrounded first, word-elsewhere first within a rank, numerics next —
  // the 399-class exemplars from the dormant-systems audit.
  const stagingShapedRows = [
    {
      entity_id: 'e-bacon',
      form: 'bacon',
      grounded: false,
      word_elsewhere: true,
      numeric_only: false,
    },
    {
      entity_id: 'e-bbq',
      form: 'bbq',
      grounded: false,
      word_elsewhere: true,
      numeric_only: false,
    },
    {
      entity_id: 'e-7',
      form: '7',
      grounded: false,
      word_elsewhere: false,
      numeric_only: true,
    },
    {
      entity_id: 'e-alonzos',
      form: 'alonzos',
      grounded: false,
      word_elsewhere: false,
      numeric_only: false,
    },
    {
      entity_id: 'e-chilis',
      form: 'chilis',
      grounded: true,
      word_elsewhere: true,
      numeric_only: false,
    },
  ];

  const build = (options?: {
    rows?: typeof stagingShapedRows;
    decided?: string[];
    hear?: jest.Mock;
  }) => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(options?.rows ?? stagingShapedRows),
    } as unknown as PrismaService;
    const decidedKeys = jest
      .fn()
      .mockResolvedValue(new Set(options?.decided ?? []));
    const hear =
      options?.hear ??
      jest.fn().mockResolvedValue({
        considered: 0,
        noSuchPlace: 0,
        alreadyDecided: 0,
        judged: 0,
        namesUpheld: 0,
        namesDenied: 0,
        unjudged: 0,
        cases: [],
      });
    const resumePendingEffects = jest.fn().mockResolvedValue(0);
    const court = {
      hear,
      resumePendingEffects,
    } as unknown as PlaceNameHearingService;
    const ledger = { decidedKeys } as unknown as ClaimVerdictLedgerService;
    const service = new RestaurantNameCensusService(
      prisma,
      court,
      ledger,
      logger,
    );
    return { service, hear, resumePendingEffects, decidedKeys, prisma };
  };

  it('preserves the risk ordering the SQL establishes — ungrounded query-words lead, grounded rows trail', async () => {
    const { service } = build();
    const { docket } = await service.buildDocket();
    expect(docket.map((row) => row.form)).toEqual([
      'bacon',
      'bbq',
      '7',
      'alonzos',
      'chilis',
    ]);
    expect(docket[0]).toMatchObject({
      grounded: false,
      wordElsewhere: true,
      numericOnly: false,
    });
  });

  it('subtracts already-decided claims BEFORE the cap — settled upholds cannot crowd unheard rows out of a night', async () => {
    const decided = [
      placeNameLane.canonicalClaimKey({ entityId: 'e-bacon', form: 'bacon' }),
      placeNameLane.canonicalClaimKey({ entityId: 'e-bbq', form: 'bbq' }),
    ];
    const { service } = build({ decided });
    const { docket, alreadyDecided, scanned } = await service.buildDocket(2);
    expect(scanned).toBe(5);
    expect(alreadyDecided).toBe(2);
    // The cap of 2 is filled by the UNHEARD head, not eaten by decided rows.
    expect(docket.map((row) => row.form)).toEqual(['7', 'alonzos']);
  });

  it('caps the docket (default CENSUS_DOCKET_CAP)', async () => {
    const { service } = build();
    const { docket } = await service.buildDocket(3);
    expect(docket).toHaveLength(3);
    expect(CENSUS_DOCKET_CAP).toBeLessThanOrEqual(2000); // under the rolling allowance
  });

  it('run() hands the court bare (entityId, form) claims and passes dryRun through', async () => {
    const { service, hear, resumePendingEffects } = build();
    const summary = await service.run({ dryRun: true });
    expect(summary.docket).toBe(5);
    expect(resumePendingEffects).not.toHaveBeenCalled(); // dry runs execute nothing
    expect(hear).toHaveBeenCalledWith(
      stagingShapedRows.map((row) => ({
        entityId: row.entity_id,
        form: row.form,
      })),
      { dryRun: true },
    );
  });

  it('run({dryRun:false}) resumes paid-but-unexecuted verdicts before hearing', async () => {
    const { service, resumePendingEffects, hear } = build();
    await service.run({ dryRun: false });
    expect(resumePendingEffects).toHaveBeenCalledTimes(1);
    expect(hear).toHaveBeenCalledWith(expect.any(Array), { dryRun: false });
  });

  it('a budget refusal is REPORTED, not thrown — the remainder is tomorrow docket', async () => {
    const hear = jest.fn().mockRejectedValue(
      new DrainExceedsStandingCapError(
        {
          lane: 'restaurant_name',
          ruleVersion: 1,
          dueCount: 400,
          microUsdPerHearing: 1000,
          estimateMicros: 400_000,
          estimateHash: 'x',
        },
        2000,
        0,
      ),
    );
    const { service } = build({ hear });
    const summary = await service.run({ dryRun: false });
    expect(summary.refusedByBudget).toBe(true);
    expect(summary.hearing).toBeNull();
  });

  it('an empty unheard population consults no court at all', async () => {
    const decided = stagingShapedRows.map((row) =>
      placeNameLane.canonicalClaimKey({
        entityId: row.entity_id,
        form: row.form,
      }),
    );
    const { service, hear } = build({ decided });
    const summary = await service.run({ dryRun: false });
    expect(summary.docket).toBe(0);
    expect(hear).not.toHaveBeenCalled();
  });
});
