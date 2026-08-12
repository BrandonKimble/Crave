import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { normalizeDetectedLocaleTag } from '../../shared/locale';

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
  | 'viewport_dwell'
  /** A user-expressed collection gap (unresolved / low-result search term) —
   *  the §11 UNMET family's input. Replaced collection_on_demand_ask_events
   *  (Phase C). */
  | 'on_demand_ask';

/**
 * ECHO KINDS — the act-grain law (wave-5 F2) restated at kind granularity for
 * the AGGREGATE mass readers (poll-supply swap leg, owner-ratified docket
 * item 7).
 *
 * One user ACT weighs exactly 1 in demand mass, but one act deliberately
 * writes SEVERAL ledger rows: a selected failing search mints 'search' +
 * 'autocomplete_selection' (sharing meta.searchRequestId) + 'on_demand_ask'
 * rows (meta.askSearchRequestId carrying the SAME originating
 * searchRequestId). The aggregate keeps every kind (per-kind rows are the
 * point — kind-filtered readers need them), so summing aggregate rows would
 * weigh that act 2–6×.
 *
 * The kinds listed here are BY CONSTRUCTION echoes of a parent 'search' act —
 * their writers ALWAYS attach the parent's request id and the parent row is
 * always written in the same flow:
 * - autocomplete_selection: written only inside recordSearchSignals
 *   (search.service), immediately after the 'search' row, always with
 *   meta.searchRequestId = the parent's id.
 * - on_demand_ask: written only by on-demand-request.service with
 *   meta.askSearchRequestId = context.searchRequestId; both call sites
 *   (interpretation-time 'unresolved' + search-time 'low_result') mint/reuse
 *   the searchRequestId before asking, and the parent 'search' signal records
 *   for every submit.
 *
 * Consequence: excluding these kinds from subjectless place MASS reads is
 * EXACTLY act-grain dedupe restated per kind — the parent 'search' row
 * carries the act's weight-1 and its subject halves. Every OTHER kind
 * ('search' incl. cached reveals per docket item 8, entity_view,
 * favorite_added, poll_vote, poll_comment, poll_created, viewport_dwell) is a
 * standalone act and weighs 1. Kind-FILTERED readers (territoryUnmetAsks,
 * autocomplete lanes) keep reading echo rows directly — there the echo IS the
 * act being asked about.
 *
 * INVARIANT (spec-asserted at the writers): a kind belongs here iff its
 * writer always attaches a parent act's request id. A hypothetical standalone
 * selection/ask writer would break the law — the writer specs pin it shut.
 */
export const ECHO_SIGNAL_KINDS = [
  'autocomplete_selection',
  'on_demand_ask',
] as const satisfies readonly SignalKind[];

/** A geometry-shaped act's geo is a bbox; a point is a zero-area bbox (§3);
 *  an ANCHORED act (docket #3) carries NO geo at all — its WHERE is its
 *  place. Longitude is
 *  WRAP-AWARE: minLng > maxLng means the bbox CROSSES the antimeridian and
 *  covers [minLng, 180] ∪ [-180, maxLng] (the places-catalog representation;
 *  readers OR-split crossing rows — demand-mass reader red-team 3c). */
export interface SignalBbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * Subject: a catalog entity, a free term (normalized), or none. An act may
 * carry BOTH (a search whose text resolved to an entity records subjectId =
 * the entity AND subjectText = the query term) — subjectType is 'entity'
 * whenever an entity is present; the term column still serves term readers
 * (recent searches, query suggestions) without a second row.
 */
export type SignalSubject = {
  entityId?: string | null;
  term?: string | null;
} | null;

