/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
/**
 * SEED A REGION — the coarse-grid onboarder (one-ground charter).
 *
 * Owner direction 2026-07-28: when we open a new country/state/continent, cover
 * it with a COARSE grid of probes and let organic discovery supply everything
 * finer. Deliberately not exhaustive: places below the grid's resolution are
 * minted the moment a real user looks at them.
 *
 * ── WHY THIS IS A DRIVER, NOT A SEEDER ────────────────────────────────────────
 * It creates nothing itself. It picks WHERE to look and hands each point to the
 * SAME path organic discovery uses: `TomtomChainProbe.probe()` →
 * `PlacesCatalogService.sketchChain()`. One probe returns the whole ladder
 * (neighbourhood → … → country), each rung carrying its own vendor id, so a
 * single call can mint six places correctly.
 *
 * That property is the entire point. The census seeder was a PARALLEL creation
 * path with different rules, and every data defect this catalog has suffered —
 * the San Juan corruption, 363 shared polygons, 351 unresolvable stragglers,
 * "Switzerland, Baker FL" resolving to Switzerland the country — came from that
 * second path, not from the vendor. One creation path means one set of rules.
 * If this file ever grows its own upsert, that is the bug.
 *
 * ── THE GUARANTEE (derived, never estimated — §16) ────────────────────────────
 * A square grid of spacing s hits every region containing an axis-aligned s×s
 * square. So `--spacing-km 15` is not a guess about how big towns are; it is a
 * contract: EVERY place at least 15 km across is probed. The owner picks the
 * resolution they want and the spacing IS that number. Nothing here estimates
 * how many places exist or how large they are.
 *
 * ── THE CATALOG IS THE PROGRESS LEDGER ────────────────────────────────────────
 * A cell is skipped when a Municipality-or-finer ground already covers it. That
 * one rule buys idempotence (a second run costs almost nothing), resumability
 * (an interrupted run resumes for free), and composition with organic growth
 * (cells a user already caused to be minted are never re-probed) — with no new
 * table, no run file, and no state that can disagree with reality.
 *
 * ── CLIPPED TO THE GROUND, NOT THE BOX ────────────────────────────────────────
 * Cells are kept only where the target's REAL polygon covers them. Gridding
 * France's bounding box would spend most of the run on the Atlantic; gridding
 * France's ground spends none. This is the One-Ground law paying rent.
 *
 * Usage (DRY-RUN BY DEFAULT — it prints the cell count and the vendor cost
 * before anything is spent):
 *   npx ts-node scripts/seed-region.ts --region "France" --spacing-km 15
 *   npx ts-node scripts/seed-region.ts --region "France" --spacing-km 15 --execute
 *   npx ts-node scripts/seed-region.ts --bootstrap 48.85,2.35 --spacing-km 15
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlacesCatalogService } from '../src/modules/places/places-catalog.service';
import { SpendCampaignService } from '../src/modules/external-integrations/shared/spend-campaign.service';
import {
  TOMTOM_CHAIN_PROBE,
  TomtomChainProbe,
} from '../src/modules/places/tomtom-chain-probe.port';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { tomtomScarceCostMicrosPerDraw } from '../src/modules/external-integrations/shared/vendor-pricing';

/**
 * §16 K4 vendor fact: ~5 QPS on the Search endpoints. The governed pool is the
 * real authority on spend; this is only client-side pacing so we do not hammer
 * a rate limit we already know.
 */
const SPACING_MS = 220;

/** Mean Earth radius (WGS84 authalic) — a physical constant, not a tuning knob. */
const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_KM) / 180;

/**
 * The skip rule's granularity. A cell already inside a Municipality-or-finer
 * ground is considered covered: that IS the coarse contract. Levels finer than
 * Municipality also count, since their presence implies a municipality-scale
 * probe already happened here.
 */
const COVERED_LEVELS = [
  'Municipality',
  'MunicipalitySubdivision',
  'Neighbourhood',
];

