import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * The Signals Ledger write path (geo-demand master plan §3).
 *
 * RETENTION INVARIANT — the ledger is APPEND-ONLY, IMMUTABLE, and permanent:
 * this service exposes ONLY record(). There is no update or delete path, by
 * law. Identity merges never touch the ledger (readers resolve subjects
 * through entity_redirects at read time); the deletion story severs the
 * pseudonymous actor mapping (signal_actors), never signal rows.
 *
 * A write failure never fails the user action: record() is fire-and-forget —
 * it never throws into the caller and must never be awaited on a hot path.
 */

/** ACT kinds only — qualifiers ("unresolved", "low-result", "cached") live in
 *  meta and are judged at read time, re-definable forever (§3). */
export type SignalKind =
  | 'search'
  | 'autocomplete_selection'
  | 'entity_view'
  | 'favorite_added'
  | 'poll_vote'
  | 'poll_comment'
  | 'poll_created'
  | 'viewport_dwell';

/** Geo is ALWAYS a bbox; a point is a zero-area bbox (§3). */
export interface SignalBbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Subject: a catalog entity, a free term (normalized), or none. */
export type SignalSubject = { entityId: string } | { term: string } | null;

export interface RecordSignalInput {
  kind: SignalKind;
  /** Authenticated actor. */
  userId?: string | null;
  /** Anonymous actor (per-device pseudonymous id). */
  deviceKey?: string | null;
  subject?: SignalSubject;
  /**
   * Resolved bbox, or a promise for one (lazy lookups — market bbox, primary
   * location — stay off the caller's hot path; record() awaits internally).
   * null / resolved-null skips the write with a once-per-key debug log.
   */
  geo: SignalBbox | Promise<SignalBbox | null> | null;
  occurredAt?: Date;
  meta?: Record<string, unknown> | null;
}

const ACTOR_CACHE_MAX = 10_000;
const MARKET_BBOX_CACHE_MAX = 1_000;

