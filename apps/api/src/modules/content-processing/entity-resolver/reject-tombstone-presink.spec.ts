/* eslint-disable @typescript-eslint/require-await -- mocks stand in for genuinely
   async methods; each must return a promise to match the interface it replaces. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import 'reflect-metadata';
import { EntityType, Prisma } from '@prisma/client';
import { EntityResolutionService } from './entity-resolution.service';
import { canonicalFold } from './entity-identity';
import { LoggerService } from '../../../shared';
import type { EntityResolutionInput } from './entity-resolution.types';

/**
 * THE REJECT TOMBSTONE MUST NEVER SILENCE A LIVE ENTITY (red-team F1,
 * 2026-08-30).
 *
 * The pre-sink absorbs repeat mentions of judged-junk terms onto their
 * archived tombstone BEFORE recall runs. The proven-RED pre-fix shape: the
 * pre-sink checked only for an archived non-redirected row on the fold and
 * never asked whether an ACTIVE entity shares it — so a term rejected in one
 * era and legitimately minted in another (or the same surface naming both
 * junk and a real thing: junk "best" beside a real bar named "Best") had
 * every future mention absorbed by the tombstone, permanently starving the
 * live entity. That is the one failure the reject asymmetry ("a wrong reject
 * silences a real dish forever") exists to prevent.
 *
 * The prisma double emulates the pre-sink SQL at TEXT fidelity: the
 * active-twin NOT EXISTS is applied only when the service's SQL actually
 * contains it. Delete the clause from the service and the silencing case
 * here goes RED — the mutation-proof the report demanded.
 *
 * Also pinned: `ensureRejectTombstone` takes the creator's advisory lock
 * (the docstring's claim is now true), stands down when a live twin holds
 * the fold, and rethrows non-P2002 storage errors instead of converting
 * them into a verdict reroute (G3).
 */

