/**
 * The REAL TomtomChainProbe adapter (plans/geo-demand-foundation-rebuild.md
 * §2 "sketch mechanics, live-verified") — replaces the Phase-A not-wired stub.
 *
 * Vendor facts (probed live 2026-07-19 against api.tomtom.com, this session):
 *  - Reverse geocode with a multi-value `entityType` list returns ONE
 *    address: the MOST SPECIFIC matching geography, carrying its own
 *    `address.boundingBox` ({northEast,southWest} as "lat,lng" STRINGS), its
 *    stable `dataSources.geometry.id`, and the PARENT CHAIN NAMES inline
 *    (municipality / countrySecondarySubdivision / countrySubdivision /
 *    country) WITHOUT parent bboxes or ids.
 *  - Forward geocode (`entityTypeSet=<level>&limit=1`) returns a Geography
 *    result with `boundingBox` as {topLeftPoint,btmRightPoint} {lat,lon}
 *    OBJECTS (a DIFFERENT shape than reverse — do not unify blindly) plus the
 *    same stable geometry id family (§1 identity law: identical id across
 *    reverse and forward for the same entity, live-validated).
 *
 * §2 mechanics implemented here:
 *  - 1 reverse geocode per probe → full chain of names; the returned entity's
 *    bbox+id come free.
 *  - +1 cheap forward geocode per PREVIOUSLY-UNKNOWN node (unknown = the
 *    catalog has no bbox for that identity tuple — which also delivers §2's
 *    "once ever per node globally" without any extra bookkeeping).
 *  - Forward-geocode ceiling per probe = 5: DEFINITIONAL (§16) — the vendor
 *    ladder has 6 rungs (Neighbourhood → Country) and the most specific rung
 *    always comes free with the reverse response.
 *  - Every vendor call rides the governed cheap pool (§14/§22). A denial on
 *    a FORWARD call just leaves that node bbox-less (a later probe fills it);
 *    a denial on the REVERSE call throws — the ground was never asked, so the
 *    reconciler must log-and-skip, never record a false "no place here".
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
import { GovernanceService } from '../external-integrations/governance/governance.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import {
  GeoBbox,
  GeoPoint,
  bboxContainsPoint,
  ProbedRegion,
} from '@crave-search/shared';
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
    nameOf: (a) => a.countrySubdivisionName ?? a.countrySubdivision,
  },
  { levelCode: 'Country', nameOf: (a) => a.country },
];

/** §16 definitional: 6-rung ladder, most-specific rung free with reverse. */
const MAX_FORWARD_GEOCODES_PER_PROBE = LEVEL_LADDER.length - 1;

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

/**
 * §2.5 twin disambiguation: how many FORWARD-GEOCODE candidates to draw, so
 * the caller's anchor-containment check has twins to pick between. Vendor
 * duplicate sets observed so far are 2-4 records deep; 5 is headroom, still
 * one cheap draw.
 *
 * It was called GEOMETRY_ID_CANDIDATE_LIMIT — named for `resolveGeometryId`,
 * a function this file's own comment records as DELETED — and declared 170
 * lines below its only use.
 */
const FORWARD_GEOCODE_CANDIDATE_LIMIT = 5;

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

type TomtomGeocodeResult = {
  type?: string;
  entityType?: string;
  address?: TomtomAddress;
  position?: { lat?: number; lon?: number };
  boundingBox?: {
    topLeftPoint?: { lat?: number; lon?: number };
    btmRightPoint?: { lat?: number; lon?: number };
  };
  dataSources?: { geometry?: { id?: string } };
};

