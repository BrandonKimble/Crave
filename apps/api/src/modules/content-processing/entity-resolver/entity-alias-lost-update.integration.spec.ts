/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
/**
 * THE FOR-UPDATE LOCK ACTUALLY SERIALIZES CONCURRENT ALIAS WRITERS — against
 * a real Postgres.
 *
 * F1870/F1 (wave-3 red team): `entity_surface`/`core_entities.aliases` had a
 * proven LOST-UPDATE race — two concurrent `addSurfaces` calls both read the
 * active alias rows, then both blind-wrote the derived `aliases[]` array;
 * whichever committed second silently overwrote the first writer's form from
 * every read arm (GIN overlap, FTS, trgm, per-alias unnest). `projectAliases`
 * now opens with `SELECT ... FOR UPDATE` on the entity row before reading and
 * rewriting the projection, so the second writer should block until the first
 * commits and then read ITS committed state.
 *
 * This spec proves the lock closes the race two ways: (1) real wall-clock
 * concurrent `addSurfaces` calls at the same entity, both forms surviving;
 * and (2) a DETERMINISTIC version that forces the classic read-then-write
 * window open via test-only instrumentation (wrapTxWithReadGate) rather
 * than hoping Node's scheduler happens to interleave two fast transactions
 * — (1) alone was confirmed NOT to reliably exercise the race (it stayed
 * green across repeated runs even with the FOR UPDATE statement commented
 * out in a throwaway local edit), so (2) is the one that actually carries
 * the mutation-proof: commenting out the lock turns (2) red (loses
 * "race-form-b"), restoring it turns it green again.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { addSurfaces } from './entity-surface.service';

/**
 * Wraps a transaction client so the ONE query that reads the active-alias
 * rows inside `projectAliases` (identified by its distinctive `DISTINCT ON
 * (form)` SQL, not by call count — robust to unrelated query-shape changes)
 * pauses on `gate` after the real read returns and before the caller can act
 * on it. This forces the classic TOCTOU window open on demand: writer A's
 * read completes, then (if the lock is NOT actually held) writer B is free
 * to fully read+write+commit before A resumes and blind-overwrites the
 * array with its own stale snapshot. This is TEST-ONLY instrumentation — it
 * changes nothing about which SQL runs, only when control returns to the
 * caller after that one specific read.
 *
 * `onGated` fires the instant the discriminator matches — the test asserts it
 * ran, so a harness that silently STOPPED recognising the gated read (the SQL
 * reworded, moved to $queryRawUnsafe, or migrated to the client API) reds
 * loudly instead of degrading into a plain-concurrency test that proves
 * nothing (F6614).
 */
