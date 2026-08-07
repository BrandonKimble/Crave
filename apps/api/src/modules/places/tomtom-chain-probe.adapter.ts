/**
 * The REAL TomtomChainProbe adapter (plans/geo-demand-foundation-rebuild.md
 * §2 "sketch mechanics, live-verified") — replaces the Phase-A not-wired stub.
 *
 * Vendor facts (probed live 2026-07-19 against api.tomtom.com, this session):
 *  - The probe's reverse geocode is PLAIN — no `entityType` filter — and
 *    that is load-bearing (corrected 2026-08-07). The original vendor fact
 *    here claimed the filtered request carried the parent chain inline
 *    including countrySecondarySubdivision. Measured, it does not: PASSING
 *    `entityType` NULLS OUT `municipalitySubdivision` AND USUALLY
 *    `countrySecondarySubdivision`. Filtered vs plain at the same points:
 *
 *      point          filtered mSub / county   plain mSub / county
 *      Austin         null      / null         null      / Travis
 *      West Village   null      / null         Manhattan / New York
 *      Chicago        null      / null         null      / Cook
 *      Los Angeles    null      / Los Angeles  null      / Los Angeles
 *
 *    Every probe run before the correction built chains missing up to two
 *    rungs — the BOROUGH tier (Manhattan, Brooklyn, London districts, Paris
 *    arrondissements) and the COUNTY. MunicipalitySubdivision had ZERO rows
 *    in a 22k-place catalog, and the gap was nearly blamed on the vendor.
 *

 *    The filter is MODE SELECTION, not a knob: filtered = geography-mode
 *    (entityType echoed, boundingBox = the entity's own OUTLINE,
 *    dataSources.geometry.id present), plain = address-mode (no id, and
 *    boundingBox is `{"entity":"position"}` — a few-metre box that must
 *    NEVER be read as an outline). The probe uses BOTH modes for what each
 *    is for: plain for the complete chain of names, and one anchored
 *    SINGLE-LEVEL filtered reverse for the finest rung's identity — the
 *    geography at this point at this level, verified live 2026-08-07 to
 *    populate its own level's field and carry id + outline + position.
 *    `lookupLevelEntity` IS that call; the probe and the operator scripts
 *    share it. (The name-keyed forward geocode and its twin-disambiguation
 *    lottery are DELETED, 2026-08-07 round 2: the anchored lookup answers
 *    any rung for the same one-draw price, entity-honestly.)
 *
 * §2 mechanics implemented here:
 *  - 1 PLAIN reverse geocode per probe → the COMPLETE chain of names.
 *  - Per rung, identity BY THE POINT: the catalog's outline-grade covering
 *    entity is adopted free (the lawful BY-GROUND skip — see
 *    outlineEntitiesCovering; sketch envelopes never qualify), else one
 *    anchored single-level lookup buys geometry id + outline bbox +
 *    centroid. Steady state: 1-2 draws per probe.
 *  - A denial or fault while resolving ANY rung's identity PROPAGATES as
 *    the probe's own 'denied'/'failed' — an id-less rung may only mean the
 *    VENDOR answered (empty / wrong-level). The reconciler records
 *    asked-ground off a returned chain, and a quiet fault here became a
 *    30-day suppression of a never-minted place (round-2 red team, P5).
 *  - probedRegion = the DISC of the vendor's default reverse-geocode radius
 *    (100 m — vendor fact) around the anchor: the ground this probe actually
 *    speaks for when it says "no place here".
 */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

/**
 * One vocabulary for "we could not observe" (red team 2026-08-04). The
 * reasons are diagnostic, not dispatch — no caller may branch on them, which
 * is why they are strings and not a union.
 */
function describeTransportFault(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) return `tomtom_http_${error.response.status}`;
    if (error.code === 'ECONNABORTED') return 'tomtom_timeout';
    return `tomtom_transport_${error.code ?? 'unknown'}`;
  }
  return 'tomtom_transport_unknown';
}
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageLedgerService } from '../external-integrations/shared/usage-ledger.service';
import { SpendBudgetClosedError } from '../external-integrations/governance/governance.service';
import { GovernanceService } from '../external-integrations/governance/governance.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { GeoBbox, GeoPoint, ProbedRegion } from '@crave-search/shared';
import { PlaceSketchNode } from './places-catalog.service';
import {
  LevelEntityLookup,
  PolygonFetchResult,
  PROBE_SPEAKS_FOR_METERS,
  TomtomChainProbe,
  TomtomChainProbeResult,
} from './tomtom-chain-probe.port';