function fakeLogger(): LoggerService {
  const self = {
    setContext: () => self,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  return self as unknown as LoggerService;
}

interface Row {
  entityId: string;
  name: string;
  type: EntityType;
  status: 'active' | 'pending' | 'archived' | 'rehearsal';
  redirected?: boolean;
}

const sqlText = (query: any): string =>
  query?.strings?.join(' ') ?? String(query?.sql ?? '');

function buildHarness(rows: Row[]) {
  const executedRaw: string[] = [];
  const created: any[] = [];
  let createFailure: Error | null = null;

  const fold = (name: string) => canonicalFold(name);

  const answerQuery = (query: any): any[] => {
    const sql = sqlText(query);
    const values: any[] = query?.values ?? [];
    // Pre-sink tombstone probe: archived, fold IN probe set, non-redirected.
    if (sql.includes("e.status = 'archived'") && sql.includes('= ANY(')) {
      const type = values[0] as EntityType;
      const probes = new Set(
        (values.find((v) => Array.isArray(v)) as string[]) ?? [],
      );
      let hits = rows.filter(
        (r) =>
          r.type === type &&
          r.status === 'archived' &&
          !r.redirected &&
          probes.has(fold(r.name)),
      );
      // TEXT-FIDELITY MUTATION SENSOR: the live-twin standdown applies only
      // if the service's SQL still carries the NOT EXISTS clause.
      if (sql.includes("live.status IN ('active', 'pending')")) {
        hits = hits.filter(
          (t) =>
            !rows.some(
              (r) =>
                r.type === t.type &&
                (r.status === 'active' || r.status === 'pending') &&
                fold(r.name) === fold(t.name),
            ),
        );
      }
      return hits.map((r) => ({
        entity_id: r.entityId,
        identity_key: fold(r.name),
      }));
    }
    // ensureRejectTombstone live-twin probe: single fold, active/pending.
    if (sql.includes("e.status IN ('active', 'pending')")) {
      const type = values[0] as EntityType;
      const key = values[1] as string;
      return rows
        .filter(
          (r) =>
            r.type === type &&
            (r.status === 'active' || r.status === 'pending') &&
            fold(r.name) === key,
        )
        .map((r) => ({ entity_id: r.entityId }));
    }
    // ensureRejectTombstone adoptable-tombstone probe: single fold, archived.
    if (sql.includes("e.status = 'archived'")) {
      const type = values[0] as EntityType;
      const key = values[1] as string;
      return rows
        .filter(
          (r) =>
            r.type === type &&
            r.status === 'archived' &&
            !r.redirected &&
            fold(r.name) === key,
        )
        .map((r) => ({ entity_id: r.entityId }));
    }
    // Candidate aliases (entity_surface) and homes: none needed here.
    return [];
  };

  const tx = {
    $executeRaw: jest.fn(
      async (strings: TemplateStringsArray, ...vals: any[]) => {
        executedRaw.push(
          strings.raw.join('?') + ' :: ' + vals.map(String).join(','),
        );
        return 0;
      },
    ),
    $queryRaw: jest.fn(async (query: any) => answerQuery(query)),
    entity: {
      create: jest.fn(async (args: any) => {
        if (createFailure) throw createFailure;
        created.push(args);
        return { entityId: 'tombstone-minted' };
      }),
    },
  };

  const prisma = {
    $queryRaw: jest.fn(async (query: any) => answerQuery(query)),
    $transaction: jest.fn(async (fn: (t: any) => Promise<any>) => fn(tx)),
  };

  const retrieveCandidates = jest.fn(async () => [] as any[]);
  const matchEntitiesBatch = jest.fn(async () => [] as any[]);

  const service = new EntityResolutionService(
    prisma as never,
    {} as never,
    { get: () => undefined } as never,
    {} as never,
    { matchEntitiesBatch } as never,
    { retrieveCandidates } as never,
    fakeLogger(),
    {} as never,
    {
      decidedVerdicts: jest.fn(async () => new Map()),
      record: jest.fn(async () => undefined),
      markExecuted: jest.fn(async () => undefined),
    } as never,
  );
  (service as any).logger = fakeLogger();

  const run = (inputs: EntityResolutionInput[], type: EntityType) =>
    (service as any).performLlmMatches(
      inputs,
      type,
      null, // engineId
      null, // documentLocale
      null, // rehearsalRunId (live run)
    ) as Promise<
      Array<{
        tempId: string;
        entityId: string | null;
        resolutionTier: string;
      }>
    >;

  return {
    run,
    retrieveCandidates,
    matchEntitiesBatch,
    executedRaw,
    created,
    tx,
    setCreateFailure: (e: Error) => {
      createFailure = e;
    },
  };
}

const mention = (tempId: string, name: string): EntityResolutionInput =>
  ({ tempId, normalizedName: name }) as EntityResolutionInput;

describe('reject tombstone pre-sink — active twin standdown (F1)', () => {
  it('SILENCING SCENARIO: a mention whose fold has BOTH a tombstone and an active entity reaches recall + judge and resolves onto the active entity — never the sink', async () => {
    const h = buildHarness([
      {
        entityId: 'tomb-best',
        name: 'best',
        type: EntityType.place,
        status: 'archived',
      },
      {
        entityId: 'live-best',
        name: 'Best',
        type: EntityType.place,
        status: 'active',
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'live-best', name: 'Best' },
    ]);
    h.matchEntitiesBatch.mockResolvedValue([
      { decision: 'match', candidateId: 0, reason: 'same bar, same name' },
    ]);

    const results = await h.run([mention('t1', 'best')], EntityType.place);

    // Pre-fix, the pre-sink absorbed the mention: recall never ran and the
    // result was the tombstone id. Both assertions go RED if the active-twin
    // NOT EXISTS is deleted from the pre-sink SQL.
    expect(h.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(h.matchEntitiesBatch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe('live-best');
  });

  it('a PENDING (quarantined but matchable) twin also stands the sink down', async () => {
    const h = buildHarness([
      {
        entityId: 'tomb-x',
        name: 'birria',
        type: EntityType.item,
        status: 'archived',
      },
      {
        entityId: 'pending-x',
        name: 'birria',
        type: EntityType.item,
        status: 'pending',
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([]);

    const results = await h.run([mention('t1', 'birria')], EntityType.item);

    expect(h.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(results[0].entityId).toBeNull(); // falls through to creation
  });

  it('JUNK-ONLY SINKING still works: no live twin → the mention sinks onto the tombstone and recall never runs', async () => {
    const h = buildHarness([
      {
        entityId: 'tomb-junk',
        name: '5 piece',
        type: EntityType.item,
        status: 'archived',
      },
    ]);

    const results = await h.run([mention('t1', '5 piece')], EntityType.item);

    expect(h.retrieveCandidates).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe('tomb-junk');
  });

  it('a redirected archived row (merge loser, not junk) never sinks', async () => {
    const h = buildHarness([
      {
        entityId: 'loser',
        name: 'queso',
        type: EntityType.item,
        status: 'archived',
        redirected: true,
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([]);

    const results = await h.run([mention('t1', 'queso')], EntityType.item);

    expect(h.retrieveCandidates).toHaveBeenCalledTimes(1);
    expect(results[0].entityId).toBeNull();
  });
});

describe('ensureRejectTombstone — lock, standdown, mint, error honesty (F1/G3)', () => {
  const rejectVerdict = [
    {
      decision: 'reject',
      candidateId: null,
      reason: 'street name, not a dish',
    },
  ];

  it('a fresh reject with no twin MINTS the tombstone under the creator advisory lock', async () => {
    const h = buildHarness([
      {
        entityId: 'cand',
        name: 'south lamar tacos',
        type: EntityType.item,
        status: 'active',
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'cand', name: 'south lamar tacos' },
    ]);
    h.matchEntitiesBatch.mockResolvedValue(rejectVerdict);

    const results = await h.run(
      [mention('t1', 'South Lamar Location')],
      EntityType.item,
    );

    expect(results[0].entityId).toBe('tombstone-minted');
    // The advisory lock is the creator's own namespace: 'entity:<type>:<key>'.
    expect(
      h.executedRaw.some(
        (s) =>
          s.includes('pg_advisory_xact_lock') && s.includes('entity:item:'),
      ),
    ).toBe(true);
    expect(h.created[0].data.status).toBe('archived');
  });

  it('STANDS DOWN when a live same-fold entity exists: no tombstone minted, the term falls through to creation', async () => {
    const h = buildHarness([
      {
        entityId: 'cand',
        name: 'unrelated',
        type: EntityType.item,
        status: 'active',
      },
      {
        entityId: 'live-twin',
        name: 'best',
        type: EntityType.item,
        status: 'active',
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'cand', name: 'unrelated' },
    ]);
    h.matchEntitiesBatch.mockResolvedValue(rejectVerdict);

    const results = await h.run([mention('t1', 'best')], EntityType.item);

    expect(h.created).toHaveLength(0);
    expect(results[0].entityId).toBeNull();
  });

  it('ADOPTS an existing archived non-redirected twin instead of minting a second tombstone', async () => {
    const rows: Row[] = [
      {
        entityId: 'cand',
        name: 'unrelated',
        type: EntityType.item,
        status: 'active',
      },
    ];
    const h = buildHarness(rows);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'cand', name: 'unrelated' },
    ]);
    // A concurrent batch mints the tombstone AFTER the pre-sink ran (the
    // race window ensureRejectTombstone exists for): surface it when the
    // judge returns, so only the mint-time adopt probe can see it.
    h.matchEntitiesBatch.mockImplementation(async () => {
      if (!rows.some((r) => r.entityId === 'tomb-existing')) {
        rows.push({
          entityId: 'tomb-existing',
          name: 'clay',
          type: EntityType.item,
          status: 'archived',
        });
      }
      return rejectVerdict;
    });

    const results = await h.run([mention('t1', 'CLAY!!')], EntityType.item);

    expect(h.created).toHaveLength(0);
    expect(results[0].entityId).toBe('tomb-existing');
  });

  it('G3: a non-P2002 storage error RETHROWS — never silently rerouted into creation', async () => {
    const h = buildHarness([
      {
        entityId: 'cand',
        name: 'unrelated',
        type: EntityType.item,
        status: 'active',
      },
    ]);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'cand', name: 'unrelated' },
    ]);
    h.matchEntitiesBatch.mockResolvedValue(rejectVerdict);
    h.setCreateFailure(new Error('connection reset'));

    await expect(
      h.run([mention('t1', 'garbage term')], EntityType.item),
    ).rejects.toThrow('connection reset');
  });

  it('a genuine P2002 collision is absorbed by the adopt-or-stand-down probe', async () => {
    const rows: Row[] = [
      {
        entityId: 'cand',
        name: 'unrelated',
        type: EntityType.item,
        status: 'active',
      },
    ];
    const h = buildHarness(rows);
    h.retrieveCandidates.mockResolvedValue([
      { entityId: 'cand', name: 'unrelated' },
    ]);
    h.matchEntitiesBatch.mockResolvedValue(rejectVerdict);
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    // The concurrent winner lands its row in the same instant our create
    // collides — visible only to the post-collision probe.
    h.tx.entity.create.mockImplementation(async () => {
      rows.push({
        entityId: 'tomb-winner',
        name: 'garbage term',
        type: EntityType.item,
        status: 'archived',
      });
      throw p2002;
    });

    const results = await h.run(
      [mention('t1', 'garbage term')],
      EntityType.item,
    );
    expect(results[0].entityId).toBe('tomb-winner');
  });
});
