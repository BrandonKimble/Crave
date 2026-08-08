/**
 * THE ALIAS MATCH ARM FOLDS BOTH SIDES (F7600's surviving law) — against a
 * REAL Postgres (integration).
 *
 * HISTORY: this spec was born as label-fold-symmetry (F7600) when labels
 * doubled as match surfaces (the former arm 4). The claims registry
 * (§9.9, commit 8f7e4096c) removed that arm — labels are DISPLAY-only,
 * every label surface worth grounding was reconciled into entity_alias
 * through the collision guard + word-claim adjudicator, and the standing
 * KnowledgeMaintenanceService keeps reconciling. The fold-symmetry law the
 * finding established therefore lives on in the ALIAS arm: an accented
 * stored surface must be reachable both by its accented spelling and by its
 * folded spelling, because the query side always folds.
 *
 * WHY A DB SPEC: the match is a SQL comparison of the folded candidate
 * against entity_alias.form_folded. A mock cannot demonstrate it; only a
 * real row and the real arm can.
 *
 * THE SEED IS ADVERSARIAL: the alias form carries an accent (`é`) and a
 * cedilla (`ç`), so canonicalFold(form) differs from LOWER(form). The
 * entity's name and legacy aliases[] are unrelated, so the entity_alias arm
 * is the ONLY path that can ground it — if the arm misses, the entity is
 * unreachable.
 *
 * MUTATION: seed formFolded with LOWER(form) instead of canonicalFold(form)
 * (the write-side half of the law) — both grounding tests go RED. Verified
 * on this rewrite (2026-08-08).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { EntityTextSearchService } from './entity-text-search.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

const TEST_TAG = 'itest-alias-fold';
// A synthetic accented surface no real corpus row can collide with. Its fold
// (`zzqcafe especial`) differs from lower(form) (`zzqçafé especial`), which
// is the whole point.
const ALIAS_FORM = 'zzqçafé especial';
const FOLDED = canonicalFold(ALIAS_FORM); // 'zzqcafe especial'

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new EntityTextSearchService(
  prisma as never,
  {} as never,
  logger,
);

const ENTITY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee7600';

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL fold match and must not be skipped',
    );
  }

  await prisma.entity.create({
    data: {
      entityId: ENTITY_ID,
      // Unrelated name/aliases: the entity_alias arm is the only path.
      name: `${TEST_TAG}-unrelated-name`,
      type: 'food_attribute',
    },
  });
  await prisma.entityAlias.create({
    data: {
      entityId: ENTITY_ID,
      form: ALIAS_FORM,
      // Written the way addAliases() writes it — the fold IS the law's
      // write-side half; the arm's read side matches against it.
      formFolded: canonicalFold(ALIAS_FORM),
      locale: 'es',
      source: 'seed',
      status: 'active',
    },
  });
});

afterAll(async () => {
  await prisma.entityAlias.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.entity.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.$disconnect();
});

describe('scanForKnownEntityGroups: an accented es alias is reachable by its folded candidate (F7600 on the alias store)', () => {
  it('grounds the entity when the query carries the accent (query side always folds)', async () => {
    const groups = await service.scanForKnownEntityGroups(
      ALIAS_FORM,
      ['food_attribute'],
      { requestLocale: 'es' },
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).toContain(ENTITY_ID);
  });

  it('grounds the entity when the query is typed WITHOUT the accent (both sides fold to the same key)', async () => {
    // 'zzqcafe especial' folds to itself and must reach the accented alias.
    const groups = await service.scanForKnownEntityGroups(
      FOLDED,
      ['food_attribute'],
      { requestLocale: 'es' },
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).toContain(ENTITY_ID);
  });

  it('does NOT ground it when no request locale is given (arm is locale-chained, chain is [und])', async () => {
    const groups = await service.scanForKnownEntityGroups(
      ALIAS_FORM,
      ['food_attribute'],
      {},
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).not.toContain(ENTITY_ID);
  });
});
