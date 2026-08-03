import { ledgerMicros } from '../external-integrations/shared/spend-currency';
/**
 * §2 Tier-2 polygon promotion queue (plans/geo-demand-foundation-rebuild.md
 * §2 "Tier-2 polygon promotion (scarce pool) — earned moments").
 *
 * A place earns its scarce-pool polygon; nothing mass-fetches. The queue
 * (place_geometry_promotions, placeId PK) records the earned moment; a
 * governed hourly drain turns queued places into place_geometries rows.
 *
 * TRIGGERS (cleanup 2026-08-01 — every trigger of the old earned-moment
 * apparatus is DELETED with docket #1; these three remain). 'birth' is the
 * ONE trigger this service switches on, and the distinction it draws is:
 * IS A USER WAITING FOR THIS PLACE'S OUTLINE?
 *   - birth      — YES. §2.5(d) POLYGON AT BIRTH: the catalog's create
 *     chokepoint (upsertSketch via PLACE_BIRTH_LISTENER) enqueues every
 *     newly sketched place, and a birth promotes THE NEWBORN, awaited by
 *     the reconciler's user-driven settle (red-teamed: never the whole
 *     queue). The hourly sweep is the retry tail only.
 *   - bulk_seed  — NO. The seed scripts mint in a loop; they enqueue and
 *     let the governed drain pay, which is their own stated law (a
 *     synchronous promote per mint spent inline UNCAMPAIGNED scarce draws
 *     — the cross-change defect this trigger exists to prevent).
 *   - paid_seed  — NO. §2.5(e) SEED ORDER: a batch enqueue under a SPEND
 *     CAMPAIGN envelope (place_geometry_promotions.campaign_id). Rows
 *     WITHOUT a campaign have no budget ceiling at all — the TomTom pools
 *     are per-MINUTE rate windows only (governance.service), so the
 *     campaign is the only spend bound. Bulk callers should pass one.
 *
 * DRAIN (governed lane):
 *   - Hourly cadence: §16 K3-shaped operational plumbing ("a polygon an
 *     hour late is fine" — the queue itself is the lateness buffer).
 *   - Oldest-first; the pools bound spend — no invented batch cap; the
 *     per-tick row LIMIT below is churn-bounding only.
 *   - One-step vendor flow: a place's providerPlaceId IS the stable
 *     geometry id (§1, live-validated). (The census cheap-geocode two-step
 *     died with the census resolve lane.)
 *   - Denial ≠ attempt: a pool's typed not-now leaves the row untouched.
 *     A consumed-draw miss increments attempts and simply retries next
 *     tick — the per-minute pool (docket #2, the vendor's own grain)
 *     bounds a runaway; refusal is TERMINAL.
 *   - (the §17c fallback lane is DELETED, 2026-08-01 — every place is a
 *     vendor mirror now, so every place may earn an outline.)
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlaceGeometryPromotion, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  PolygonFetchResult,
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from './tomtom-chain-probe.port';
import { SpendCampaignService } from '../external-integrations/shared/spend-campaign.service';
import { tomtomScarceCostMicrosPerDraw } from '../external-integrations/shared/vendor-pricing';

/** §16 K4-derived: 2 vendor calls per item ÷ ~5 QPS vendor window → 500ms. */
const VENDOR_QPS_SPACING_MS = 500;

/**
 * §16 K3 operational bound — per-tick drain READ size. RATIONALE CORRECTED
 * 2026-08-01 (red-team): this used to claim it "equals the scarce pool's
 * monthly budget" — there is NO monthly TomTom pool; the pools are
 * per-minute rate windows, and the only spend ceiling is a row's spend
 * CAMPAIGN. So this number is not a budget: it bounds per-tick row churn on
 * a deeply backlogged queue (a batch seed enqueues ~23k rows at once), and
 * the per-minute pool plus the 500ms spacing do the real pacing. What
 * changes it: measured churn pressure, never tuning.
 */
const DRAIN_BATCH_LIMIT_PER_TICK = 10_000;

/**
 * §16 K3-shaped operational constant: pg advisory-lock key for the promotion
 * drain — single drainer across PROCESSES (the in-process `draining` latch
 * only guards this process; a script/second dyno booting the module graph
 * would otherwise double-drain the governed queue against the same vendor
 * pools). Same convention as RESCORE_ADVISORY_LOCK_KEY (0x63726176 'crav');
 * this one spells 'poly'. Not a product number — what changes it: a key
 * collision with another advisory-locked job, never tuning.
 */
export const PROMOTION_DRAIN_ADVISORY_LOCK_KEY = 0x706f6c79; // 'poly'

