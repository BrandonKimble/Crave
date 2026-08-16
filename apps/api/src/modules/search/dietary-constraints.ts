import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/** One dietary wall: a canonical name and the entity ids it walls with, per
 *  projection. A name may lack one side (vegetarian has no venue row today);
 *  the wall then carries only the arms that exist. */
export type DietaryWall = {
  name: string;
  itemAttributeId?: string;
  placeAttributeId?: string;
};

/**
 * Dietary hardness (spec §1.3, owner-ratified): a curated lifestyle set of
 * attribute entities (vegan / vegetarian / gluten free / halal / kosher,
 * flagged `constraint_class='dietary'` in the vocabulary) that the
 * search may NEVER soften. For a vegan user, softening "vegan" is not
 * degradation — it is a wrong answer.
 *
 * CUTOVER 2026-08-02: the exemption lives in the pooled hard/soft split
 * (executePooledStage): dietary-flagged ids stay in the WHERE membership
 * as walls; every unflagged attribute becomes soft per-row provenance
 * for the richness gate. (The old ladder-stage machinery is deleted.)
 */

@Injectable()
export class DietaryConstraintRegistry {
  private readonly logger: LoggerService;
  private cache: {
    pairs: ReadonlyMap<
      string,
      { itemAttributeId?: string; placeAttributeId?: string }
    >;
    expiresAt: number;
  } | null = null;
  /** The vocabulary is ~10 rows and changes only by curation; 5 minutes
   *  bounds staleness without a per-search query. */
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DietaryConstraintRegistry');
  }

  /** The dietary toggle strip's OPTIONS — the curated vocabulary IS the
   *  authority (spec §1.3: "a small CURATED constraintClass flag on the
   *  attribute entities themselves, closed set, owner-approved"). The app
   *  renders whatever this returns, so adding/removing a lifestyle toggle
   *  is a curation act in ONE place, never a hand-list in the client. */
  async listDietaryOptions(): Promise<Array<{ name: string; label: string }>> {
    const pairs = await this.getDietaryPairs();
    return Array.from(pairs.keys())
      .sort()
      .map((name) => ({
        name,
        label: name.replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  }

  /** One dietary WALL per canonical name, with its per-projection ids
   *  (owner semantics 2026-08-04): the DISH projection requires the
   *  dish-side attribute; the RESTAURANT projection passes on venue-side
   *  attribute OR any dish carrying the dish-side attribute. */
  async getDietaryPairs(): Promise<
    ReadonlyMap<string, { itemAttributeId?: string; placeAttributeId?: string }>
  > {
    return this.load();
  }

  async getDietaryIds(): Promise<ReadonlySet<string>> {
    const pairs = await this.load();
    const ids = new Set<string>();
    for (const pair of pairs.values()) {
      if (pair.itemAttributeId) ids.add(pair.itemAttributeId);
      if (pair.placeAttributeId) ids.add(pair.placeAttributeId);
    }
    return ids;
  }

  /**
   * THE ONE WALL DERIVATION. Every lane that can wall — the ranked cards,
   * the map coverage, the saved-list assembler — resolves its walls here.
   *
   * It has to be one function because the two inputs are not interchangeable
   * and only one lane used to read both. A wall is raised by the toggle strip
   * (`dietary: ['vegan']`) OR by the QUERY TEXT grounding to a dietary
   * attribute ("vegan tacos"). The ranked lane honoured both; map coverage
   * read the toggle only. So typing "vegan tacos" without touching the strip
   * returned a walled card list beside an unwalled map — the same search,
   * two different answers about what is vegan, with the map the one lying.
   *
   * Unknown names are ignored (the curated vocabulary is the authority), and
   * a grounded id activates the WHOLE pair, not just the side it matched.
   */
  async resolveDietaryWalls(input: {
    dietary?: readonly string[] | null;
    itemAttributeIds?: readonly string[];
    placeAttributeIds?: readonly string[];
  }): Promise<DietaryWall[]> {
    const pairs = await this.load();
    const names = new Set<string>(
      (input.dietary ?? [])
        .map((name) => name.trim().toLowerCase())
        .filter((name) => pairs.has(name)),
    );
    const grounded = new Set<string>([
      ...(input.itemAttributeIds ?? []),
      ...(input.placeAttributeIds ?? []),
    ]);
    if (grounded.size) {
      for (const [name, pair] of pairs) {
        if (
          (pair.itemAttributeId && grounded.has(pair.itemAttributeId)) ||
          (pair.placeAttributeId && grounded.has(pair.placeAttributeId))
        ) {
          names.add(name);
        }
      }
    }
    const walls = Array.from(names)
      .sort()
      .map((name) => ({ name, ...pairs.get(name)! }));
    // FAIL CLOSED on a degenerate wall (dietary audit §3): a wall whose pair
    // carries NEITHER attribute id (e.g. the curated entity was re-typed as
    // an ingredient) would constrain NOTHING — zero arms = no wall = a
    // silent lie to the user who toggled it. Refuse loudly instead; the
    // standardized failure surface handles it like any other outage.
    for (const wall of walls) {
      if (!wall.itemAttributeId && !wall.placeAttributeId) {
        throw new ServiceUnavailableException({
          code: 'dietary_wall_degenerate',
          message: `dietary wall '${wall.name}' has no attribute arms — refusing to serve unwalled results`,
        });
      }
    }
    return walls;
  }

  /**
   * THE RESTAURANT-PROJECTION WALL, as SQL. A venue passes when it carries
   * the venue-side attribute itself OR any of its dishes carries the
   * dish-side one — deliberately NOT scoped to the query's connection match,
   * because a vegan wall asks "is this a vegan-viable venue", not "does the
   * matching dish happen to be vegan" (that is the dish projection's job).
   *
   * Returns one condition per wall so callers can AND them into whatever
   * WHERE they are already assembling. `entitySurface` is the restaurant-entity
   * alias in the caller's query (`r` in the ranked builder, `e` in coverage);
   * that alias was the ONLY difference between the two byte-equivalent copies
   * this replaces.
   */
  static placeWallConditions(
    walls: readonly DietaryWall[],
    entitySurface: string,
  ): Prisma.Sql[] {
    const alias = Prisma.raw(entitySurface);
    const conditions: Prisma.Sql[] = [];
    for (const wall of walls) {
      const arms: Prisma.Sql[] = [];
      if (wall.placeAttributeId) {
        arms.push(
          Prisma.sql`${alias}.restaurant_attributes @> ARRAY[${wall.placeAttributeId}]::uuid[]`,
        );
      }
      if (wall.itemAttributeId) {
        arms.push(
          Prisma.sql`EXISTS (SELECT 1 FROM core_restaurant_items dc WHERE dc.restaurant_id = ${alias}.entity_id AND dc.food_attributes @> ARRAY[${wall.itemAttributeId}]::uuid[])`,
        );
      }
      if (arms.length) {
        conditions.push(Prisma.sql`(${Prisma.join(arms, ' OR ')})`);
      }
    }
    return conditions;
  }

  /**
   * THE DISH-PROJECTION WALL, as SQL. A dish serves only when it carries the
   * dish-side attribute itself; a wall with no dish-side entity does not
   * constrain dishes at all.
   */
  static dishWallConditions(
    walls: readonly DietaryWall[],
    connectionAlias: string,
  ): Prisma.Sql[] {
    const alias = Prisma.raw(connectionAlias);
    return walls
      .filter((wall) => wall.itemAttributeId)
      .map(
        (wall) =>
          Prisma.sql`${alias}.food_attributes @> ARRAY[${wall.itemAttributeId}]::uuid[]`,
      );
  }

  /** The cached primitive. Pairs are what every caller actually needs; the
   *  id set is DERIVED from them. Previously `getDietaryIds` cached and
   *  `getDietaryPairs` issued an unconditional second query on top of it —
   *  so the docblock's "bounds staleness without a per-search query" was
   *  false on the pairs path, which is the one every dietary search takes. */
  private async load(): Promise<
    ReadonlyMap<string, { itemAttributeId?: string; placeAttributeId?: string }>
  > {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.pairs;
    }
    try {
      const rows = await this.prisma.entity.findMany({
        where: { constraintClass: 'dietary', status: 'active' },
        select: { entityId: true, name: true, type: true },
      });
      const pairs = new Map<
        string,
        { itemAttributeId?: string; placeAttributeId?: string }
      >();
      for (const row of rows) {
        const key = row.name.toLowerCase();
        const pair = pairs.get(key) ?? {};
        if (row.type === 'item_attribute') pair.itemAttributeId = row.entityId;
        if (row.type === 'place_attribute')
          pair.placeAttributeId = row.entityId;
        pairs.set(key, pair);
      }
      this.cache = {
        pairs,
        expiresAt: now + DietaryConstraintRegistry.TTL_MS,
      };
      return pairs;
    } catch (error) {
      // Stale beats empty — but EMPTY IS FORBIDDEN (audit H2): a dietary
      // wall is a hard promise ("softening vegan is not degradation — it is
      // a wrong answer", top of this file), and an empty map silently serves
      // a vegan user non-vegan results on the first request after any
      // boot+DB-blip. With no stale cache to fall back on, the search FAILS
      // LOUDLY instead of lying. Boot preload (onModuleInit) makes this
      // branch unreachable in practice.
      this.logger.error('Dietary registry load failed', {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      if (this.cache) {
        return this.cache.pairs;
      }
      throw new ServiceUnavailableException({
        code: 'dietary_registry_unavailable',
        message:
          'dietary constraint registry unavailable and no cached copy exists — refusing to serve unwalled results',
      });
    }
  }

  /** Boot preload (audit H2): the registry is ~12 curated rows; loading it
   *  at startup means the cold-cache fail-closed path above is unreachable
   *  unless the DB is down AT boot — in which case the app refuses to start
   *  serving anyway. Failure here only warns; the per-request path retries. */
  async onModuleInit(): Promise<void> {
    try {
      await this.load();
    } catch {
      // per-request loads will retry; the fail-closed guard covers the gap
    }
  }
}