export interface RecordSignalInput {
  kind: SignalKind;
  /** Authenticated actor. */
  userId?: string | null;
  /** Anonymous actor (per-device pseudonymous id). NOTE: convention since
   *  the vote-integrity red team — device keys in signal META are stored as
   *  deviceKeyHmac (see audit-hmac.ts); this actor-resolution field
   *  predates that and keeps raw semantics (zero meta writers use it). */
  deviceKey?: string | null;
  subject?: SignalSubject;
  /**
   * Resolved bbox, or a promise for one (lazy lookups — place bbox, primary
   * location — stay off the caller's hot path; record() awaits internally).
   * null / resolved-null skips the write with a once-per-key debug log.
   */
  geo: SignalBbox | Promise<SignalBbox | null> | null;
  /**
   * P5b PLACE ANCHOR: set ONLY when the act's WHERE genuinely IS a place (a
   * poll act). Attribution then judges on the vendor's stated chain — the
   * act lands on the place, its ancestors, and its DAG descendants — and geo
   * is NOT WRITTEN at all (docket #3: nullable geo, anchor-or-geo CHECK).
   *
   * Leave undefined for acts whose shape is honestly a rectangle (a viewport)
   * or a point (entity_view). Setting it for those would be a regression: a
   * viewport IS a rectangle, and collapsing it to a place would throw away the
   * extent the act actually had.
   */
  placeId?: string | null;
  occurredAt?: Date;
  /**
   * THE LANGUAGE THE ACT WAS PERFORMED IN — canonical BCP 47, or null when
   * genuinely undecidable (spine step 2).
   *
   * The column has existed since the M4b groundwork with the comment "NULL
   * until detection ships"; detection has shipped, and this is the parameter
   * that ends that sentence. It matters because `subject_text` keys demand on
   * RAW UNTAGGED text (A10) — 'pulpo' and 'octopus' are two demand terms
   * forever — so the language is the ONLY thing that tells the collection
   * side which of those two words to go searching with.
   *
   * NEVER inferred back from subject_text by a reader: the fusion had the
   * script, the registry and the request prior in hand and a reader has none
   * of them. Recorded here or not at all.
   */
  detectedLocale?: string | null;
  meta?: Record<string, unknown> | null;
}

// §16: process-local cache caps — K3-shaped capacity bounds (memory ceiling
// per replica; FIFO eviction just re-fetches), NOT behavior constants: no
// read changes meaning at any cap value. Sized to corpus reality (actors ≫
// places); pacer-derived sizing replaces them if they ever bind.
const ACTOR_CACHE_MAX = 10_000;

/**
 * EVERY KEY `signals.meta` MAY HOLD. Anything else is dropped at the writer.
 *
 * The unit is the KEY, not the value, because that is what makes the column
 * classifiable: every entry here is an opaque id, a count, a small enum, a
 * boolean, or a keyed HMAC — none of them free text, none of them a name, and
 * none of them a raw query (the query lives in `subject_text`, which erasure
 * NULLs by declared rule). A key that cannot be described that way does not
 * belong in a column retained indefinitely on a pseudonymous row.
 *
 * Adding a key is deliberately a code change reviewed against that sentence.
 */
const SIGNAL_META_KEYS: ReadonlySet<string> = new Set([
  // Act shape / dwell
  'dwellMs',
  'mode',
  // Search request correlation and result counts
  'searchRequestId',
  'askSearchRequestId',
  'originSearchRequestId',
  'originalBackendSearchRequestId',
  'cacheRevealRequestId',
  'resultCount',
  'restaurantCount',
  'resultRestaurantCount',
  'resultFoodCount',
  'inViewLocationCount',
  'cached',
  'reason',
  'source',
  'entityType',
  'resolvedEntityId',
  // Entity / place context (ids, never names)
  'contextRestaurantId',
  'restaurantId',
  'locationId',
  'connectionId',
  // Polls
  'pollId',
  'endorsedSubjectId',
  'endorsedSubjectType',
  // Vote-integrity audit — keyed HMACs only, never the raw device key or ip
  // (see audit-hmac.ts: the append-only ledger holds no redactable identifier)
  'deviceKeyHmac',
  'ipHmac',
  'ipSubnetHmac',
]);

@Injectable()
export class SignalsService {
  private readonly logger: LoggerService;
  /** cacheKey ("u:<userId>" | "d:<deviceKey>") -> actorId */
  private readonly actorIdCache = new Map<string, string>();
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

