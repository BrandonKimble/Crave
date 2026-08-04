/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
/**
 * ONE ANSWER TO "IS THIS A LIVE, SAVEABLE ENTITY?" (D36 / F602+F621+F661+F682).
 *
 * Two halves:
 *  1. the LAW itself — redirect hop, then type, then status='active';
 *  2. the COUPLING — the four surfaces that used to answer it independently
 *     (a save, a photo ticket, a view record, a DM share preview) ask this
 *     resolver and hold no inline entity check of their own. Half 2 is the
 *     part that keeps the divergence from growing back: the defect was never
 *     one wrong line, it was four sites with four different subsets of
 *     {redirect, type, status}.
 *
 * MUTATION RECIPES:
 *  - drop `status: EntityStatus.active` from resolve() → the archived case
 *    goes RED (an archived restaurant becomes saveable / photographable).
 *  - drop the entityRedirect lookup → the merged-away case goes RED.
 *  - drop `type` → the food-id-as-restaurant case goes RED.
 *  - re-inline `this.prisma.entity.findUnique` in any of the four surfaces →
 *    the coupling test names that file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaveableEntityResolver } from './saveable-entity.resolver';

const LIVE = 'live-restaurant';
const ARCHIVED = 'archived-restaurant';
const PENDING = 'pending-restaurant';
const FOOD = 'a-food';
const MERGED_AWAY = 'merge-loser';

const ROWS: Record<
  string,
  { entityId: string; name: string; type: string; status: string }
> = {
  [LIVE]: {
    entityId: LIVE,
    name: 'Live Room',
    type: 'restaurant',
    status: 'active',
  },
  [ARCHIVED]: {
    entityId: ARCHIVED,
    name: 'Gone',
    type: 'restaurant',
    status: 'archived',
  },
  [PENDING]: {
    entityId: PENDING,
    name: 'Maybe',
    type: 'restaurant',
    status: 'pending',
  },
  [FOOD]: { entityId: FOOD, name: 'Taco', type: 'food', status: 'active' },
};

const REDIRECTS: Record<string, string> = { [MERGED_AWAY]: LIVE };

function makeResolver() {
  const prisma = {
    entityRedirect: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          REDIRECTS[where.fromEntityId]
            ? { toEntityId: REDIRECTS[where.fromEntityId] }
            : null,
        ),
      ),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.fromEntityId.in
            .filter((id: string) => REDIRECTS[id])
            .map((id: string) => ({
              fromEntityId: id,
              toEntityId: REDIRECTS[id],
            })),
        ),
      ),
    },
    entity: {
      findFirst: jest.fn(({ where }: any) => {
        const row = ROWS[where.entityId];
        if (!row) return Promise.resolve(null);
        if (where.type && row.type !== where.type) return Promise.resolve(null);
        if (where.status && row.status !== where.status) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.entityId.in
            .map((id: string) => ROWS[id])
            .filter(
              (row: any) =>
                row &&
                (!where.type || row.type === where.type) &&
                (!where.status || row.status === where.status),
            ),
        ),
      ),
    },
  };
  return new SaveableEntityResolver(prisma as never);
}

describe('the saveable-entity law: redirect → type → active', () => {
  it('a live restaurant resolves to itself', async () => {
    await expect(
      makeResolver().resolveSaveableRestaurant(LIVE),
    ).resolves.toMatchObject({ entityId: LIVE });
  });

  it('a MERGED-AWAY id resolves to its survivor (one hop) — the F661 over-refusal', async () => {
    await expect(
      makeResolver().resolveSaveableRestaurant(MERGED_AWAY),
    ).resolves.toMatchObject({ entityId: LIVE });
  });

  it('an ARCHIVED restaurant is refused — the F602/F621/F682 leak', async () => {
    await expect(
      makeResolver().resolveSaveableRestaurant(ARCHIVED),
    ).resolves.toBeNull();
  });

  it('a PENDING restaurant is refused too (the share resolver\'s semantics, not "not archived")', async () => {
    await expect(
      makeResolver().resolveSaveableRestaurant(PENDING),
    ).resolves.toBeNull();
  });

  it('a FOOD id passed as a restaurant is refused, and vice versa', async () => {
    const resolver = makeResolver();
    await expect(resolver.resolveSaveableRestaurant(FOOD)).resolves.toBeNull();
    await expect(resolver.resolveSaveableFood(LIVE)).resolves.toBeNull();
    await expect(resolver.resolveSaveableFood(FOOD)).resolves.toMatchObject({
      entityId: FOOD,
    });
  });

  it('the batch form is keyed by the id that was ASKED, and omits what does not resolve', async () => {
    const live = await makeResolver().resolveActiveByIds([
      LIVE,
      MERGED_AWAY,
      ARCHIVED,
    ]);
    expect(live.get(LIVE)?.entityId).toBe(LIVE);
    // The caller keeps its stored id and learns what it means today.
    expect(live.get(MERGED_AWAY)?.entityId).toBe(LIVE);
    expect(live.has(ARCHIVED)).toBe(false);
  });
});

describe('the coupling: four surfaces, one law', () => {
  const SURFACES = [
    ['a save', '../user-lists/user-lists.service.ts'],
    ['a photo ticket', '../photos/photos.service.ts'],
    ['a view record', '../history/history.service.ts'],
    ['a DM share preview', '../messaging/share-package-resolver.service.ts'],
  ] as const;

  it.each(SURFACES)(
    '%s asks the resolver and keeps no inline core_entities check',
    (_label, relativePath) => {
      const source = readFileSync(join(__dirname, relativePath), 'utf8');
      expect(source).toContain('saveableEntities.resolveSaveable');
      // The four divergent inline checks are DELETED, not merely bypassed —
      // a second door is how the divergence grew the first time.
      expect(source).not.toContain('prisma.entity.findUnique');
      expect(source).not.toContain('prisma.entity.findFirst');
    },
  );
});
