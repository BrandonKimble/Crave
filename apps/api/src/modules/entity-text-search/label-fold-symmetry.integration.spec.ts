/**
 * THE LABELS MATCH ARM FOLDS BOTH SIDES (F7600) — against a REAL Postgres
 * (integration).
 *
 * THE DEFECT: labels double as match surfaces (scanForKnownEntityGroups arm
 * 4, locale-chained). The N1 fold-symmetry law folds BOTH sides of every
 * match — arms 1-3 honor it (identity_key and entity_alias.form_folded are
 * canonicalFold'd) — but the labels arm compared the FOLDED query candidate
 * against `LOWER(el.form)`. So `lower('...café especial')` = the accented
 * lowercase form can never equal the folded candidate `...cafe especial`, and
 * every accented/apostrophe label — 2,262 of 11,068 active rows (20.4%),
 * overwhelmingly the Spanish rows the arm exists to serve — was structurally
 * unmatchable. The fix gives entity_labels a fold-written `form_folded`
 * column (entity_alias's exact shape) and matches on it.
 *
 * WHY A DB SPEC: the bug is entirely in how Postgres compares a folded
 * candidate against a stored form. A mock cannot demonstrate it; only a real
 * row and a real match arm can.
 *
 * THE SEED IS ADVERSARIAL: the label form carries an accent (`é`) and a
 * cedilla (`ç`), so the folded form differs from `LOWER(form)`. The entity's
 * name and aliases are unrelated, so the LABELS arm is the ONLY path that can
 * ground it — if the arm misses, the entity is unreachable.
 *
 * MUTATION: revert arm 4 to `LOWER(el.form) = ANY(candidates)` (and drop the
 * foldedLabels SELECT) and this spec goes RED — the accented label no longer
 * matches its folded candidate. Verified in both directions.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { PrismaClient } from '@prisma/client';
import { EntityTextSearchService } from './entity-text-search.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';

const TEST_TAG = 'itest-label-fold';
// A synthetic accented surface no real corpus row can collide with. Its fold
// (`zzqcafe especial`) differs from lower(form) (`zzqçafé especial`), which
// is the whole point.
const LABEL_FORM = 'zzqçafé especial';
const FOLDED = canonicalFold(LABEL_FORM); // 'zzqcafe especial'

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
      // Unrelated name/aliases: the LABELS arm is the only path to this row.
      name: `${TEST_TAG}-unrelated-name`,
      type: 'food_attribute',
    },
  });
  await prisma.entityLabel.create({
    data: {
      entityId: ENTITY_ID,
      locale: 'es',
      form: LABEL_FORM,
      formFolded: canonicalFold(LABEL_FORM),
      status: 'active',
      source: 'seed',
    },
  });
});

afterAll(async () => {
  await prisma.entityLabel.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.entity.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.$disconnect();
});

describe('scanForKnownEntityGroups: an accented es label is reachable by its folded candidate (F7600)', () => {
  it('grounds the entity when the query carries the accent (query side always folds)', async () => {
    const groups = await service.scanForKnownEntityGroups(
      LABEL_FORM,
      ['food_attribute'],
      { requestLocale: 'es' },
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).toContain(ENTITY_ID);
  });

  it('grounds the entity when the query is typed WITHOUT the accent (both sides fold to the same key)', async () => {
    // 'zzqcafe especial' folds to itself and must reach the accented label.
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
      LABEL_FORM,
      ['food_attribute'],
      {},
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).not.toContain(ENTITY_ID);
  });
});