  /**
   * Bbox from a map-bounds pair. Latitude normalizes by min/max (corner
   * ordering carries no meaning there). Longitude is ROLE-BASED and
   * wrap-preserving (red-team 3c): west = southWest.lng, east =
   * northEast.lng; west > east means the viewport CROSSES the antimeridian
   * (Fiji) and is stored AS-IS (minLng > maxLng), never min/max-normalized —
   * normalizing would invert a 6°-wide Fiji viewport into a ~354° near-world
   * band that attributes to every place on earth.
   */
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
      minLng: southWest.lng,
      maxLng: northEast.lng,
    };
  }

  /** Zero-area bbox from a point (§3: geo is ALWAYS a bbox). */
  bboxFromPoint(lat: number, lng: number): SignalBbox | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng };
  }

  // centroidGeoFromPlace DELETED (docket #3, 2026-07-30): it existed solely
  // to manufacture a value for NOT NULL geo columns on place-anchored acts —
  // the apparatus that once silently dropped poll acts. Anchored acts now
  // write NULL geo; the anchor IS the WHERE (CHECK signals_where_shape_check).

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

  /**
   * Zero-area bbox for a FOOD entity: the food's most-evidenced restaurant
   * connection resolves the restaurant, whose location provides the point.
   * Never rejects — safe to pass un-awaited as RecordSignalInput.geo.
   */
  async bboxFromFoodLocation(foodId: string): Promise<SignalBbox | null> {
    try {
      const connection = await this.prisma.connection.findFirst({
        where: { foodId },
        orderBy: { mentionCount: 'desc' },
        select: { restaurantId: true },
      });
      if (!connection) {
        return null;
      }
      return await this.bboxFromRestaurantLocation({
        restaurantId: connection.restaurantId,
      });
    } catch (error) {
      this.logger.debug('Food connection bbox lookup failed', {
        foodId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async persist(input: RecordSignalInput): Promise<void> {
    // Normalize geo BEFORE any early return: a caller-supplied geo promise
    // that rejects must never become an unhandled rejection just because an
    // early return (e.g. no actor) skipped the await. Rejection -> null,
    // matching the never-reject law of the bbox helpers.
    const geoPromise = Promise.resolve(input.geo).catch(
      (): SignalBbox | null => null,
    );

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

    const geo = await geoPromise;
    if (!geo && !input.placeId) {
      // Docket #3: only a geometry-shaped act needs a geometry. An anchored
      // act's WHERE is its place — it must never be dropped for lacking a
      // rectangle (that exact drop happened once; see the P5b scar).
      this.skipOnce(`${input.kind}:no-geo`, 'Signal skipped: no geo bbox', {
        kind: input.kind,
      });
      return;
    }

    const subject = input.subject ?? null;
    const subjectId = subject?.entityId ?? null;
    // §16: 255 is K6-definitional plumbing — the subject_text column width
    // (schema VarChar(255)); the slice guards the INSERT, never judges the
    // term (qualifiers are judged at read, §3).
    const term = subject?.term
      ? subject.term.trim().toLowerCase().slice(0, 255)
      : null;
    const subjectText = term?.length ? term : null;

    await this.prisma.signal.create({
      data: {
        kind: input.kind,
        subjectType: subjectId ? 'entity' : subjectText ? 'term' : 'none',
        subjectId,
        subjectText,
        placeId: input.placeId ?? null,
        geoMinLat: geo?.minLat ?? null,
        geoMinLng: geo?.minLng ?? null,
        geoMaxLat: geo?.maxLat ?? null,
        geoMaxLng: geo?.maxLng ?? null,
        actorId,
        occurredAt: input.occurredAt ?? new Date(),
        // Canonical-cased and length-bounded to the column; an empty or
        // whitespace tag is the same as no answer, and is stored as one.
        // BCP-47 round trip, shared with every other locale-bearing write:
        // an unparseable tag is stored as NULL rather than as free text the
        // locale match filter can never match (A0 R2).
        detectedLocale: normalizeDetectedLocaleTag(input.detectedLocale),
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

  /**
   * Drop undefined values, AND every key outside the allow-list.
   *
   * WHY THE ALLOW-LIST EXISTS (person-data ruling 2026-08-07, Q7). `meta` was
   * the one column on `signals` that nothing constrained — an open-shape JSON
   * blob on a row the erasure declaration deliberately RETAINS. Its contents
   * were harmless; the ABSENCE of a shape was the finding, because "no person
   * data in here" was a statement about today's callers rather than about the
   * column. A future caller spreading a request body, a display name, or a
   * raw query string into meta would have been retained forever with nothing
   * red anywhere. That is the exact silent shape the whole person-data
   * inversion exists to make impossible, so the column is now classified
   * `not_person` and THIS is the mechanism the classification names.
   *
   * IT LIVES HERE because this is the ONE writer — `persist()` is the only
   * code that ever inserts a signal row, and `record()` is the only door into
   * it. A compile-time type would have been nicer and is not sufficient: two
   * callers build meta with a spread (`...extraMeta`, the vote-integrity
   * HMAC blocks), and TypeScript's excess-property check does not see through
   * a spread. A runtime filter at the single writer does.
   *
   * DROP-AND-WARN, NOT THROW: `record()` is fire-and-forget and must never
   * fail a user action (that is its whole contract). The unknown key never
   * reaches the database — which is the enforcement — and the log names it so
   * an intentional new key is a one-line addition here rather than a mystery.
   */
  private compactMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const kept: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined) continue;
      if (!SIGNAL_META_KEYS.has(key)) {
        rejected.push(key);
        continue;
      }
      kept[key] = value;
    }
    if (rejected.length > 0) {
      this.logger.warn(
        'Signal meta key(s) dropped — not in SIGNAL_META_KEYS. Add the key there if it is intended (and confirm it carries no person data: this column is retained indefinitely and classified not_person on the strength of this filter).',
        { rejected },
      );
    }
    return kept;
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
