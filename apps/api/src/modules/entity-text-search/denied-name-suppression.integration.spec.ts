/**
 * C4a DENIALS REACH THE NAME ARMS (R15 defect 2, 2026-08-16) — against a REAL
 * Postgres (integration).
 *
 * THE DEFECT: a `notAName` verdict from the restaurant-name court deprecates
 * the form's entity_surface rows, but autocomplete's exact/prefix arms and the
 * gazetteer's identity/name arms match core_entities.name / identity_key
 * DIRECTLY — so a denied ghost name stayed fully reachable (live probe: the 14
 * applied batch-1 denials — 'Bistro', 'Cozy', 'Fonda', … — all still served
 * exact-top, and 'cozy'/'fonda' spans still annihilated searches).
 *
 * THE LAW UNDER TEST: an (entityId, folded form) with a live notAName verdict
 * at the rule + fold version IN FORCE is excluded from name/identity matching
 * wherever names are matched — the FTS/trgm lattice, the short-term prefix
 * lane, the edit lane, and the gazetteer scan. The read is the ledger itself
 * (DeniedNameRegistryService), never a hand list. Name-hood ≠ searchability:
 * only notAName suppresses; an upheld or unheard name matches exactly as
 * before, and a denied-name entity stays reachable through its OTHER active
 * adjudicated surfaces.
 *
 * MUTATION PROOF (in-spec, permanent): the same queries run twice — once
 * through the real registry (must NOT serve) and once through an
 * empty-registry service, which IS the code with the exclusion dropped (must
 * serve). If the anti-join is ever removed, the first half goes RED; if the
 * arms ever over-suppress, the alias/control half goes RED.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { EntityTextSearchService } from './entity-text-search.service';
import { DeniedNameRegistryService } from './denied-name-registry.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import { deletionVariants, editBudgetForToken } from './entity-lexicon';
import { PLACE_NAME_RULE_VERSION } from '../content-processing/entity-resolver/restaurant-name-rule';
import {
  PLACE_NAME_LANE,
  placeNameLane,
} from '../content-processing/entity-resolver/restaurant-name-lane';

// A synthetic generic-word ghost no real corpus row can collide with.
const DENIED_NAME = 'Zzqdenied';
const DENIED_FOLD = canonicalFold(DENIED_NAME); // 'zzqdenied'
// A surviving adjudicated alias on the same entity: the denial must not
// take the entity's OTHER recall surfaces with it.
const SURVIVING_ALIAS = 'zzqsurvivor tavern';

const ENTITY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0c4a';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const registry = new DeniedNameRegistryService(prisma as never, logger);
const service = new EntityTextSearchService(
  prisma as never,
  {} as never,
  logger,
  registry,
);
// THE MUTATION STAND-IN: an empty registry is byte-for-byte the pre-fix code
// path (the dn join becomes a constant-empty relation). It proves the
// exclusion — not corpus luck — is what suppresses the name.
const unguardedService = new EntityTextSearchService(
  prisma as never,
  {} as never,
  logger,
  {
    deniedNamePairs: () => Promise.resolve([]),
    isDeniedName: () => Promise.resolve(false),
  } as never,
);

async function cleanup() {
  await prisma.entityWordDelete.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.$executeRaw`
    DELETE FROM claim_verdicts
     WHERE lane = ${PLACE_NAME_LANE}
       AND claim_key = ${`${ENTITY_ID}|${DENIED_FOLD}`}`;
  await prisma.entitySurface.deleteMany({ where: { entityId: ENTITY_ID } });
  await prisma.entity.deleteMany({ where: { entityId: ENTITY_ID } });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL anti-join and must not be skipped',
    );
  }
  await cleanup();
  await prisma.entity.create({
    data: {
      entityId: ENTITY_ID,
      name: DENIED_NAME,
      identityKey: DENIED_FOLD,
      identityKeySorted: DENIED_FOLD,
      type: 'place',
    },
  });
  await prisma.entitySurface.create({
    data: {
      entityId: ENTITY_ID,
      form: SURVIVING_ALIAS,
      formFolded: canonicalFold(SURVIVING_ALIAS),
      locale: 'und',
      source: 'seed',
      status: 'active',
    },
  });
  // The court's ruling, as the hearing service records it: live at the rule +
  // fold version IN FORCE (the registry's `=` version discipline is part of
  // what this spec pins — a stale-version denial must NOT suppress).
  await prisma.claimVerdict.create({
    data: {
      lane: PLACE_NAME_LANE,
      claimKey: `${ENTITY_ID}|${DENIED_FOLD}`,
      ruleVersion: PLACE_NAME_RULE_VERSION,
      foldVersion: placeNameLane.keyFoldVersion,
      outcome: 'notAName',
      reason: 'spec seed: synthetic denied ghost name',
      subject: {},
    },
  });
  // The edit lane reads the PRECOMPUTED delete dictionary — seed exactly the
  // rows the lexicon builder would derive for the denied name, so the edit
  // test exercises a fed lane rather than passing vacuously on an empty one.
  await prisma.entityWordDelete.createMany({
    data: deletionVariants(DENIED_FOLD, editBudgetForToken(DENIED_FOLD)).map(
      (variant) => ({
        deleteKey: variant,
        word: DENIED_FOLD,
        entityId: ENTITY_ID,
        entityType: 'place' as const,
        isAlias: false,
      }),
    ),
    skipDuplicates: true,
  });
  registry.invalidate();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('a live notAName verdict suppresses the name arms', () => {
  it('the FTS/trgm lattice no longer serves the denied name (autocomplete exact/prefix path)', async () => {
    const matches = await service.searchEntities(DENIED_FOLD, ['place'], 20);
    expect(matches.map((m) => m.entityId)).not.toContain(ENTITY_ID);
  });

  it('MUTATION: the identical query with the exclusion dropped serves it exact-top — the anti-join is the mechanism', async () => {
    const matches = await unguardedService.searchEntities(
      DENIED_FOLD,
      ['place'],
      20,
    );
    const hit = matches.find((m) => m.entityId === ENTITY_ID);
    expect(hit?.evidence).toBe('exact');
  });

  it('the gazetteer scan emits no span for the denied name', async () => {
    const groups = await service.scanForKnownEntityGroups(
      `best ${DENIED_FOLD} tacos`,
      ['place'],
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).not.toContain(ENTITY_ID);
  });

  it('MUTATION: the gazetteer with the exclusion dropped still grounds it', async () => {
    const groups = await unguardedService.scanForKnownEntityGroups(
      `best ${DENIED_FOLD} tacos`,
      ['place'],
    );
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).toContain(ENTITY_ID);
  });

  it('the edit lane no longer reaches the denied name through a typo', async () => {
    // One deletion inside the word — the delete-dictionary lane's territory.
    const typo = DENIED_FOLD.slice(0, 4) + DENIED_FOLD.slice(5);
    const matches = await service.searchEntities(typo, ['place'], 20);
    expect(matches.map((m) => m.entityId)).not.toContain(ENTITY_ID);
  });

  it('MUTATION: the typo query with the exclusion dropped reaches it (fuzzy/edit lanes) — the gate is the mechanism', async () => {
    const typo = DENIED_FOLD.slice(0, 4) + DENIED_FOLD.slice(5);
    const matches = await unguardedService.searchEntities(typo, ['place'], 20);
    expect(matches.map((m) => m.entityId)).toContain(ENTITY_ID);
  });
});

describe('the denial takes ONLY the name — nothing else', () => {
  it('the entity stays reachable through its surviving adjudicated alias', async () => {
    const groups = await service.scanForKnownEntityGroups(SURVIVING_ALIAS, [
      'place',
    ]);
    const ids = groups.flatMap((g) => g.entities.map((e) => e.entityId));
    expect(ids).toContain(ENTITY_ID);
  });

  it('a denial at a SUPERSEDED rule version suppresses nothing (the ledger `=` discipline)', async () => {
    await prisma.$executeRaw`
      UPDATE claim_verdicts SET rule_version = ${PLACE_NAME_RULE_VERSION - 1}
       WHERE lane = ${PLACE_NAME_LANE}
         AND claim_key = ${`${ENTITY_ID}|${DENIED_FOLD}`}`;
    registry.invalidate();
    try {
      // limit 21 ≠ 20 on purpose: the service's 30s term cache would
      // otherwise replay the suppressed result from the first test.
      const matches = await service.searchEntities(DENIED_FOLD, ['place'], 21);
      expect(matches.map((m) => m.entityId)).toContain(ENTITY_ID);
    } finally {
      await prisma.$executeRaw`
        UPDATE claim_verdicts SET rule_version = ${PLACE_NAME_RULE_VERSION}
         WHERE lane = ${PLACE_NAME_LANE}
           AND claim_key = ${`${ENTITY_ID}|${DENIED_FOLD}`}`;
      registry.invalidate();
    }
  });
});