/**
 * The vendor's geography ladder, most specific first. This is PROVIDER
 * vocabulary handled at the provider adapter — the one place it may be
 * enumerated; the catalog stores providerLevelCode verbatim and never
 * switches on it (§1 open-vocabulary law).
 */
const LEVEL_LADDER: ReadonlyArray<{
  levelCode: string;
  nameOf: (address: TomtomAddress) => string | undefined;
}> = [
  { levelCode: 'Neighbourhood', nameOf: (a) => a.neighbourhood },
  {
    levelCode: 'MunicipalitySubdivision',
    nameOf: (a) => a.municipalitySubdivision,
  },
  { levelCode: 'Municipality', nameOf: (a) => a.municipality },
  {
    levelCode: 'CountrySecondarySubdivision',
    nameOf: (a) => a.countrySecondarySubdivision,
  },
  {
    levelCode: 'CountrySubdivision',
    // NAME field only — NO `?? a.countrySubdivision` fallback. That field is
    // the two-letter CODE ("TX", "MO"), not a name, so the fallback licensed
    // naming a ground "MO" instead of "Missouri". Both red-team reviewers
    // flagged it on 2026-07-29 and it was removed from
    // scripts/data-fixes/resolve-entity-names.ts — but that was one of THREE
    // copies of this ladder, and this one is the production naming path.
    // Field absent = this rung names nothing; the ladder falls to Country.
    nameOf: (a) => a.countrySubdivisionName,
  },
  { levelCode: 'Country', nameOf: (a) => a.country },
];

/**
 * Vendor fact: reverse geocode's default search radius — the ground a probe
 * speaks for. Lives on the PORT (shared with the reconciler's cell-level
 * derivation); this alias keeps the adapter reading in vendor terms.
 */
const REVERSE_GEOCODE_RADIUS_METERS = PROBE_SPEAKS_FOR_METERS;

/**
 * §16 K4-derived: the default poison span when a TomTom 429 arrives WITHOUT
 * a Retry-After header. The vendor's binding rate window on the Search
 * endpoints is per-SECOND (~5 QPS — same K4 fact behind the drain's
 * VENDOR_QPS_SPACING_MS), so one full window is the honest default; a
 * header-carried Retry-After always wins (mirrors reddit.service's §14.5
 * handling, where the vendor's minute window yields a 60s default).
 */
const TOMTOM_429_DEFAULT_RETRY_MS = 1_000;

type TomtomAddress = {
  countryCode?: string;
  country?: string;
  countrySubdivision?: string;
  countrySubdivisionName?: string;
  countrySubdivisionCode?: string;
  countrySecondarySubdivision?: string;
  municipality?: string;
  municipalitySubdivision?: string;
  neighbourhood?: string;
  boundingBox?: {
    northEast?: string;
    southWest?: string;
  };
};

type TomtomReverseAddressEntry = {
  address?: TomtomAddress;
  position?: string;
  dataSources?: { geometry?: { id?: string } };
  entityType?: string;
};

type TomtomReverseResponse = {
  addresses?: TomtomReverseAddressEntry[];
};

/** Additional Data (polygon) response shape — mirrors the live-proven parse
 *  in the legacy markets bootstrap (tomtom-boundary-bootstrap.service.ts). */
type TomtomAdditionalDataItem = {
  providerID?: string;
  providerId?: string;
  error?: string;
  geometryData?: {
    type?: string;
    features?: Array<{ type: string; geometry?: { type?: string } | null }>;
  } | null;
};

type TomtomAdditionalDataResponse = {
  additionalData?: TomtomAdditionalDataItem[];
};