type TomtomGeocodeResponse = {
  results?: TomtomGeocodeResult[];
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
  private readonly geocodeBaseUrl: string;
  private readonly additionalDataUrl: string;
  private readonly geometryZoom: number | null;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
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
    this.geocodeBaseUrl = (
      configService.get<string>('tomtom.geocodeBaseUrl') ??
      'https://api.tomtom.com/search/2/geocode'
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

  async probe(anchor: GeoPoint): Promise<TomtomChainProbeResult> {
    const probedRegion = this.probedRegionAround(anchor);
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
    try {
      await this.governance.assertTomtomSpendOpen();
    } catch {
      return { kind: 'denied' };
    }

    const outcome = await this.reverseGeocode(anchor);
    if (outcome.kind === 'failed') {
      // The body did not match the vendor's contract — WE failed to observe.
      return { kind: 'failed', reason: outcome.reason };
    }
    if (outcome.kind === 'denied') {
      return { kind: 'denied' };
    }
    // ANY THROW WHILE INTERPRETING IS A TYPED FAULT (property test, 2026-08-04).
    // The parse below reads vendor-controlled JSON, and a field whose TYPE is
    // wrong — `countryCode: 123` — made `?.trim()` throw straight out of
    // probe(), escaping the union entirely: the one shape a caller cannot
    // handle, from the one place we do not control. A shape catalogue never
    // found it because a catalogue only contains shapes someone imagined.
    // Interpretation is now total: it returns a fault or it returns an
    // observation, and it cannot do neither.
    try {
      return await this.interpretReverse(outcome.entries, anchor, probedRegion);
    } catch (error) {
      return {
        kind: 'failed',
        reason: `tomtom_parse_threw_${error instanceof Error ? error.name : 'unknown'}`,
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
      return { kind: 'failed', reason: 'tomtom_entry_shape' };
    }
    const entry = first as TomtomReverseAddressEntry;
    if (!entry.address || typeof entry.address !== 'object') {
      return { kind: 'failed', reason: 'tomtom_address_missing' };
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
      return { kind: 'failed', reason: 'tomtom_missing_country_code' };
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
      return { kind: 'failed', reason: 'tomtom_named_no_rungs' };
    }

    // The returned entity's own bbox + stable geometry id come free.
    const freeNode = chain.find(
      (node) => node.providerLevelCode === entry.entityType,
    );
    if (freeNode) {
      freeNode.bbox = parseReverseBoundingBox(address.boundingBox);
      freeNode.centroid = parseLatLngString(entry.position);
      freeNode.providerPlaceId =
        entry.dataSources?.geometry?.id?.trim() || null;
    }

    // +1 cheap forward geocode per PREVIOUSLY-UNKNOWN node (§2): unknown =
    // catalog holds no bbox for the identity tuple. Once sketched with a
    // bbox, a node is never forward-geocoded again, globally.
    let forwardBudget = MAX_FORWARD_GEOCODES_PER_PROBE;
    for (const node of chain) {
      if (node.bbox || forwardBudget <= 0) {
        continue;
      }
      if (await this.catalogKnowsBbox(node)) {
        continue;
      }
      forwardBudget -= 1;
      const resolved = await this.forwardGeocode(node, anchor);
      if (resolved) {
        node.bbox = resolved.bbox;
        node.centroid = resolved.centroid;
        node.providerPlaceId = node.providerPlaceId ?? resolved.providerPlaceId;
      }
    }

    return { kind: 'named', chain, probedRegion };
  }

  /**
   * §14.5: an upstream 429 on a governed TomTom act poisons the pool's ONE
   * window — retry-after honored GLOBALLY through the governor, never per
   * caller (mirrors reddit.service.ts makeRequest). Returns true when the
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
      throw new Error('tomtom_config_missing');
    }
    try {
      await this.governance.assertTomtomSpendOpen();
    } catch {
      return { kind: 'denied' };
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
      return { kind: 'failed', reason: describeTransportFault(error) };
    }
    if (!response) {
      return { kind: 'denied' };
    }
    if (!Array.isArray(response.data?.addresses)) {
      return { kind: 'failed', reason: 'tomtom_body_shape' };
    }
    const entry = response.data.addresses[0];
    if (!entry) {
      return { kind: 'empty' };
    }
    return {
      kind: 'named',
      geometryId: entry.dataSources?.geometry?.id ?? null,
      entityType: entry.entityType ?? null,
      address: (entry.address ?? {}) as Record<string, string | undefined>,
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
    | { kind: 'failed'; reason: string }
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
                key: this.apiKey as string,
                entityType: LEVEL_LADDER.map((rung) => rung.levelCode).join(
                  ',',
                ),
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
      return { kind: 'failed', reason: describeTransportFault(error) };
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
      return { kind: 'failed', reason: 'tomtom_body_shape' };
    }
    return { kind: 'ok', entries: response.data.addresses };
  }

  /**
   * Governed forward geocode of one chain node; null on any miss.
   *
   * ANCHOR-CONTAINMENT VALIDATION (coherence red-team 2026-07-23): this
   * fill DONATES the node's catalog bbox (resolveGeometryId, its old
   * consumer, is deleted — dockets #1/#4), so it must not adopt a
   * wrong-twin record itself. The probe owns ground truth the drain lacks:
   * the chain came from reverse-geocoding THE ANCHOR, so the node's true
   * extent must contain that point — a same-name twin elsewhere cannot.
   * Draw a candidate list and take the first (vendor-ranked) candidate whose
   * bbox contains the anchor; none containing = stay bbox-less (a later
   * probe retries) rather than poison the catalog index.
   */
  private async forwardGeocode(
    node: PlaceSketchNode,
    anchor: GeoPoint,
  ): Promise<{
    bbox: GeoBbox | null;
    centroid: GeoPoint | null;
    providerPlaceId: string | null;
  } | null> {
    // The adapter's own contract: "a denial on a FORWARD call just leaves
    // that node bbox-less". Red-team 2026-08-01: a NON-429 transport error
    // rethrew instead, discarding the whole chain from an ALREADY-PAID
    // reverse geocode and forcing the next settle to pay for it again. A
    // forward fault is per-node and non-fatal, by the stated law.
    let outcome: Awaited<ReturnType<typeof this.forwardGeocodeMatch>>;
    try {
      outcome = await this.forwardGeocodeMatch(node);
    } catch (error) {
      this.logger.warn('forwardGeocode faulted — node stays bbox-less', {
        name: node.name,
        level: node.providerLevelCode,
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    if (outcome.kind !== 'ok') {
      return null; // denial: bbox-less until a later probe; miss: logged below
    }
    const result =
      outcome.results.find((candidate) => {
        const bbox = parseForwardBoundingBox(candidate.boundingBox);
        // Wrap-aware (bug fixed 2026-07-26): the raw min/max comparison this
        // replaces silently rejected EVERY candidate whose bbox crosses the
        // antimeridian (minLng > maxLng), leaving such nodes permanently
        // bbox-less. bboxContainsPoint judges by lng ARCS.
        return bbox !== null && bboxContainsPoint(bbox, anchor);
      }) ?? null;
    if (!result) {
      this.logger.warn(
        `forwardGeocode: no anchor-containing candidate for ${node.providerLevelCode} "${node.name}" (${outcome.results.length} candidates) — node stays bbox-less`,
      );
      return null;
    }
    return {
      bbox: parseForwardBoundingBox(result.boundingBox),
      centroid:
        result.position?.lat !== undefined && result.position?.lon !== undefined
          ? { lat: result.position.lat, lng: result.position.lon }
          : null,
      providerPlaceId: result.dataSources?.geometry?.id?.trim() || null,
    };
  }

  // resolveGeometryId / geometryIdAtPoint DELETED (dockets #1 + #4,
  // 2026-07-30): the census-GEOID resolve lane — the last name-identity
  // organ. Its only caller died when promotion stopped needing it (every
  // place carries its geometry id from birth, composite (id, level) unique).

  /**
   * The one governed forward-geocode call — single caller (the probe's bbox
   * fill; the drain-side geometry-id resolver is deleted, dockets #1/#4).
   * Query = "name, subdivisionCode" (the county qualifier died with the
   * county column); candidates are validated downstream by ANCHOR
   * CONTAINMENT, which is stronger than any name qualifier.
   * `denied` = pool not-now; `miss` = admitted but wrong-entity/no result —
   * a wrong-entity or wrong-country match must not donate its answer to this
   * identity (§1's merge would widen a place with foreign geometry it can
   * never shed — bboxes only ever grow).
   */
  private async forwardGeocodeMatch(
    node: Pick<
      PlaceSketchNode,
      'name' | 'subdivisionCode' | 'countryCode' | 'providerLevelCode'
    >,
  ): Promise<
    | {
        kind: 'ok';
        results: TomtomGeocodeResult[];
      }
    | { kind: 'denied' | 'miss' }
  > {
    // Docket #4: the county qualifier died with the county column — the
    // caller validates candidates by ANCHOR CONTAINMENT, which is stronger
    // than any name qualifier.
    const query = encodeURIComponent(
      [node.name, node.subdivisionCode]
        .filter((part): part is string => Boolean(part))
        .join(', '),
    );
    const url = `${this.geocodeBaseUrl}/${query}.json`;
    let response: AxiosResponse<TomtomGeocodeResponse> | null;
    try {
      response = await this.governance.draw(
        'tomtom.geocode',
        'chain-probe',
        () =>
          firstValueFrom(
            this.httpService.get<TomtomGeocodeResponse>(url, {
              params: {
                key: this.apiKey as string,
                entityTypeSet: node.providerLevelCode,
                countrySet: node.countryCode,
                limit: FORWARD_GEOCODE_CANDIDATE_LIMIT,
              },
              timeout: this.timeoutMs,
            }),
          ),
        { onDrawConsumed: () => this.recordDraw('geocode') },
      );
    } catch (error) {
      if (this.poisonPoolOn429(error, 'tomtom.geocode')) {
        return { kind: 'denied' }; // transient — NOT an attempt (wave-6 item 2)
      }
      throw error;
    }
    if (!response) {
      return { kind: 'denied' };
    }
    const results = (response.data?.results ?? []).filter(
      (candidate) =>
        candidate.entityType === node.providerLevelCode &&
        candidate.address?.countryCode?.toUpperCase() === node.countryCode,
    );
    if (results.length === 0) {
      this.logger.debug(
        `forward geocode mismatch for ${node.providerLevelCode} "${node.name}" — skipping`,
      );
      return { kind: 'miss' };
    }
    return { kind: 'ok', results };
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
    try {
      await this.governance.assertTomtomSpendOpen();
    } catch {
      return { kind: 'denied' };
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
      return { kind: 'failed', reason: describeTransportFault(error) };
    }
    if (!response) {
      return { kind: 'denied' };
    }
    if (!Array.isArray(response.data?.additionalData)) {
      // 200 with a body that is not the contract (an HTML error page from a
      // proxy, `{}`, null). NOT a miss: the vendor never answered the
      // question.
      return { kind: 'failed', reason: 'tomtom_body_shape' };
    }
    const items = response.data.additionalData;
    const item = items.find(
      (entry) => (entry.providerID ?? entry.providerId) === geometryId,
    );
    if (!item) {
      // The vendor did not echo the id we asked about — a wrong-entity
      // answer, not evidence that no polygon exists.
      return { kind: 'failed', reason: 'tomtom_geometry_id_not_echoed' };
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
      return { kind: 'failed', reason: 'tomtom_geometry_payload_shape' };
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
   * Does the catalog already hold ground for this identity tuple? Asked BY
   * ENTITY — the composite (id, level) — never by name (THE FINAL
   * DISSOLUTION; the county-axis sibling logic this once described is
   * deleted).
   */
  private async catalogKnowsBbox(node: PlaceSketchNode): Promise<boolean> {
    // FINAL DISSOLUTION (2026-07-30): "knows the extent" is asked BY ENTITY —
    // the composite (id, level) — never by name. Chain nodes here always
    // carry the id (it rides every reverse-geocode response); a node without
    // one gets the forward geocode spent on it, which is the honest posture.
    if (!node.providerPlaceId) return false;
    const [hit] = await this.prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM places p
        JOIN place_geometries g ON g.place_id = p.place_id
        WHERE p.provider_place_id = ${node.providerPlaceId}
          AND p.provider_level_code = ${node.providerLevelCode}
      ) AS ok`;
    return hit?.ok === true;
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

/** Reverse-shape bbox: {northEast,southWest} as "lat,lng" strings. */
function parseReverseBoundingBox(
  box: TomtomAddress['boundingBox'],
): GeoBbox | null {
  const ne = parseLatLngString(box?.northEast);
  const sw = parseLatLngString(box?.southWest);
  if (!ne || !sw) {
    return null;
  }
  return {
    minLat: Math.min(ne.lat, sw.lat),
    minLng: Math.min(ne.lng, sw.lng),
    maxLat: Math.max(ne.lat, sw.lat),
    maxLng: Math.max(ne.lng, sw.lng),
  };
}

/** Forward-shape bbox: {topLeftPoint,btmRightPoint} as {lat,lon} objects. */
function parseForwardBoundingBox(
  box: TomtomGeocodeResult['boundingBox'],
): GeoBbox | null {
  const tl = box?.topLeftPoint;
  const br = box?.btmRightPoint;
  if (
    tl?.lat === undefined ||
    tl?.lon === undefined ||
    br?.lat === undefined ||
    br?.lon === undefined
  ) {
    return null;
  }
  return {
    minLat: Math.min(tl.lat, br.lat),
    minLng: Math.min(tl.lon, br.lon),
    maxLat: Math.max(tl.lat, br.lat),
    maxLng: Math.max(tl.lon, br.lon),
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