function wrapTxWithReadGate(
  tx: Prisma.TransactionClient,
  gate: Promise<void>,
  onGated: () => void,
): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === '$queryRaw') {
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const result = await (target.$queryRaw as any)(strings, ...values);
          if (strings.join(' ').includes('DISTINCT ON (form)')) {
            onGated();
            await gate;
          }
          return result;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const TEST_TAG = 'itest-alias-lock';
const prisma = new PrismaClient();
const ids: string[] = [];

async function seedEntity(label: string): Promise<string> {
  const entity = await prisma.entity.create({
    data: { name: `${TEST_TAG}-${label}`, type: 'food' },
  });
  ids.push(entity.entityId);
  return entity.entityId;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped concurrency test proves nothing.',
    );
  }
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM entity_surface WHERE entity_id = ANY(${ids}::uuid[])`;
  await prisma.entity.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.$disconnect();
});

describe('entity_surface.aliases projection under concurrent writers (FOR UPDATE lock, F1)', () => {
  it('two concurrent addSurfaces calls on the SAME entity both survive in the final projection', async () => {
    const entityId = await seedEntity('concurrent');

    // Two independent transactions, started concurrently, each adding a
    // DIFFERENT form. Without serialization, both read the empty starting
    // state, and whichever COMMITS second overwrites the array with only
    // its own form — the other vanishes. `Promise.all` gives Postgres every
    // chance to interleave them; the FOR UPDATE lock is what prevents it.
    await Promise.all([
      prisma.$transaction((tx) =>
        addSurfaces(tx, entityId, [
          { form: 'writer-alpha-form', source: 'extraction' },
        ]),
      ),
      prisma.$transaction((tx) =>
        addSurfaces(tx, entityId, [
          { form: 'writer-beta-form', source: 'extraction' },
        ]),
      ),
    ]);

    const row = await prisma.entity.findUniqueOrThrow({
      where: { entityId },
      select: { aliases: true },
    });
    expect(new Set(row.aliases)).toEqual(
      new Set(['writer-alpha-form', 'writer-beta-form']),
    );

    // Cross-check against the source of truth (entity_surface rows), not just
    // the derived projection — proves BOTH insert statements landed, not
    // just that the array happens to contain the right strings.
    const rows = await prisma.$queryRaw<Array<{ form: string }>>`
      SELECT form FROM entity_surface
      WHERE entity_id = ${entityId}::uuid AND status = 'active'
      ORDER BY form`;
    expect(rows.map((r) => r.form).sort()).toEqual([
      'writer-alpha-form',
      'writer-beta-form',
    ]);
  });

  it('DETERMINISTIC RACE: widening the read-then-write window with a controlled gate still yields BOTH forms — the lock, not luck, closes it', async () => {
    // Real wall-clock concurrency (the test above) does not reliably force
    // the adversarial interleaving — the read-then-write window inside one
    // transaction is normally too narrow to hit by chance. This test forces
    // it open deterministically via wrapTxWithReadGate, so the assertion is
    // no longer "it happened to survive" but "it survives EVEN WHEN the
    // window is held wide open" — which is exactly the shape the FOR UPDATE
    // lock exists to defeat (writer A's own internal read blocks writer B's
    // internal FOR UPDATE from ever starting, so B cannot even BEGIN its
    // read+write until A's transaction — gate included — has committed).
    const entityId = await seedEntity('deterministic-race');

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    // Witness that the harness's read-gate ACTUALLY engaged. Without this, a
    // divergence between this proxy's `DISTINCT ON (form)` pattern and the
    // service's real SQL turns the gate into a silent pass-through and this
    // "deterministic race" degrades into plain concurrency — which the file's
    // own header certifies as unable to show RED.
    let gateFired = false;

    const writerA = prisma.$transaction(
      (tx) =>
        addSurfaces(
          wrapTxWithReadGate(tx, gate, () => {
            gateFired = true;
          }),
          entityId,
          [{ form: 'race-form-a', source: 'extraction' }],
        ),
      { timeout: 20000 },
    );

    // Give A a moment to reach (and pass) its gated read, then let B run to
    // completion. If the lock is doing its job, B cannot even acquire its
    // own FOR UPDATE yet (A still holds the row), so this AWAIT itself
    // blocks until A eventually commits — B's completion strictly
    // happens-after A's.
    await new Promise((r) => setTimeout(r, 200));
    const writerBDone = prisma.$transaction((tx) =>
      addSurfaces(tx, entityId, [
        { form: 'race-form-b', source: 'extraction' },
      ]),
    );

    // Now widen the window: let A resume its (already-completed) read and
    // proceed to write, WHILE B is still trying to get in.
    await new Promise((r) => setTimeout(r, 100));
    releaseGate();
    await Promise.all([writerA, writerBDone]);

    const row = await prisma.entity.findUniqueOrThrow({
      where: { entityId },
      select: { aliases: true },
    });
    expect(new Set(row.aliases)).toEqual(
      new Set(['race-form-a', 'race-form-b']),
    );
    // The determinism claim is only true if the gate engaged; assert it did.
    expect(gateFired).toBe(true);
  });

  // NOTE (finding, not a test): a THIRD case attempting 5+ fully-concurrent
  // writers on one entity was tried here and removed — it did not exercise
  // a lost update at all. It instead hit a REAL, reproducible Postgres
  // deadlock (SQLSTATE 40P01) between the FOR UPDATE lock and the implicit
  // FOR KEY SHARE lock EntityAlias's FK to Entity takes on insert (a
  // documented Postgres hazard: concurrent inserters each holding the FK's
  // shared lock, each then trying to upgrade to the explicit FOR UPDATE,
  // deadlock on the mutual upgrade). Reproduced twice (5-way and 10-way).
  // This is a genuine, separate finding from F1870's lost-update race: the
  // lock closes the race correctly (proven above), but 3+ truly concurrent
  // writers to the SAME entity can abort with 40P01 instead of queuing
  // cleanly, and no call site retries on that SQLSTATE. Filed as its own
  // observation in the F1870 report rather than "fixed" here per the task's
  // instruction not to alter decision-core behaviour to make a test pass.
});