@Injectable()
export class TomtomChainProbeAdapter implements TomtomChainProbe {
  private readonly logger: LoggerService;
  private readonly apiKey: string | undefined;
  private readonly reverseBaseUrl: string;
  private readonly additionalDataUrl: string;
  private readonly geometryZoom: number | null;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    /** The lawful BY-GROUND skip (outlineEntitiesCovering) — the adapter's
     *  only catalog read, and a read-only one. */
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
    private readonly usageLedger: UsageLedgerService,
    private readonly opsAlerts: OpsAlertsService,
    configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('TomtomChainProbeAdapter');
    this.apiKey = configService.get<string>('tomtom.apiKey');
    this.reverseBaseUrl = (
      configService.get<string>('tomtom.reverseGeocodeBaseUrl') ??
      'https://api.tomtom.com/search/2/reverseGeocode'
    ).replace(/\/$/, '');
    this.additionalDataUrl =
      configService.get<string>('tomtom.additionalDataUrl') ??
      'https://api.tomtom.com/search/2/additionalData.json';
    // Vendor knob (K4-adjacent): geometriesZoom tames polygon vertex counts —
    // same config the US-seed boundary fetches used ("geometriesZoom-tamed").
    const configuredGeometryZoom = Number(
      configService.get<number>('tomtom.geometryZoom'),
    );
    this.geometryZoom = Number.isFinite(configuredGeometryZoom)
      ? configuredGeometryZoom
      : null;
    // §16: the 10s fallback is K3-shaped operational plumbing (HTTP client
    // timeout when tomtom.timeout config is absent), not a product number —
    // a timed-out probe throws and retries on a later settle; no observation
    // is fabricated. Config-overridable; never judged at read.
    this.timeoutMs =
      Number(configService.get<number>('tomtom.timeout')) || 10000;
  }

  /**
   * Ask the money gate. Returns the arm to RETURN when we may not spend, or
   * null when the budget is open.
   *
   * 'denied' means the budget said no — routine, expected, alerted by the gate
   * itself. 'failed' means the gate could not ANSWER: an unregistered pool
   * throws from requirePool with no ops alert, so collapsing it into 'denied'
   * made a systemic fault look like back-pressure and would have stopped
   * TomTom silently and forever (red team 2026-08-04, proven against the real
   * adapter).
   */
  private async spendGateVerdict(): Promise<
    | { kind: 'denied' }
    // The gate already REPORTS scope (a spend-gate outage is systemic); this
    // return type just had not been widened to carry it, so every caller lost
    // the distinction the port now requires.
    | { kind: 'failed'; reason: string; scope: 'systemic' | 'row' }
    | null
  > {
    try {
      await this.governance.assertTomtomSpendOpen();
      return null;
    } catch (error) {
      if (error instanceof SpendBudgetClosedError) {
        return { kind: 'denied' };
      }
      this.logger.error('TomTom spend gate could not answer', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        kind: 'failed',
        reason: 'tomtom_spend_gate_unavailable',
        scope: 'systemic',
      };
    }
  }

  async probe(anchor: GeoPoint): Promise<TomtomChainProbeResult> {
    if (!this.apiKey) {
      // Config absence is an operational fault, not a "no place here"
      // observation — throw so the reconciler logs it and does NOT write a
      // negative observation over ground it never actually probed.
      throw new Error('tomtom_config_missing');
    }
    // DOLLAR GATE BEFORE THE RATE GATE (red team 2026-08-04, same ordering
    // as google-places.service): rate limits shape burst, they are not a
    // budget. TomTom had NO money gate at all — the per-minute pools permit
    // ~$1,400/day indefinitely against a PREPAID balance no API can read.
    // Inside the adapter, not at call sites, so no caller can forget it.
    // A closed budget is the same typed not-now as a pool denial.
    const budget = await this.spendGateVerdict();
    if (budget) {
      return budget;
    }

    const outcome = await this.reverseGeocode(anchor);
    if (outcome.kind === 'failed') {
      // The body did not match the vendor's contract — WE failed to observe.
      return { kind: 'failed', reason: outcome.reason, scope: outcome.scope };
    }
    if (outcome.kind === 'denied') {
      return { kind: 'denied' };
    }
    // ANY THROW WHILE READING THE VENDOR BODY IS A TYPED FAULT (property
    // test, 2026-08-04). Scoped to the PARSE: the catalog read and the
    // per-rung identity lookups inside interpretReverse are total (typed
    // arms, never throws), so this catch cannot mislabel their faults as
    // vendor-JSON faults or throw away a chain already paid for.
    // The parse below reads vendor-controlled JSON, and a field whose TYPE is
    // wrong — `countryCode: 123` — made `?.trim()` throw straight out of
    // probe(), escaping the union entirely: the one shape a caller cannot
    // handle, from the one place we do not control. A shape catalogue never
    // found it because a catalogue only contains shapes someone imagined.
    // Interpretation is now total: it returns a fault or it returns an
    // observation, and it cannot do neither.
    try {
      return await this.interpretReverse(
        outcome.entries,
        anchor,
        this.probedRegionAround(anchor),
      );
    } catch (error) {
      return {
        kind: 'failed',
        reason: `tomtom_parse_threw_${error instanceof Error ? error.name : 'unknown'}`,
        scope: 'systemic',
      };
    }
  }

  /** The body → observation interpretation. Total by construction: every exit
   *  is a typed arm, and probe() converts any throw here into a fault. */
  private async interpretReverse(
    entries: unknown[],
    anchor: GeoPoint,
    probedRegion: ProbedRegion,
  ): Promise<TomtomChainProbeResult> {
    if (entries.length === 0) {
      // The vendor answered, well-formed, with NO addresses: it OBSERVED that
      // nothing lives here. The one and only case that may be remembered.
      return { kind: 'empty', probedRegion };
    }
    const first = entries[0];
    if (typeof first !== 'object' || first === null) {
      // An entry that is not an object is a contract violation, NOT an
      // observation of emptiness.
      return {
        kind: 'failed',
        reason: 'tomtom_entry_shape',
        scope: 'systemic',
      };
    }
    const entry = first as TomtomReverseAddressEntry;
    if (!entry.address || typeof entry.address !== 'object') {
      return {
        kind: 'failed',
        reason: 'tomtom_address_missing',
        scope: 'systemic',
      };
    }

    const address = entry.address;
    // Vendor-controlled TYPE, not just value: a non-string here is a contract
    // violation, read as absent rather than coerced or thrown on.
    const countryCode =
      typeof address.countryCode === 'string'
        ? address.countryCode.trim().toUpperCase()
        : undefined;
    if (!countryCode) {
      // The vendor DID describe this ground but the response is malformed
      // (rungs named, country slot empty — a contract violation, since
      // TomTom's country rung is universal). Ladder-audit 2026-08-01: the
      // old `return { chain: [], probedRegion }` recorded this as a §2
      // "nothing lives here" negative observation — a missing FIELD written
      // as an absence of GROUND, suppressing re-probes for the TTL. It is
      // now a typed FAILURE — no throw (which discarded the paid reverse
      // call), no memory, no string sentinel to match on.
      return {
        kind: 'failed',
        reason: 'tomtom_missing_country_code',
        scope: 'systemic',
      };
    }
    const subdivisionCode =
      address.countrySubdivisionCode?.trim() ||
      address.countrySubdivision?.trim() ||
      null;

    // Build the chain (most specific first) from whatever rungs the response
    // actually names — §2 sketches what was OBSERVED, never a padded ladder.
    const chain: PlaceSketchNode[] = [];
    for (const rung of LEVEL_LADDER) {
      const name = rung.nameOf(address)?.trim();
      if (!name) {
        continue;
      }
      chain.push({
        name,
        providerLevelCode: rung.levelCode,
        countryCode,
        // A country is not inside a subdivision — identity stops at itself.
        subdivisionCode: rung.levelCode === 'Country' ? null : subdivisionCode,
      });
    }
    if (chain.length === 0) {
      // Well-formed, carries a country code, yet names NO rung of the
      // ladder: a contract violation, not an observation of emptiness.
      return {
        kind: 'failed',
        reason: 'tomtom_named_no_rungs',
        scope: 'systemic',
      };
    }

    // EVERY RUNG'S IDENTITY IS ANSWERED BY THE POINT (2026-08-07, round-2
    // red team). One mechanism for all six rungs: the anchored single-level
    // filtered reverse (lookupLevelEntity) — geography-mode, so it carries
    // the geometry id + outline bbox + centroid, keyed by the ANCHOR rather
    // than a name. The name-keyed forward geocode and its twin lottery are
    // deleted: the same one-draw price bought a strictly weaker answer.
    //
    // THE LAWFUL SKIP: a rung whose OUTLINE-grade ground covers the anchor
    // is already-known BY GROUND — the covering outline IS the entity, so
    // its stored identity is adopted and no draw is spent. This is not the
    // name-keyed reconciliation the county dissolution outlawed; it is the
    // same ST_Covers question the containment law asks everywhere else.
    // Sketch envelopes never qualify (they overhang real ground). In steady
    // state a probe therefore spends 1-2 draws, not 7; before this skip the
    // country/state/county under every settled city were re-bought on every
    // probe, forever.
    const known = await this.outlineEntitiesCovering(anchor);
    for (const node of chain) {
      const owned = known.get(node.providerLevelCode);
      if (owned) {
        node.providerPlaceId = owned;
        continue;
      }
      const lookup = await this.lookupLevelEntity(
        anchor,
        node.providerLevelCode,
      );
      if (lookup.kind === 'named') {
        node.providerPlaceId = lookup.geometryId;
        node.bbox = lookup.bbox ?? undefined;
        node.centroid = lookup.centroid ?? undefined;
        continue;
      }
      if (lookup.kind === 'empty' || lookup.kind === 'wrong-level') {
        // A VENDOR ANSWER about this rung: it models no entity at this
        // level here (or a different level). The rung stays id-less —
        // upsertSketch drops it and the chain threads past — and that is an
        // observation, not a gap.
        this.logger.debug('Rung unmodelled by the vendor at this level', {
          levelCode: node.providerLevelCode,
          answered: lookup.kind,
        });
        continue;
      }
      // denied / failed: WE could not resolve this rung's identity. This
      // must PROPAGATE, never survive as a silently id-less rung — the
      // reconciler records asked-ground off a returned chain, so a fault
      // that stayed quiet here became a 30-day suppression of a
      // never-minted place (round-2 red team, P5 class: the pool denying
      // the SECOND call of a probe erased the neighbourhood the probe
      // existed for AND blocked its rediscovery).
      if (lookup.kind === 'denied') {
        return { kind: 'denied' };
      }
      return { kind: 'failed', reason: lookup.reason, scope: lookup.scope };
    }

    return { kind: 'named', chain };
  }

  /**
   * The catalog's outline-grade entities covering a point, by level:
   * providerLevelCode → providerPlaceId. Overlapping outlines at one level
   * resolve to the smallest (the finest representative). A failed read
   * yields the empty map — the probe then SPENDS instead of skipping, which
   * is the safe direction (a catalog blip must never erase a rung).
   */
  private async outlineEntitiesCovering(
    anchor: GeoPoint,
  ): Promise<Map<string, string>> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ levelCode: string; providerPlaceId: string }>
      >`
        SELECT DISTINCT ON (p.provider_level_code)
               p.provider_level_code AS "levelCode",
               p.provider_place_id  AS "providerPlaceId"
        FROM places p
        JOIN place_geometries g ON g.place_id = p.place_id
        WHERE g.provider_boundary_id IS NOT NULL
          AND p.provider_place_id IS NOT NULL
          AND g.geometry && ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), 4326)
          AND ST_Covers(
            g.geometry,
            ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), 4326)
          )
        ORDER BY p.provider_level_code, ST_Area(g.geometry) ASC
      `;
      return new Map(rows.map((row) => [row.levelCode, row.providerPlaceId]));
    } catch (error) {
      this.logger.warn(
        'Outline-coverage read failed — probe spends instead of skipping',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return new Map();
    }
  }

  /**
   * §14.5: an upstream 429 on a governed TomTom act poisons the CREDENTIAL
   * the pool draws on — so the retry-after reaches all three TomTom pools,
   * not just the one whose request received it. That matters here more than
   * anywhere else in the codebase: TomTom publishes QPS per API KEY, and
   * this adapter spends one key across reverseGeocode, geocode and
   * scarcePolygons. This comment used to say "the pool's ONE window", which
   * stopped being true when those three pools were split apart on
   * 2026-07-30; see PoolRegistry.poisonedUntil. Returns true when the
   * error was a 429 (poison applied; caller surfaces its typed 'denied' /
   * pool-denial path so NO attempt is recorded on a transient), false for
   * every other error (genuine vendor fault — caller keeps throwing).
   */
  private poisonPoolOn429(error: unknown, poolName: string): boolean {
    const axiosError = error as AxiosError;
    if (axiosError?.response?.status !== 429) {
      return false;
    }
    const retryAfterSeconds = Number.parseInt(
      String(axiosError.response.headers?.['retry-after'] ?? ''),
      10,
    );
    const retryAfterMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : TOMTOM_429_DEFAULT_RETRY_MS;
    this.governance.pools.poisonWindow(poolName, retryAfterMs);
    this.logger.warn('TomTom 429 — pool window poisoned', {
      poolName,
      retryAfterMs,
    });
    const dayKey = new Date().toISOString().slice(0, 10);
    this.opsAlerts.emit({
      severity: 'warn',
      kind: 'tomtom_vendor_throttle',
      title: `TomTom vendor 429 (${poolName})`,
      body: `TomTom returned 429 for pool ${poolName}; window poisoned for ${retryAfterMs}ms. This is a throttle signal, not a balance read (the vendor exposes no prepaid-balance API) — check the TomTom portal if this recurs.`,
      dedupeKey: `tomtom_vendor_throttle:${poolName}:${dayKey}`,
    });
    return true;
  }

  /** TOMTOM IS ON THE LEDGER (round-six cost #3): these draws drain real
   *  prepaid credit and debit campaign envelopes, but wrote no
   *  api_usage_ledger row — so cost-reconcile and the campaign post-mortem
   *  could never see them. One row per ADMITTED draw (F350, 2026-08-03):
   *  this is no longer called after a non-null response — it is handed to the
   *  governor as `onDrawConsumed`, which fires it on the throw path too. That
   *  is the whole point: a transport-errored draw debited the pool and used
   *  to write NO ledger row, so cost-reconcile could not see it at all. The
   *  governor is the only thing that knows a draw was admitted, so it is the
   *  only thing allowed to say one happened. Fire-and-forget like every
   *  ledger write. */
  private recordDraw(operation: string): void {
    this.usageLedger.record({
      service: 'tomtom',
      operation,
      caller: 'tomtom-chain-probe',
    });
  }

  async lookupLevelEntity(
    anchor: GeoPoint,
    levelCode: string,
  ): Promise<LevelEntityLookup> {
    if (!this.apiKey) {
      // Typed, not thrown (round-2 red team): config absence is exactly "we
      // could not observe", the union has the word for it, and the two
      // operator scripts that reach here carefully handle typed stops but
      // caught no raw Error.
      return {
        kind: 'failed',
        reason: 'tomtom_config_missing',
        scope: 'systemic',
      };
    }
    const budget = await this.spendGateVerdict();
    if (budget) {
      return budget;
    }
    const url = `${this.reverseBaseUrl}/${anchor.lat},${anchor.lng}.json`;
    let response: AxiosResponse<TomtomReverseResponse> | null;
    try {
      response = await this.governance.draw(
        'tomtom.reverseGeocode',
        'level-entity-lookup',
        () =>
          firstValueFrom(
            this.httpService.get<TomtomReverseResponse>(url, {
              params: { key: this.apiKey as string, entityType: levelCode },
              timeout: this.timeoutMs,
            }),
          ),
        { onDrawConsumed: () => this.recordDraw('reverseGeocode') },
      );
    } catch (error) {
      if (this.poisonPoolOn429(error, 'tomtom.reverseGeocode')) {
        return { kind: 'denied' };
      }
      return {
        kind: 'failed',
        reason: describeTransportFault(error),
        scope: 'systemic',
      };
    }
    if (!response) {
      return { kind: 'denied' };
    }
    if (!Array.isArray(response.data?.addresses)) {
      return { kind: 'failed', reason: 'tomtom_body_shape', scope: 'systemic' };
    }
    // THE SAME COLLAPSE, ONE METHOD OVER (red team 2026-08-04, second pass).
    // This shipped the same day as the fix that removed `addresses[0] ?? null`
    // from reverseGeocode, and reintroduced it verbatim here: a body whose
    // single entry is null/0/'' read as 'empty', which BOTH consumers report
    // to the owner as "the vendor models nothing at our level here". P5 in
    // reporting, inside the method added to end P5 in reporting.
    const entries = response.data.addresses;
    if (entries.length === 0) {
      return { kind: 'empty' };
    }
    const first: unknown = entries[0];
    if (typeof first !== 'object' || first === null) {
      return {
        kind: 'failed',
        reason: 'tomtom_entry_shape',
        scope: 'row',
      };
    }
    const entry = first as TomtomReverseAddressEntry;
    if (typeof entry.address !== 'object' || entry.address === null) {
      // 'row' scope: the vendor ANSWERED about this ask and the answer is
      // unusable — the next row/rung is unaffected. These three shape
      // faults were 'systemic' until the round-2 red team pointed out that
      // made the port's 'row' arm unreachable dead contract on this path.
      return {
        kind: 'failed',
        reason: 'tomtom_address_missing',
        scope: 'row',
      };
    }
    if (
      entry.entityType !== undefined &&
      typeof entry.entityType !== 'string'
    ) {
      return {
        kind: 'failed',
        reason: 'tomtom_entity_type_shape',
        scope: 'row',
      };
    }
    // THE ECHO GATE LIVES HERE NOW (round-2 red team): entityType is a
    // FILTER the vendor may answer past, and a caller who forgot to compare
    // it believed geometry for a different rung. Answering about a
    // different level is a first-class vendor ANSWER, its own arm — silent
    // mismatch was indistinguishable from a fault, the P5 road.
    if ((entry.entityType ?? null) !== levelCode) {
      return { kind: 'wrong-level', entityType: entry.entityType ?? null };
    }
    return {
      kind: 'named',
      geometryId: entry.dataSources?.geometry?.id?.trim() || null,
      entityType: entry.entityType ?? null,
      // Proven a non-null object above; the cast narrows to the NAME fields
      // the two operator scripts read (boundingBox is parsed separately).
      address: entry.address as Record<string, string | undefined>,
      // Geography-mode: the boundingBox on a FILTERED reverse is the
      // answering entity's own outline (the plain probe response's is a
      // position box — parsed nowhere, on purpose).
      bbox: parseGeographyBoundingBox(entry.address.boundingBox),
      centroid: parseLatLngString(entry.position),
    };
  }

  /** One governed reverse geocode; a pool denial reads as "no answer now". */
  private async reverseGeocode(anchor: GeoPoint): Promise<
    // THE WHOLE ARRAY, not addresses[0] (property test, 2026-08-04). Collapsing
    // to `addresses[0] ?? null` made "the array is EMPTY" and "the array has a
    // first element that is null/0/''/false" indistinguishable — so a
    // malformed single-entry body was remembered as a negative OBSERVATION and
    // written to probed_regions with a 30-day TTL, suppressing re-probes over
    // real ground. P5 again: a fault kept as ground truth.
    | { kind: 'ok'; entries: unknown[] }
    | { kind: 'failed'; reason: string; scope: 'systemic' | 'row' }
    | { kind: 'denied' }
  > {
    const url = `${this.reverseBaseUrl}/${anchor.lat},${anchor.lng}.json`;
    let response: AxiosResponse<TomtomReverseResponse> | null;
    try {
      response = await this.governance.draw(
        'tomtom.reverseGeocode',
        'chain-probe',
        () =>
          firstValueFrom(
            this.httpService.get<TomtomReverseResponse>(url, {
              params: {
                // PLAIN — no entityType. The filter nulls out
                // municipalitySubdivision and usually
                // countrySecondarySubdivision (measured 2026-08-07, header
                // table), so filtering here truncated every chain this
                // adapter ever built. Geometry comes from the per-rung
                // anchored lookups, never from this response.
                key: this.apiKey as string,
              },
              timeout: this.timeoutMs,
            }),
          ),
        { onDrawConsumed: () => this.recordDraw('reverseGeocode') },
      );
    } catch (error) {
      if (this.poisonPoolOn429(error, 'tomtom.reverseGeocode')) {
        return { kind: 'denied' };
      }
      // Transport faults are the union's 'failed' arm now, not a throw: a
      // thrown fault made every CALLER's catch block decide what a fault
      // means, and the reconciler's had no catch at all — one vendor 500
      // aborted the whole settle pass and discarded rememberAskedRegion work
      // already paid for (red team 2026-08-04).
      return {
        kind: 'failed',
        reason: describeTransportFault(error),
        scope: 'systemic',
      };
    }
    if (!response) {
      // Pool denial — the probe simply doesn't happen this cycle; the ground
      // was never asked, so nothing may be remembered.
      return { kind: 'denied' };
    }
    // A well-formed 200 has an `addresses` ARRAY (possibly empty). Anything
    // else is a contract violation, NOT an observation of emptiness — the
    // distinction the observation type exists to make.
    if (!Array.isArray(response.data?.addresses)) {
      return { kind: 'failed', reason: 'tomtom_body_shape', scope: 'systemic' };
    }
    return { kind: 'ok', entries: response.data.addresses };
  }

  /**
   * §2 promotion step 2 — the SCARCE draw: geometry id → Additional Data
   * polygon (parse mirrors the live-proven legacy bootstrap). `denied` =
   * typed not-now (item stays queued for the next month window); `miss` =
   * the draw was consumed but the vendor had no Polygon/MultiPolygon for
   * this id. Transport errors throw (consumed draw, systemic).
   *
   * `onDrawConsumed` (F350) is the CALLER's meter — the campaign envelope —
   * and it rides the governor's single per-admitted-draw announcement, the
   * same one that writes the ledger row. The caller must NOT increment its
   * own counter off the returned kind: that is exactly how the envelope came
   * to miss the transport-error path while the pool debited it. One draw,
   * one announcement, every meter hanging off it.
   */
  async fetchPolygon(
    geometryId: string,
    onDrawConsumed?: () => void,
  ): Promise<PolygonFetchResult> {
    if (!this.apiKey) {
      throw new Error('tomtom_config_missing');
    }
    // DOLLAR GATE BEFORE THE RATE GATE — see probe(). The scarce draws are
    // the expensive ones, so this path matters most.
    const budget = await this.spendGateVerdict();
    if (budget) {
      return budget;
    }
    const params: Record<string, string | number> = {
      key: this.apiKey,
      geometries: geometryId,
    };
    if (this.geometryZoom !== null) {
      params.geometriesZoom = this.geometryZoom;
    }
    let response: AxiosResponse<TomtomAdditionalDataResponse> | null;
    try {
      response = await this.governance.draw(
        'tomtom.scarcePolygons',
        'promotion',
        () =>
          firstValueFrom(
            this.httpService.get<TomtomAdditionalDataResponse>(
              this.additionalDataUrl,
              { params, timeout: this.timeoutMs },
            ),
          ),
        {
          onDrawConsumed: () => {
            this.recordDraw('additionalData');
            onDrawConsumed?.();
          },
        },
      );
    } catch (error) {
      // Wave-6 item 2: a 429 is a transient rate signal, NOT a systemic
      // vendor fault — poison the window and surface the typed 'denied'
      // (promoteOne leaves the row UNTOUCHED and ends the pass) instead of
      // throwing (which would recordAttempt and burn the row's month
      // backoff on a transient).
      if (this.poisonPoolOn429(error, 'tomtom.scarcePolygons')) {
        return { kind: 'denied' };
      }
      // A transport fault is OUR failure to observe, not the vendor's answer
      // (red team 2026-08-04). Throwing here made the caller's catch decide
      // what a fault means — and fetchPolygon's callers counted it with
      // recordAttempt, which was right by luck, not by type.
      return {
        kind: 'failed',
        reason: describeTransportFault(error),
        scope: 'systemic',
      };
    }
    if (!response) {
      return { kind: 'denied' };
    }
    if (!Array.isArray(response.data?.additionalData)) {
      // 200 with a body that is not the contract (an HTML error page from a
      // proxy, `{}`, null). NOT a miss: the vendor never answered the
      // question.
      return { kind: 'failed', reason: 'tomtom_body_shape', scope: 'systemic' };
    }
    const items = response.data.additionalData;
    const item = items.find(
      (entry) => (entry.providerID ?? entry.providerId) === geometryId,
    );
    if (!item) {
      // The vendor did not echo the id we asked about — a wrong-entity
      // answer, not evidence that no polygon exists.
      return {
        kind: 'failed',
        reason: 'tomtom_geometry_id_not_echoed',
        scope: 'row',
      };
    }
    if (item.error) {
      this.logger.warn('TomTom additional data geometry error', {
        geometryId,
        tomTomError: item.error,
      });
      return { kind: 'miss' };
    }
    const geometryData = item.geometryData ?? null;
    if (
      !geometryData ||
      geometryData.type !== 'FeatureCollection' ||
      !Array.isArray(geometryData.features)
    ) {
      // The vendor echoed the id but the payload is not the contract —
      // malformed, not "no polygon exists".
      return {
        kind: 'failed',
        reason: 'tomtom_geometry_payload_shape',
        scope: 'row',
      };
    }
    const polygonFeatures = geometryData.features.filter((feature) => {
      const geometryType = feature.geometry?.type;
      return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    });
    if (!polygonFeatures.length) {
      return { kind: 'miss' };
    }
    return {
      kind: 'ok',
      geojson: { type: 'FeatureCollection', features: polygonFeatures },
    };
  }

  /**
   * The disc this probe speaks for: the anchor plus the vendor's default
   * reverse-geocode radius. Recorded as a RADIUS, not a square — squaring it
   * claimed ~21% more ground than was ever asked about (see the port doc).
   */
  private probedRegionAround(anchor: GeoPoint): ProbedRegion {
    return {
      kind: 'disc',
      center: anchor,
      radiusMeters: REVERSE_GEOCODE_RADIUS_METERS,
    };
  }
}