/**
 * §16 K3 operational ceiling: consumed-draw MISSES before a row is retired.
 * Red-team 2026-08-01 (BLOCKER): `attempts` was incremented and read by
 * NOTHING — no WHERE, no cap — so a row whose geometry id the vendor can
 * never satisfy (no matching providerID, an error item, a non-collection
 * body, zero polygon features) drew a scarce polygon EVERY HOUR FOREVER.
 * The per-minute pool bounds rate, not this. Three asks across three hours
 * is enough to distinguish a transient from "the vendor does not have it";
 * a transport error is NOT a miss and never counts here.
 */
const MISS_ATTEMPTS_BEFORE_RETIRE = 3;

/** Per-item drain outcome (see promoteOne). 'stop' ends the whole pass. */
type DrainOutcome = 'promoted' | 'skipped' | 'attempted' | 'stop';

@Injectable()
export class PlacesPromotionService {
  private readonly logger: LoggerService;

  /** Single-flight for the drain (cron + ops seam can overlap). */
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOMTOM_CHAIN_PROBE) private readonly probe: TomtomChainProbe,
    loggerService: LoggerService,
    // §24 Task 3: SpendCampaignService is @Global (SharedServicesModule) —
    // every real app graph has it. Optional so unit-test harnesses that
    // construct this service directly (no campaign fixtures) keep working
    // — a missing service is treated the same as "no campaign on this item"
    // (see the campaignId-gated call sites below, all no-ops when absent).
    @Inject(SpendCampaignService)
    @Optional()
    private readonly spendCampaigns?: SpendCampaignService,
  ) {
    this.logger = loggerService.setContext('PlacesPromotionService');
  }

  /**
   * Idempotent enqueue of one earned moment. A place already queued OR
   * already promoted (queue row with promotedAt, or an existing
   * OUTLINE-grade place_geometries row — §2.6: EVERY place has a geometry
   * row, so the "already has ground" test is provider_boundary_id IS NOT
   * NULL, never bare row existence; a sketch envelope still earns its
   * outline) is a no-op. Never throws. (The fallback-provider guard is
   * gone with the fallback lane itself, 2026-08-01 — every place is a
   * vendor mirror now, so every place may earn an outline.)
   */
  async enqueue(
    placeId: string,
    trigger: string,
    campaignId?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO place_geometry_promotions (place_id, trigger, campaign_id)
        SELECT p.place_id, ${trigger}, ${campaignId ?? null}::uuid
        FROM places p
        WHERE p.place_id = ${placeId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM place_geometries g
            WHERE g.place_id = p.place_id
              AND g.provider_boundary_id IS NOT NULL
          )
        ON CONFLICT (place_id) DO NOTHING
      `);
      // Docket #1 (abstraction audit, 2026-07-30): POLYGON AT BIRTH IS
      // SYNCHRONOUS-BY-DEFAULT — the charter P0 second half, finally landed.
      // A birth promotes THE NEWBORN, awaited (red-team 2026-08-01): the
      // full drainTick here paid for the whole queue — oldest-first, up to
      // 10k rows x 500ms spacing — and on any backlog the newborn ran LAST,
      // so the await was most expensive exactly when it bought nothing.
      // One targeted item closes the vendor-bbox window within the same
      // settle; the hourly sweep remains the queue's only owner.
      if (trigger === 'birth') {
        await this.promoteNewborn(placeId);
      }
    } catch (error) {
      this.logger.warn('Promotion enqueue failed (earned moment retries)', {
        placeId,
        trigger,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  // noteHeaderAnswer / headerAnswers / enqueuedOnce DELETED (docket #1):
  // the attention memory answered "does this place deserve a polygon?" — a
  // question with only one answer since polygons stopped being scarce. Under
  // birth-intake every place it could ever name is already queued or
  // grounded, and it sat on the hot search path with a documented
  // multi-process caveat.

  /** Hourly governed drain (§16 K3 operational cadence — see header). */
  @Cron(CronExpression.EVERY_HOUR)
  async drainTick(now: Date = new Date()): Promise<void> {
    try {
      await this.drainQueue(now);
    } catch (error) {
      this.logger.error('Promotion drain failed (retries next tick)', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Drain queued places oldest-first through the governed vendor flow.
   * Transient failures simply retry next tick (docket #2: the month-as-
   * backoff clause is dead; the per-minute pool bounds a runaway). The pass
   * ends early on any pool denial (nothing later in the queue would admit
   * either) or on a vendor transport error (consumed draw, systemic).
   */
  async drainQueue(now: Date): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      // CROSS-PROCESS single drainer: pg_try_advisory_lock (session-scoped;
      // same shipped pattern as rescore-coordinator). Two processes (the
      // worker's cron + any script/second dyno) can never drain — and spend
      // the governed vendor pools — concurrently; the loser simply skips
      // this pass (the queue is the lateness buffer, next tick retries).
      const lock = await this.prisma.$queryRaw<Array<{ locked: boolean }>>(
        Prisma.sql`
          SELECT pg_try_advisory_lock(${PROMOTION_DRAIN_ADVISORY_LOCK_KEY}) AS locked
        `,
      );
      if (!lock[0]?.locked) {
        this.logger.info('Promotion drain skipped (another process drains)');
        return;
      }
      try {
        await this.drainPass(now);
      } finally {
        // Best-effort release; a pooled connection MAY not be the acquiring
        // session (rescore-coordinator has the same caveat). An unreleased
        // lock self-heals when the connection closes; warn so a stuck drain
        // is attributable.
        const unlocked = await this.prisma
          .$queryRaw<Array<{ unlocked: boolean }>>(
            Prisma.sql`
              SELECT pg_advisory_unlock(${PROMOTION_DRAIN_ADVISORY_LOCK_KEY}) AS unlocked
            `,
          )
          .catch(() => null);
        if (!unlocked?.[0]?.unlocked) {
          this.logger.warn(
            'Promotion drain advisory unlock did not release (pooled-session mismatch; lock clears when its connection closes)',
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Birth-time targeted promote: exactly one queue row (the newborn), no
   * batch scan, no QPS spacing (a single item spends ≤2 vendor calls; the
   * per-minute pool bounds rate). Shares the in-process latch and the
   * cross-process advisory lock with the sweep so the governed pools are
   * never drawn concurrently; if either is held, the newborn simply waits
   * for the hourly sweep — the queue is the lateness buffer. Never throws.
   */
  // NO CROSS-PROCESS ADVISORY LOCK HERE (red-team 2026-08-01, BLOCKER): the
  // drain's lock is session-scoped but acquired/released over a CONNECTION
  // POOL, so a mismatched release leaks it until that connection closes —
  // and taking it PER BIRTH (on the api process, from every settle) made a
  // rare leak likely, which would silently starve every drain in every
  // process forever. A single targeted row needs no cross-process mutex
  // anyway: the governed pool is the spend gate, `promoted_at IS NULL`
  // bounds duplication to at most one wasted draw on a genuine race, and
  // the in-process latch still prevents fighting this process's own sweep.
  private async promoteNewborn(placeId: string): Promise<void> {
    if (this.draining) {
      // The hourly sweep owns this tick; its unfiltered WHERE picks the
      // newborn up next pass. Logged so a starved newborn is attributable.
      this.logger.info('Newborn promote deferred (drain in progress)', {
        placeId,
      });
      return;
    }
    this.draining = true;
    try {
      {
        const rows = await this.prisma.$queryRaw<PlaceGeometryPromotion[]>(
          Prisma.sql`
            SELECT place_id            AS "placeId",
                   trigger             AS "trigger",
                   enqueued_at         AS "enqueuedAt",
                   promoted_at         AS "promotedAt",
                   attempts            AS "attempts",
               miss_attempts       AS "missAttempts",
                   last_attempt_at     AS "lastAttemptAt",
                   provider_boundary_id AS "providerBoundaryId",
                   campaign_id         AS "campaignId"
            FROM place_geometry_promotions
            WHERE place_id = ${placeId}::uuid
              AND promoted_at IS NULL
              AND refused_at IS NULL
          `,
        );
        if (rows[0]) {
          await this.promoteOne(rows[0], new Date());
        }
      }
    } catch (error) {
      this.logger.warn('Newborn promote failed (hourly sweep retries)', {
        placeId,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.draining = false;
    }
  }

  private async drainPass(now: Date): Promise<void> {
    const due = await this.prisma.$queryRaw<PlaceGeometryPromotion[]>(
      Prisma.sql`
        SELECT place_id            AS "placeId",
               trigger             AS "trigger",
               enqueued_at         AS "enqueuedAt",
               promoted_at         AS "promotedAt",
               attempts            AS "attempts",
               miss_attempts       AS "missAttempts",
               last_attempt_at     AS "lastAttemptAt",
               provider_boundary_id AS "providerBoundaryId",
               campaign_id         AS "campaignId"
        FROM place_geometry_promotions
        WHERE promoted_at IS NULL
          -- Docket #2: refusal is TERMINAL (a fact about the vendor's model,
          -- never retried), and the month-as-backoff clause is DEAD — retry
          -- latency was a function of the CALENDAR DATE of failure (a miss
          -- on the 1st waited ~30 days, on the 30th ~1 day). Transient
          -- failures simply retry next tick; the per-minute pool (the
          -- vendor's own grain) is what bounds a runaway now.
          AND refused_at IS NULL
        ORDER BY enqueued_at ASC
        LIMIT ${DRAIN_BATCH_LIMIT_PER_TICK}
      `,
    );
    for (const item of due) {
      // §24 Task 3: pool = rate+backstop (admission/rate, unchanged below —
      // this drain still draws from the SAME monthly pools regardless of
      // campaign), envelope = budget (a campaign's spend ceiling). An item
      // tagged with a non-dispatchable campaign (breached/not yet approved)
      // is skipped — stays queued, retried once the campaign resumes —
      // WITHOUT spending a pool draw on work whose budget is closed.
      const campaignId = item.campaignId;
      if (campaignId && this.spendCampaigns) {
        const dispatchable =
          await this.spendCampaigns.isDispatchable(campaignId);
        if (!dispatchable) {
          this.logger.info(
            'Promotion item skipped — campaign not dispatchable (stays queued)',
            { placeId: item.placeId, campaignId },
          );
          continue;
        }
      }
      // Per-item isolation (red-team 2026-08-01): drainPass selects
      // oldest-first and records nothing on a throw, so ONE poison row (bad
      // GeoJSON reaching ST_GeomFromGeoJSON, a concurrently-deleted row,
      // a stamp failure) used to abort the pass and be retried FIRST next
      // tick — blocking the entire queue indefinitely. Record the attempt
      // and move on; the row ages out through the miss ceiling.
      let outcome: DrainOutcome;
      try {
        outcome = await this.promoteOne(item, now);
      } catch (error) {
        this.logger.warn(
          'Promotion item threw — attempt recorded, pass continues',
          {
            placeId: item.placeId,
            detail: error instanceof Error ? error.message : String(error),
          },
        );
        await this.recordAttempt(item.placeId, now).catch(() => undefined);
        continue;
      }
      if (outcome === 'stop') {
        break;
      }
      // §16 K4 (vendor fact): TomTom pay-as-you-go allows ~5 QPS on the
      // Search endpoints; each promotion spends up to 2 calls. Space items
      // so the drain can never out-run the vendor's per-second window (the
      // month pool bounds VOLUME; this bounds RATE — observed 429s on the
      // 2026-07-22 seed run without it).
      await new Promise((resolve) =>
        setTimeout(resolve, VENDOR_QPS_SPACING_MS),
      );
    }
  }

  /**
   * §24 Task 3 metering wrapper: EVERY exit of the vendor flow with
   * consumed draws (promoted, consumed-draw miss, wrong-entity reject,
   * no-rings, transport error) meters those draws against the item's
   * campaign envelope — a real vendor draw must never escape the campaign
   * budget just because the item didn't promote.
   */
  private async promoteOne(
    item: PlaceGeometryPromotion,
    now: Date,
  ): Promise<DrainOutcome> {
    const draws = { scarce: 0 };
    try {
      return await this.promoteOneUnmetered(item, now, draws);
    } finally {
      await this.meterCampaignSpend(item, draws);
    }
  }

  /**
   * §24 Task 3: envelope = budget. Pool admission (rate/backstop) already
   * governed the draws; this meters them against the campaign's budget, if
   * the item carries one. Never blocks the outcome itself — a campaign
   * breach here just flips the campaign's state for the NEXT item's
   * isDispatchable check.
   */
  private async meterCampaignSpend(
    item: PlaceGeometryPromotion,
    // Scarce-only (cleanup 2026-08-01): the cheap-geocode step died with the
    // census resolve lane; nothing draws cheap in this flow anymore.
    draws: { scarce: number },
  ): Promise<void> {
    const campaignId = item.campaignId;
    const spendMicros = draws.scarce * tomtomScarceCostMicrosPerDraw;
    if (!campaignId || !this.spendCampaigns || spendMicros <= 0) {
      return;
    }
    await this.spendCampaigns
      .recordSpend(campaignId, 'tomtom', ledgerMicros(spendMicros))
      .catch((error: unknown) => {
        this.logger.warn('Campaign spend recording failed (outcome stands)', {
          placeId: item.placeId,
          campaignId,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      });
  }

  private async promoteOneUnmetered(
    item: PlaceGeometryPromotion,
    now: Date,
    draws: { scarce: number },
  ): Promise<DrainOutcome> {
    const place = await this.prisma.place.findUnique({
      where: { placeId: item.placeId },
    });
    if (!place) {
      // Dangling queue row (places are effectively never deleted; belt and
      // suspenders): drop it rather than draw for a ghost.
      await this.prisma.placeGeometryPromotion.delete({
        where: { placeId: item.placeId },
      });
      return 'skipped';
    }

    // Raced/pre-existing OUTLINE → just stamp the promotion. §2.6: a
    // sketch-grade envelope row (provider_boundary_id NULL) does NOT count
    // as promoted — the drain exists to upgrade it in place.
    const existing = await this.prisma.$queryRaw<Array<{ placeId: string }>>(
      Prisma.sql`
        SELECT place_id AS "placeId" FROM place_geometries
        WHERE place_id = ${item.placeId}::uuid
          AND provider_boundary_id IS NOT NULL
      `,
    );
    if (existing.length > 0) {
      await this.stampPromoted(item.placeId, item.providerBoundaryId, now);
      return 'promoted';
    }

    // §24 Task 3: `draws` counts vendor draws ACTUALLY consumed this call
    // (not pool denials, which never reach the vendor) — metered against
    // the campaign envelope by the promoteOne wrapper on EVERY exit.

    // Docket #1: the geometry id IS the place's identity (final dissolution:
    // composite (id, level) unique, id-less non-fallback observations are
    // refused at the door). The old census-GEOID cheap-geocode step is
    // UNREACHABLE — every enqueueable place is tomtom-provider with an id —
    // and was deleted with its adapter path. A null here means an invariant
    // broke upstream; refuse loudly rather than resurrect name matching.
    const geometryId =
      item.providerBoundaryId ??
      (place.provider === 'tomtom' ? place.providerPlaceId : null);
    if (!geometryId) {
      this.logger.error(
        'promotion item without a geometry id — identity invariant broken upstream',
        { placeId: item.placeId, provider: place.provider },
      );
      await this.recordAttempt(item.placeId, now);
      return 'attempted';
    }
    // ENTITY EXCLUSIVITY (2026-07-27): one vendor entity belongs to at most
    // ONE place. Enforced HERE, at the only moment it can be — before the
    // scarce draw is spent.
    //
    // Why it is needed even with point identity: the vendor's granularity is
    // coarser than the census's in places. Glen Echo Park MO (pop ~160) sits
    // inside Normandy; TomTom models ONE municipality covering both, so both
    // interior anchors honestly resolve to the same entity. Point identity
    // did its job — the catalog's job is to refuse the second claim rather
    // than dress Glen Echo Park in Normandy's outline. Same for the 165
    // groups the old name matching produced (5 Alaska towns, one polygon).
    //
    // The refused place stays SKETCH-grade on its own census envelope, which
    // is the honest answer: "the vendor does not model this place
    // separately." First claimant keeps the entity — arbitrary but stable;
    // no evidence exists here to rank two places that both genuinely sit
    // inside one vendor entity.
    // FINAL DISSOLUTION amendment (2026-07-30): exclusivity is per
    // (geometry id, LEVEL) — the vendor's own identity. A coincident-boundary
    // pair (city-state, consolidated city-county) shares one geometry id
    // across two rungs and each rung legitimately wears the same outline;
    // only a SAME-level second claimant is the Glen-Echo-Park class.
    const claimedByAnother = await this.prisma.$queryRaw<
      Array<{ placeId: string }>
    >(Prisma.sql`
      SELECT g.place_id AS "placeId"
      FROM place_geometries g
      JOIN places p ON p.place_id = g.place_id
      WHERE g.provider_boundary_id = ${geometryId}
        AND g.place_id <> ${item.placeId}::uuid
        AND p.provider_level_code = (
          SELECT provider_level_code FROM places
          WHERE place_id = ${item.placeId}::uuid
        )
      LIMIT 1
    `);
    if (claimedByAnother.length > 0) {
      await this.recordRefusal(item.placeId, now);
      this.logger.warn(
        'vendor entity already claimed by another place — staying sketch (the vendor does not model this place separately)',
        {
          placeId: item.placeId,
          geometryId,
          claimedBy: claimedByAnother[0].placeId,
        },
      );
      return 'attempted';
    }

    // Step 2 — the scarce polygon draw.
    let polygon: PolygonFetchResult;
    try {
      polygon = await this.probe.fetchPolygon(geometryId);
    } catch (error) {
      // Transport/vendor error: the draw was conservatively debited and the
      // fault is systemic — record the attempt and end the pass.
      await this.recordAttempt(item.placeId, now);
      this.logger.warn('Promotion polygon fetch errored (pass ends)', {
        placeId: item.placeId,
        geometryId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return 'stop';
    }
    if (polygon.kind === 'denied') {
      // §2: scarce denial = typed not-now — the item stays queued untouched
      // for next month's window; nothing behind it will admit either.
      return 'stop';
    }
    if (polygon.kind === 'miss') {
      draws.scarce += 1;
      if (item.missAttempts + 1 >= MISS_ATTEMPTS_BEFORE_RETIRE) {
        // The vendor has answered "no polygon for this id" enough times to
        // be a FACT about its model, not a transient — retire the row
        // terminally instead of re-drawing on it every hour forever.
        this.logger.warn(
          'Promotion retired: vendor has no polygon for this geometry id after repeated asks',
          { placeId: item.placeId, missAttempts: item.missAttempts + 1 },
        );
        await this.recordRefusal(item.placeId, now);
        return 'attempted';
      }
      await this.recordMiss(item.placeId, now);
      return 'attempted';
    }
    draws.scarce += 1;

    // WRONG-ENTITY GUARD — ANCHOR CONTAINMENT (one-ground charter, 2026-07-27).
    //
    // The question worth asking is the one the charter states: "does this
    // polygon actually contain the spot we asked about?" The place's anchor
    // (census internal point) is GUARANTEED to lie inside the real place, so
    // a polygon that does not cover it is a different entity — full stop, at
    // any size, in any country. Exact test, via PostGIS, before persisting.
    //
    // This REPLACES a span-ratio heuristic that only rejected polygons under
    // 20% of the stored bbox on BOTH axes: a wrong entity of COMPARABLE size
    // (the cross-border neighbour, the same-name town one county over) sailed
    // straight through it. That heuristic was also the justification I gave
    // for dropping the country gate — a guard that could not actually catch
    // what I claimed. The span check survives ONLY where no anchor exists
    // (52 rows): weaker evidence used only where stronger evidence is absent,
    // never in preference to it.
    // Docket #1: the anchorless span-ratio branch is DELETED — the
    // representative point is coupled to the ground's write (the P4 centroid
    // law), so anchorlessness is transient-at-birth at most, and the anchor
    // test is strictly stronger evidence. No anchor = refuse this pass and
    // retry once the coupling has run.
    const anchor =
      place.centroidLat != null && place.centroidLng != null
        ? { lat: Number(place.centroidLat), lng: Number(place.centroidLng) }
        : null;
    if (!anchor) {
      await this.recordAttempt(item.placeId, now);
      this.logger.warn('promotion deferred: place has no anchor yet', {
        placeId: item.placeId,
      });
      return 'attempted';
    }
    // ONE READING OF ONE FACT (abstraction re-derivation, 2026-08-01): the
    // guard used to judge `features->0` while persistPolygon stores the
    // UNION of ALL features. A multi-part entity whose FIRST feature happens
    // not to cover the anchor was TERMINALLY refused even though its real
    // geometry covers it — the arc's headline disease (one fact, two
    // implementations) surviving in a single flow. The guard now judges
    // exactly the geometry the persist step would write.
    const [covers] = await this.prisma.$queryRaw<Array<{ ok: boolean }>>(
      Prisma.sql`
        WITH raw_input AS (
          SELECT ${JSON.stringify(polygon.geojson)}::jsonb AS geojson
        ),
        source_geometries AS (
          SELECT ST_MakeValid(
                   ST_SetSRID(ST_GeomFromGeoJSON((feature->'geometry')::text), 4326)
                 ) AS geometry
          FROM raw_input,
            jsonb_array_elements(raw_input.geojson->'features') AS feature
          WHERE feature ? 'geometry'
        ),
        merged AS (
          SELECT ST_Multi(
                   ST_CollectionExtract(
                     ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))), 3
                   )
                 ) AS geometry
          FROM source_geometries
        )
        SELECT ST_Covers(
                 merged.geometry,
                 ST_SetSRID(ST_MakePoint(${anchor.lng}::float8, ${anchor.lat}::float8), 4326)
               ) AS ok
        FROM merged
      `,
    );
    const wrongEntity = covers?.ok === false;
    const rejectReason = 'polygon does not contain the place anchor';
    if (wrongEntity) {
      // Docket #2: also TERMINAL — the polygon for this entity id does not
      // contain the place's own anchor, and that will not change next tick.
      await this.recordRefusal(item.placeId, now);
      this.logger.warn('WRONG-ENTITY polygon rejected (place stays sketch)', {
        placeId: item.placeId,
        geometryId,
        reason: rejectReason,
      });
      return 'attempted';
    }

    const landed = await this.persistPolygon(
      item.placeId,
      geometryId,
      polygon.geojson,
      now,
    );
    if (!landed) {
      // Vendor 'ok' with no usable polygon rings (observed seed run: 6,448
      // rows silently stamped promoted while still sketch). A draw that
      // lands nothing is a MISS, not a promotion.
      await this.recordAttempt(item.placeId, now);
      this.logger.warn('Polygon fetch landed no rings (place stays sketch)', {
        placeId: item.placeId,
        geometryId,
      });
      return 'attempted';
    }
    await this.stampPromoted(item.placeId, geometryId, now);
    await this.pullDemandWatermarkBack(item.placeId);
    this.logger.info('Place promoted to tier-2 polygon', {
      placeId: item.placeId,
      trigger: item.trigger,
      geometryId,
    });
    return 'promoted';
  }

  /**
   * Persist the vendor FeatureCollection into place_geometries — the PostGIS
   * geometry column lives OUTSIDE the prisma model (§1), raw SQL only. The
   * ST_ shape mirrors the live-proven legacy bootstrap write (collect →
   * unary-union → make-valid → extract polygons → ST_Multi).
   *
   * §2.6 SKETCH→OUTLINE UPGRADE: the ON CONFLICT (place_id) DO UPDATE below
   * is THE grade transition — it overwrites the sketch-grade envelope row's
   * geometry IN PLACE and stamps provider_boundary_id (= EXCLUDED, always
   * non-null here), which IS the outline-grade marker. Detail never
   * decreases: an outline only ever replaces a sketch or a prior outline
   * (re-promotion), and the catalog's sketch writes are guarded
   * `WHERE provider_boundary_id IS NULL` so they can never undo this.
   */
  private async persistPolygon(
    placeId: string,
    geometryId: string,
    geojson: unknown,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$executeRaw(Prisma.sql`
      WITH raw_input AS (
        SELECT ${JSON.stringify(geojson)}::jsonb AS geojson
      ),
      source_geometries AS (
        SELECT
          ST_MakeValid(
            ST_SetSRID(
              ST_GeomFromGeoJSON((feature->'geometry')::text),
              4326
            )
          ) AS geometry
        FROM raw_input,
          jsonb_array_elements(raw_input.geojson->'features') AS feature
        WHERE feature ? 'geometry'
      ),
      merged AS (
        SELECT
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))),
              3
            )
          ) AS geometry
        FROM source_geometries
      ),
      bounded AS (
        -- STORAGE BOUND (§16 DERIVED, 2026-07-22 seed run): vendor zoom
        -- semantics are not trusted to bound row size (observed 1.5-3.5MB
        -- county/state rows). Simplify at WRITE to tolerance =
        -- placeSpan/1024: the polygon's only consumer is coverage judgment
        -- at viewport scales where the place is a candidate, and slices
        -- re-simplify to viewSpan/512 at read — sub-0.1%-of-span fidelity
        -- is invisible to every consumer while bounding rows to ~KB.
        SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                 ST_SimplifyPreserveTopology(
                   merged.geometry,
                   GREATEST(
                     ST_XMax(merged.geometry) - ST_XMin(merged.geometry),
                     ST_YMax(merged.geometry) - ST_YMin(merged.geometry)
                   ) / 1024.0
                 )
               ), 3)) AS geometry
        FROM merged
        WHERE merged.geometry IS NOT NULL
      )
      INSERT INTO place_geometries
        (place_id, provider_boundary_id, fetched_at, geometry)
      SELECT ${placeId}::uuid, ${geometryId}, ${now}, bounded.geometry
      FROM bounded
      WHERE bounded.geometry IS NOT NULL
      ON CONFLICT (place_id) DO UPDATE SET
        provider_boundary_id = EXCLUDED.provider_boundary_id,
        fetched_at = EXCLUDED.fetched_at,
        geometry = EXCLUDED.geometry
    `);
    if (rows === 0) {
      return false; // no usable rings — caller treats as a miss
    }
    // P4 COMPLETE (2026-07-30): there is no bbox writeback — the columns are
    // gone, and every consumer derives the envelope from this ground at the
    // moment of use (derivedBboxSelectSql / launch camera / bias radius).
    // The REPRESENTATIVE POINT is derived from the ground AT THE GROUND'S
    // WRITE — the same law as the bbox SET above (a derived value may only be
    // written by the write of its source). Before this, the centroid was a
    // DECOUPLED derived value: born from the vendor position / census point,
    // never re-checked when the real outline arrived, so a concave or
    // multi-part outline left it off-ground — 564 rows on prod (2.48%),
    // repaired one-off 2026-07-28, and the class was REGENERATING through
    // this very method because nothing coupled the point to the polygon. An
    // off-ground point made every point-probe ask about a NEIGHBOUR (the
    // fake "TomTom is coarser" tail). ST_PointOnSurface is inside by
    // construction; no seam filter — it picks a point on one arm of a
    // crossing geometry just fine.
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE places p SET
        centroid_lat = ST_Y(ST_PointOnSurface(g.geometry)),
        centroid_lng = ST_X(ST_PointOnSurface(g.geometry))
      FROM place_geometries g
      WHERE g.place_id = p.place_id
        AND p.place_id = ${placeId}::uuid
        AND g.geometry IS NOT NULL
        AND (p.centroid_lat IS NULL
             OR NOT ST_Covers(g.geometry,
                  ST_SetSRID(ST_MakePoint(p.centroid_lng::float8,
                                          p.centroid_lat::float8), 4326)))
    `);
    return true;
  }

  /** Promotion completes: stamp the queue row AND places.promoted_at. */
  private async stampPromoted(
    placeId: string,
    geometryId: string | null,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.placeGeometryPromotion.update({
        where: { placeId },
        data: { promotedAt: now, providerBoundaryId: geometryId },
      }),
      // Docket #4: places.promoted_at is DROPPED — it had zero readers (the
      // drain reads the QUEUE row's promoted_at, stamped above).
    ]);
  }

  /**
   * GEOMETRY UPGRADE → DEMAND RE-ATTRIBUTION (coherence red-team 2026-07-23):
   * signal→place attribution is computed against the ground that exists at
   * rebuild time, and the aggregate's refresh only revisits days carrying
   * signals NEWER than its watermark — so a sketch→outline upgrade would
   * otherwise leave every already-aggregated day attributed against the old
   * rectangle forever. The honest hook reuses the aggregate's own invariant
   * ("any signal whose recorded_at is past the cursor reaches its own day
   * slice"): record a REBUILD FLOOR at just before the OLDEST signal whose
   * geo touches this place's new ground, and the next refresh re-derives
   * those days with the true polygon. Direct SQL on the ONE-ROW
   * state table (signal_demand_rebuild_state) rather than a service dep:
   * SignalsModule already imports PlacesModule (module cycle), and the
   * watermark is the aggregate's designed public seam for "revisit these
   * rows". Over-rebuilding is safe by design (delete+reinsert per day).
   */
  private async pullDemandWatermarkBack(placeId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE signal_demand_rebuild_state st
      -- INVALIDATION, not a cursor move (re-derivation 2026-08-01): this
      -- used to drag the monotone WATERMARK backwards, and a refresh in
      -- flight then wrote GREATEST(captured, pulled-back) and erased the
      -- request — permanently, with nothing to retry it. The floor is its
      -- own fact; the refresh consumes and clears it.
      -- Every invalidation bumps the sequence, even when LEAST leaves the
      -- timestamp unchanged — that is precisely the case that used to be
      -- swallowed by a value comparison.
      SET rebuild_floor_seq = st.rebuild_floor_seq + 1,
          rebuild_floor = LEAST(
            COALESCE(st.rebuild_floor, affected.oldest),
            affected.oldest - interval '1 second'
          ),
          updated_at = now()
      FROM (
        SELECT min(s.recorded_at) AS oldest
        FROM signals s, place_geometries g
        WHERE g.place_id = ${placeId}::uuid
          -- Docket #3: anchored acts carry NULL geo and are attributed by
          -- the DAG, so a polygon upgrade cannot re-attribute them — only
          -- geometry-shaped acts pull the watermark back.
          AND s.geo_min_lat IS NOT NULL
          AND s.geo_max_lat >= ST_YMin(g.geometry)
          AND s.geo_min_lat <= ST_YMax(g.geometry)
          AND s.geo_max_lng >= ST_XMin(g.geometry)
          AND s.geo_min_lng <= ST_XMax(g.geometry)
      ) affected
      WHERE st.id = 1 AND affected.oldest IS NOT NULL
    `);
  }

  /** A consumed-draw miss: attempts++ (no cap), retried next tick. */
  private async recordAttempt(placeId: string, now: Date): Promise<void> {
    await this.prisma.placeGeometryPromotion.update({
      where: { placeId },
      data: { attempts: { increment: 1 }, lastAttemptAt: now },
    });
  }

  /**
   * A MISS is the vendor saying it has no polygon for this geometry id —
   * the only evidence that may retire a row. Kept apart from `attempts`
   * (transport errors, deferrals, per-item throws), which must never close
   * a place's one path to a ground.
   */
  private async recordMiss(placeId: string, now: Date): Promise<void> {
    await this.prisma.placeGeometryPromotion.update({
      where: { placeId },
      data: {
        attempts: { increment: 1 },
        missAttempts: { increment: 1 },
        lastAttemptAt: now,
      },
    });
  }

  /** Docket #2: a refusal is a FACT (the vendor does not model this place
   *  separately). Terminal — the drain never selects the row again; the
   *  place keeps its honest sketch envelope. */
  private async recordRefusal(placeId: string, now: Date): Promise<void> {
    await this.prisma.placeGeometryPromotion.update({
      where: { placeId },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: now,
        refusedAt: now,
      },
    });
  }
}