type TargetRow = {
  place_id: string;
  name: string;
  provider_level_code: string;
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const regionName = arg('--region');
  const bootstrap = arg('--bootstrap');
  const spacingKm = Number(arg('--spacing-km') ?? NaN);
  const maxProbes = Number(arg('--max-probes') ?? Infinity);
  const execute = process.argv.includes('--execute');
  // SPEND CAMPAIGN for the outlines this run's newborns will earn (red-team
  // 2026-08-01). The TomTom pools are per-MINUTE rate windows only, so the
  // campaign envelope is the ONLY budget ceiling on the scarce polygon draws
  // the governed drain will later make for these places. Without one, a
  // country-scale grid run queues unbounded scarce spend.
  const campaignId = arg('--campaign-id') ?? null;
  // AN UNPROVEN CLAIM AT A SPEND BOUNDARY (re-derivation, 2026-08-01): the
  // id used to be taken on faith. A malformed one made every enqueue raise
  // 22P02 — swallowed by enqueue's own catch — so a run minted thousands of
  // places with ZERO promotion rows while the summary claimed the drain was
  // metering them. A well-formed but non-dispatchable one wedges the queue
  // forever (isDispatchable fails closed). Resolve it to a real, spendable
  // campaign BEFORE anything can reference it.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (campaignId && !UUID_RE.test(campaignId)) {
    throw new Error(`--campaign-id is not a uuid: ${campaignId}`);
  }

  if (!Number.isFinite(spacingKm) || spacingKm <= 0) {
    throw new Error('--spacing-km <positive number> is required');
  }
  if (!regionName && !bootstrap) {
    throw new Error('--region "<name>" or --bootstrap <lat>,<lng> is required');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const catalog = app.get(PlacesCatalogService);
    if (campaignId) {
      const campaigns = app.get(SpendCampaignService);
      if (!(await campaigns.isDispatchable(campaignId))) {
        throw new Error(
          `--campaign-id ${campaignId} is not dispatchable (missing, unapproved or breached) — ` +
            'every promotion it tags would be skipped forever',
        );
      }
    }
    const probe = app.get<TomtomChainProbe>(TOMTOM_CHAIN_PROBE);

    // ── BOOTSTRAP ────────────────────────────────────────────────────────────
    // A region we have never seen has no ground to grid. One probe at any
    // interior point mints its whole ladder (including the country) through the
    // ordinary path, after which the region can be gridded like any other.
    if (bootstrap) {
      const [latStr, lngStr] = bootstrap.split(',');
      const anchor = { lat: Number(latStr), lng: Number(lngStr) };
      if (!Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) {
        throw new Error('--bootstrap expects <lat>,<lng>');
      }
      if (!execute) {
        out(`[seed] DRY-RUN bootstrap probe at ${anchor.lat},${anchor.lng}`);
        return;
      }
      const result = await probe.probe(anchor);
      if (result.kind !== 'named') {
        out(
          result.kind === 'empty'
            ? `[seed] bootstrap: the vendor models nothing at that point.`
            : result.kind === 'denied'
              ? `[seed] bootstrap: pool denied — retry next window.`
              : `[seed] bootstrap: the vendor did not answer (${result.reason}) — retry.`,
        );
        return;
      }
      const minted = await catalog.sketchChain(result.chain, {
        birthTrigger: 'bulk_seed',
        campaignId,
      });
      out(`[seed] bootstrap minted/matched ${minted.length} rungs:`);
      for (const p of minted) out(`         ${p.providerLevelCode}  ${p.name}`);
      out(`[seed] now re-run with --region "<one of those names>".`);
      return;
    }

    // ── RESOLVE THE TARGET ───────────────────────────────────────────────────
    const targets = await prisma.$queryRawUnsafe<TargetRow[]>(
      `SELECT p.place_id, p.name, p.provider_level_code,
              ST_YMin(g.geometry)::float8 AS min_lat, ST_XMin(g.geometry)::float8 AS min_lng,
              ST_YMax(g.geometry)::float8 AS max_lat, ST_XMax(g.geometry)::float8 AS max_lng
         FROM places p JOIN place_geometries g ON g.place_id = p.place_id
        WHERE p.name = $1
        ORDER BY ST_Area(g.geometry) DESC`,
      regionName,
    );
    if (targets.length === 0) {
      throw new Error(
        `No place named "${regionName}" WITH A GROUND. Use --bootstrap <lat>,<lng> inside it first.`,
      );
    }
    const target = targets[0];
    if (targets.length > 1) {
      out(
        `[seed] NOTE: ${targets.length} places named "${regionName}"; using the LARGEST ` +
          `(${target.provider_level_code}). Others are ignored.`,
      );
      // Red-team 2026-07-29: a homonym must never SPEND on a guess —
      // "Washington" is a state, a DC municipality and a dozen towns, and
      // gridding the largest under --execute silently buys the wrong (or a
      // vastly bigger) territory. Dry-run proceeds so the operator can see
      // the pick; execution demands the disambiguated --region-id.
      if (execute && !arg('--region-id')) {
        throw new Error(
          `"${regionName}" is ambiguous (${targets.length} rows). Dry-run first, then re-run with --region-id <place_id>.`,
        );
      }
    }
    const regionId = arg('--region-id');
    const chosen = regionId
      ? targets.find((t) => t.place_id === regionId)
      : target;
    if (!chosen) {
      throw new Error(
        `--region-id ${regionId} does not match any "${regionName}" row`,
      );
    }
    // ── BUILD THE GRID, IN SQL, CLIPPED TO THE REAL GROUND ───────────────────
    // Generated in the DATABASE, not here. Two reasons, both learned the hard
    // way while red-teaming this file:
    //
    // 1. SCALE. Building candidates in JS and shipping them as arrays does not
    //    survive the use case this tool exists for. Africa at 15 km is ~218k
    //    bbox cells; at 5 km it is ~2M. generate_series costs nothing and the
    //    wire carries only the KEPT cells.
    // 2. THE SEAM, honestly. There is no seam GUARD here, because the guard I
    //    first wrote was dead code: a polygon whose parts straddle 180° (the US,
    //    via the Aleutians) stores XMin=-179.15 / XMax=179.78, so
    //    `min_lng > max_lng` is FALSE and the check never fires. The sweep
    //    therefore spans the long way round the globe — a SUPERSET of the
    //    region — and `ST_Covers` clips it back to exactly the right cells.
    //    Correctness comes from the clip, never from the extent; the only cost
    //    of a seam-spanning region is candidates the database discards, which
    //    is why generating them in-DB is what makes the honest answer affordable.
    //
    // Longitude degrees shrink with latitude, so the lng step is recomputed PER
    // ROW via a LATERAL: one fixed step would under-sample where the region is
    // widest and break the s×s guarantee exactly there.
    //
    // 3. THE TARGET IS SUBDIVIDED AND INDEXED FIRST. Testing ~700k points against
    //    one country-sized MultiPolygon is what actually breaks: measured, the
    //    United States at 15 km spacing did not finish in 10 minutes. A single
    //    huge geometry cannot be helped by an index (it is one row) and its bbox
    //    is useless as a prefilter when the region straddles the seam — the box
    //    spans the globe. ST_Subdivide cuts it into small pieces that a GiST
    //    index CAN prune, turning each point test into a lookup against a few
    //    hundred vertices instead of tens of thousands. This is the canonical
    //    PostGIS answer to point-in-large-polygon, not a workaround.
    //
    // All of it runs inside ONE interactive transaction because the pieces live
    // in a TEMP TABLE: Prisma pools connections, so a temp table created on one
    // connection is invisible to the next query. The transaction pins them to
    // the same connection.
    const latStep = spacingKm / KM_PER_DEG_LAT;
    const kept = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE seed_pieces ON COMMIT DROP AS
             SELECT ST_Subdivide(geometry, 128) AS geom
               FROM place_geometries WHERE place_id = $1::uuid`,
          chosen.place_id,
        );
        await tx.$executeRawUnsafe(
          `CREATE INDEX seed_pieces_gix ON seed_pieces USING GIST (geom)`,
        );
        await tx.$executeRawUnsafe(`ANALYZE seed_pieces`);

        return tx.$queryRawUnsafe<
          Array<{ lat: number; lng: number; covered: boolean }>
        >(
          `WITH box AS (
             SELECT ST_YMin(ST_Extent(geom)) AS ymin, ST_YMax(ST_Extent(geom)) AS ymax,
                    ST_XMin(ST_Extent(geom)) AS xmin, ST_XMax(ST_Extent(geom)) AS xmax
               FROM seed_pieces
           ),
           lat_rows AS (
             SELECT box.*, box.ymin + i * $1::float8 AS lat
               FROM box,
                    generate_series(0, floor((box.ymax - box.ymin) / $1::float8)::int) AS i
           ),
           cells AS (
             SELECT r.lat, r.xmin + j * step.lng_step AS lng
               FROM lat_rows r
               CROSS JOIN LATERAL (
                 SELECT $2::float8 / ($3::float8 * greatest(cos(radians(r.lat)), 0.01)) AS lng_step
               ) step
               CROSS JOIN LATERAL
                 generate_series(0, floor((r.xmax - r.xmin) / step.lng_step)::int) AS j
           ),
           on_ground AS (
             SELECT DISTINCT c.lat, c.lng
               FROM cells c
               JOIN seed_pieces sp
                 ON sp.geom && ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)
                AND ST_Covers(sp.geom, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326))
           )
           SELECT g.lat::float8 AS lat, g.lng::float8 AS lng,
                  EXISTS (
                    SELECT 1 FROM places p
                      JOIN place_geometries pg ON pg.place_id = p.place_id
                     WHERE p.provider_level_code = ANY($4::text[])
                       AND pg.provider_boundary_id IS NOT NULL -- real outlines only (red-team 2026-07-29): a sketch envelope would mark unoccupied cells covered
                       AND pg.geometry && ST_SetSRID(ST_MakePoint(g.lng, g.lat), 4326)
                       AND ST_Covers(pg.geometry, ST_SetSRID(ST_MakePoint(g.lng, g.lat), 4326))
                  ) AS covered
             FROM on_ground g
            ORDER BY g.lat, g.lng`,
          latStep,
          spacingKm,
          KM_PER_DEG_LAT,
          COVERED_LEVELS,
        );
      },
      { timeout: 600_000 },
    );

    const onGround = kept.length;
    const todo = kept.filter((k) => !k.covered);
    const planned = Math.min(todo.length, maxProbes);

    out('');
    out(`[seed] region        ${chosen.name} (${chosen.provider_level_code})`);
    out(`[seed] spacing       ${spacingKm} km`);
    out(
      `[seed] guarantee     every place at least ${spacingKm} km across is probed`,
    );
    out(`[seed] grid cells    ${onGround} on the real ground`);
    out(
      `[seed]               ${onGround - todo.length} already covered (skipped, free)`,
    );
    out(
      `[seed] probes        <=${planned}${planned < todo.length ? ` (capped from ${todo.length} by --max-probes)` : ''}` +
        ` — an UPPER BOUND: cells covered by places minted earlier in the run are skipped free`,
    );
    out(
      `[seed] wall clock     ~${Math.ceil((planned * SPACING_MS) / 60000)} min at ${SPACING_MS}ms pacing`,
    );
    // THE DEFERRED BILL (red-team 2026-08-01): the probes above are cheap-pool
    // draws, but every place this run MINTS earns a SCARCE polygon later,
    // through the governed drain. That spend is invisible here unless it is
    // said out loud — and it is bounded only by a campaign envelope.
    out(
      `[seed] deferred spend each MINTED place later earns one scarce polygon` +
        ` draw (~$${(tomtomScarceCostMicrosPerDraw / 1_000_000).toFixed(5)} each)` +
        ` via the governed drain — NOT spent by this run`,
    );
    out(
      campaignId
        ? `[seed] campaign      ${campaignId} — the drain meters those draws against its envelope`
        : `[seed] campaign      NONE (--campaign-id absent): those draws will have NO budget ceiling.` +
            ` The TomTom pools are per-minute RATE windows only. Pass --campaign-id for a country-scale run.`,
    );
    out('');

    if (!execute) {
      out('[seed] DRY-RUN — nothing probed, nothing written. Add --execute.');
      return;
    }

    // ── PROBE ────────────────────────────────────────────────────────────────
    let probed = 0;
    let empty = 0;
    let mintedRungs = 0;
    const before = await prisma.place.count();

    let skippedMidRun = 0;
    let faultedCells = 0;
    for (const cell of todo.slice(0, planned)) {
      // COVERAGE IS RE-JUDGED AT THE MOMENT OF USE, not once up front. A probe
      // that mints a municipality can cover many LATER cells, and re-asking is
      // one indexed predicate against a 220 ms vendor call — the reconciler
      // makes the same move with its `answered` regions. Without this, a dense
      // region pays full price for ground it has already learned.
      const [{ covered }] = await prisma.$queryRawUnsafe<
        Array<{ covered: boolean }>
      >(
        `SELECT EXISTS (
           SELECT 1 FROM places c JOIN place_geometries cg ON cg.place_id = c.place_id
            WHERE c.provider_level_code = ANY($3::text[])
              AND cg.provider_boundary_id IS NOT NULL
              AND cg.geometry && ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)
              AND ST_Covers(cg.geometry, ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326))
         ) AS covered`,
        cell.lat,
        cell.lng,
        COVERED_LEVELS,
      );
      if (covered) {
        skippedMidRun += 1;
        continue;
      }
      try {
        const result = await probe.probe({ lat: cell.lat, lng: cell.lng });
        probed += 1;
        if (result.kind === 'failed') {
          // A FAILURE IS NOT AN OBSERVATION: the draw was paid, the cell is
          // not "empty" — count it as faulted and keep the run alive.
          faultedCells += 1;
          out(
            `[seed] cell (${cell.lat},${cell.lng}) SKIPPED: ${result.reason}`,
          );
        } else if (result.kind === 'denied') {
          // Typed now — no string sentinel. The governor said not-now; a
          // budget-exhausted run must stop rather than write false negatives.
          out(`[seed] STOPPED after ${probed} probes: pool denied`);
          break;
        } else if (result.kind === 'empty') {
          empty += 1;
        } else {
          const places = await catalog.sketchChain(result.chain, {
            birthTrigger: 'bulk_seed',
            campaignId,
          });
          mintedRungs += places.length;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // The per-cell contract-violation branch is GONE: a vendor fault is
        // now a typed 'failed' observation handled above, not an exception
        // matched by message string.
        if (msg === 'tomtom_config_missing') {
          // The governor said not-now, or config is absent. Both are
          // OPERATIONAL, not "no place here" — the adapter throws precisely so
          // a budget-exhausted run cannot write false negatives over ground it
          // never actually probed. Stop cleanly; the catalog-as-ledger means a
          // later run resumes from here for free.
          out(`[seed] STOPPED after ${probed} probes: ${msg}`);
          break;
        }
        throw e;
      }
      await sleep(SPACING_MS);
    }

    const after = await prisma.place.count();
    out('');
    out(`[seed] probed        ${probed}`);
    out(
      `[seed] faulted cells ${faultedCells} (vendor contract violations — draws spent, no ground)`,
    );
    out(
      `[seed] skipped live  ${skippedMidRun} (covered by ground minted during this run)`,
    );
    out(`[seed] empty cells   ${empty} (vendor models nothing there)`);
    out(`[seed] chain rungs   ${mintedRungs} upserted`);
    out(`[seed] NEW places    ${after - before}`);
    out(
      `[seed] re-run is cheap: covered cells are skipped without a vendor call.`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exitCode = 1;
});