/** Geography-mode reverse bbox: {northEast,southWest} as "lat,lng" strings.
 * THE one vendor bbox parser now (2026-08-07): every rung's geometry
 * arrives via the anchored single-level lookup, whose boundingBox is the
 * entity's outline. (The probe's PLAIN reverse also carries a boundingBox,
 * but that one is a position box and is parsed NOWHERE — this function
 * must only ever be fed filtered-mode responses. The forward-geocode
 * parser died with the forward geocode.)
 *
 * LONGITUDE PRESERVES THE PROVIDER'S EDGE ORDER (F3001, 2026-08-06):
 * southWest.lng is the WEST edge (minLng), northEast.lng the EAST edge
 * (maxLng), verbatim — min/max on longitude destroyed the antimeridian
 * crossing representation (a 20° wrap box parsed as its 340° COMPLEMENT
 * arc). min/max stays for LATITUDE only, where there is no wraparound.
 * F3001's tests live in the adapter spec against THIS function.
 */
export function parseGeographyBoundingBox(
  box: TomtomAddress['boundingBox'],
): GeoBbox | null {
  const ne = parseLatLngString(box?.northEast);
  const sw = parseLatLngString(box?.southWest);
  if (!ne || !sw) {
    return null;
  }
  return {
    minLat: Math.min(ne.lat, sw.lat),
    minLng: sw.lng,
    maxLat: Math.max(ne.lat, sw.lat),
    maxLng: ne.lng,
  };
}

/** TomTom's "lat,lng" comma string → GeoPoint. */
function parseLatLngString(value: string | undefined): GeoPoint | null {
  if (!value) {
    return null;
  }
  const [latRaw, lngRaw] = value.split(',');
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}