@Injectable()
export class SignalsService {
  private readonly logger: LoggerService;
  /** cacheKey ("u:<userId>" | "d:<deviceKey>") -> actorId */
  private readonly actorIdCache = new Map<string, string>();
  /** lowercased marketKey -> bbox (null cached too: known-missing markets) */
  private readonly marketBboxCache = new Map<string, SignalBbox | null>();
  /** Skip conditions log once per key per process — never spam the hot path. */
  private readonly loggedSkips = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SignalsService');
  }

  /**
   * Record one signal. Fire-and-forget: never throws, never needs awaiting.
   * Skips (no actor, no geo) are debug-logged once per reason key.
   */
  record(input: RecordSignalInput): void {
    try {
      void this.persist(input).catch((error: unknown) => {
        this.logger.warn('Signal write failed (user action unaffected)', {
          kind: input.kind,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: String(error) },
        });
      });
    } catch (error) {
      // Synchronous failure (should be unreachable) — same law: never throw.
      this.logger.warn('Signal write failed synchronously', {
        kind: input.kind,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Bbox from a map-bounds pair; normalizes any corner ordering. */
  bboxFromBounds(
    bounds:
      | {
          northEast: { lat: number; lng: number };
          southWest: { lat: number; lng: number };
        }
      | null
      | undefined,
  ): SignalBbox | null {
    if (!bounds?.northEast || !bounds.southWest) {
      return null;
    }
    const { northEast, southWest } = bounds;
    if (
      ![northEast.lat, northEast.lng, southWest.lat, southWest.lng].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      return null;
    }
    return {
      minLat: Math.min(southWest.lat, northEast.lat),
      maxLat: Math.max(southWest.lat, northEast.lat),
      minLng: Math.min(southWest.lng, northEast.lng),
      maxLng: Math.max(southWest.lng, northEast.lng),
    };
  }

  /** Zero-area bbox from a point (§3: geo is ALWAYS a bbox). */
  bboxFromPoint(lat: number, lng: number): SignalBbox | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng };
  }

  /**
   * Market bbox via core_markets (cached; nulls cached too). Falls back to the
   * market's center as a zero-area bbox when it has no stored bbox. Never
   * rejects — safe to pass un-awaited as RecordSignalInput.geo.
   */
  async bboxFromMarketKey(
    marketKey: string | null | undefined,
  ): Promise<SignalBbox | null> {
    const key = marketKey?.trim().toLowerCase();
    if (!key) {
      return null;
    }
    const cached = this.marketBboxCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const market = await this.prisma.market.findFirst({
        where: { marketKey: { equals: key, mode: 'insensitive' } },
        select: {
          bboxNeLat: true,
          bboxNeLng: true,
          bboxSwLat: true,
          bboxSwLng: true,
          centerLatitude: true,
          centerLongitude: true,
        },
      });
      let bbox: SignalBbox | null = null;
      if (
        market?.bboxNeLat != null &&
        market.bboxNeLng != null &&
        market.bboxSwLat != null &&
        market.bboxSwLng != null
      ) {
        bbox = this.bboxFromBounds({
          northEast: {
            lat: Number(market.bboxNeLat),
            lng: Number(market.bboxNeLng),
          },
          southWest: {
            lat: Number(market.bboxSwLat),
            lng: Number(market.bboxSwLng),
          },
        });
      } else if (
        market?.centerLatitude != null &&
        market.centerLongitude != null
      ) {
        bbox = this.bboxFromPoint(
          Number(market.centerLatitude),
          Number(market.centerLongitude),
        );
      }
      this.cachePut(this.marketBboxCache, key, bbox, MARKET_BBOX_CACHE_MAX);
      return bbox;
    } catch (error) {
      this.logger.debug('Market bbox lookup failed', {
        marketKey: key,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  /**
   * Zero-area bbox from a restaurant location: the given locationId when
   * provided, else the restaurant's primary (or any coordinated) location.
   * Never rejects — safe to pass un-awaited as RecordSignalInput.geo.
   */
  async bboxFromRestaurantLocation(args: {
    restaurantId: string;
    locationId?: string | null;
  }): Promise<SignalBbox | null> {
    try {
      const location = args.locationId
        ? await this.prisma.restaurantLocation.findFirst({
            where: {
              locationId: args.locationId,
              restaurantId: args.restaurantId,
            },
            select: { latitude: true, longitude: true },
          })
        : await this.prisma.restaurantLocation.findFirst({
            where: {
              restaurantId: args.restaurantId,
              latitude: { not: null },
              longitude: { not: null },
            },
            orderBy: { isPrimary: 'desc' },
            select: { latitude: true, longitude: true },
          });
      if (location?.latitude == null || location.longitude == null) {
        return null;
      }
      return this.bboxFromPoint(
        Number(location.latitude),
        Number(location.longitude),
      );
    } catch (error) {
      this.logger.debug('Restaurant location bbox lookup failed', {
        restaurantId: args.restaurantId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async persist(input: RecordSignalInput): Promise<void> {
    const actorId = await this.resolveActorId(
      input.userId ?? null,
      input.deviceKey ?? null,
    );
    if (!actorId) {
      this.skipOnce(`${input.kind}:no-actor`, 'Signal skipped: no actor', {
        kind: input.kind,
      });
      return;
    }

    const geo = await Promise.resolve(input.geo);
    if (!geo) {
      this.skipOnce(`${input.kind}:no-geo`, 'Signal skipped: no geo bbox', {
        kind: input.kind,
      });
      return;
    }

    const subject = input.subject ?? null;
    const subjectId =
      subject && 'entityId' in subject ? subject.entityId : null;
    const term =
      subject && 'term' in subject
        ? subject.term.trim().toLowerCase().slice(0, 255)
        : null;
    const subjectText = term?.length ? term : null;

    await this.prisma.signal.create({
      data: {
        kind: input.kind,
        subjectType: subjectId ? 'entity' : subjectText ? 'term' : 'none',
        subjectId,
        subjectText,
        geoMinLat: geo.minLat,
        geoMinLng: geo.minLng,
        geoMaxLat: geo.maxLat,
        geoMaxLng: geo.maxLng,
        actorId,
        occurredAt: input.occurredAt ?? new Date(),
        meta: input.meta
          ? (this.compactMeta(input.meta) as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
  }

  /**
   * Pseudonymous actor resolution: upsert-by-userId (or deviceKey for
   * anonymous), creating the signal_actors row on first sight; the mapping is
   * cached in-memory. Returns null when the act carries no identity at all.
   */
  private async resolveActorId(
    userId: string | null,
    deviceKey: string | null,
  ): Promise<string | null> {
    const cacheKey = userId
      ? `u:${userId}`
      : deviceKey
        ? `d:${deviceKey}`
        : null;
    if (!cacheKey) {
      return null;
    }
    const cached = this.actorIdCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const where = userId ? { userId } : { deviceKey: deviceKey as string };
    const actor = await this.prisma.signalActor.upsert({
      where,
      update: {},
      create: { userId: userId ?? null, deviceKey: userId ? null : deviceKey },
      select: { actorId: true },
    });
    this.cachePut(this.actorIdCache, cacheKey, actor.actorId, ACTOR_CACHE_MAX);
    return actor.actorId;
  }

  /** Drop undefined values so meta stores exactly what the caller asserted. */
  private compactMeta(meta: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(meta).filter(([, value]) => value !== undefined),
    );
  }

  private cachePut<V>(
    cache: Map<string, V>,
    key: string,
    value: V,
    max: number,
  ): void {
    if (cache.size >= max) {
      for (const oldest of cache.keys()) {
        cache.delete(oldest);
        break;
      }
    }
    cache.set(key, value);
  }

  private skipOnce(
    key: string,
    message: string,
    metadata: Record<string, unknown>,
  ): void {
    if (this.loggedSkips.has(key)) {
      return;
    }
    this.loggedSkips.add(key);
    this.logger.debug(`${message} (logged once per process)`, metadata);
  }
}
