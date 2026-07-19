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
 *  - probedBbox = anchor ± the vendor's default reverse-geocode radius
 *    (100 m — vendor fact), converted to degrees at the anchor's latitude:
 *    the region this probe actually speaks for when it says "no place here".
 */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { GovernanceService } from '../external-integrations/governance/governance.service';
import { GeoBbox, GeoPoint, normalizePlaceName } from './place-geo';
import { PlaceSketchNode } from './places-catalog.service';
import {
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

/** Vendor fact: reverse geocode's default search radius is 100 meters. */
const REVERSE_GEOCODE_RADIUS_METERS = 100;
/** WGS-84 meters per degree of latitude (definitional constant). */
const METERS_PER_DEGREE_LAT = 111_320;

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

@Injectable()
export class TomtomChainProbeAdapter implements TomtomChainProbe {
  private readonly logger: LoggerService;
  private readonly apiKey: string | undefined;
  private readonly reverseBaseUrl: string;
  private readonly geocodeBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
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
    this.timeoutMs =
      Number(configService.get<number>('tomtom.timeout')) || 10000;
  }

  async probe(anchor: GeoPoint): Promise<TomtomChainProbeResult> {
    const probedBbox = this.probedBboxAround(anchor);
    if (!this.apiKey) {
      // Config absence is an operational fault, not a "no place here"
      // observation — throw so the reconciler logs it and does NOT write a
      // negative observation over ground it never actually probed.
      throw new Error('tomtom_config_missing');
    }

    const entry = await this.reverseGeocode(anchor);
    if (!entry?.address) {
      // Vendor says nothing lives here — a first-class §2 observation.
      return { chain: [], probedBbox };
    }

    const address = entry.address;
    const countryCode = address.countryCode?.trim().toUpperCase();
    if (!countryCode) {
      return { chain: [], probedBbox };
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
        provider: 'tomtom',
      });
    }
    if (chain.length === 0) {
      return { chain: [], probedBbox };
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
      const resolved = await this.forwardGeocode(node);
      if (resolved) {
        node.bbox = resolved.bbox;
        node.centroid = resolved.centroid;
        node.providerPlaceId = node.providerPlaceId ?? resolved.providerPlaceId;
      }
    }

    return { chain, probedBbox };
  }

  /** One governed reverse geocode; a pool denial reads as "no answer now". */
  private async reverseGeocode(
    anchor: GeoPoint,
  ): Promise<TomtomReverseAddressEntry | null> {
    const url = `${this.reverseBaseUrl}/${anchor.lat},${anchor.lng}.json`;
    const response = await this.governance.draw(
      'tomtom.cheapGeocode',
      'chain-probe',
      () =>
        firstValueFrom(
          this.httpService.get<TomtomReverseResponse>(url, {
            params: {
              key: this.apiKey as string,
              entityType: LEVEL_LADDER.map((rung) => rung.levelCode).join(','),
            },
            timeout: this.timeoutMs,
          }),
        ),
    );
    if (!response) {
      // Typed not-now: the probe simply doesn't happen this cycle. Signal it
      // as an operational miss (throw) so the reconciler does NOT record a
      // negative observation — the ground was never asked.
      throw new Error('tomtom_pool_denied');
    }
    const entries = Array.isArray(response.data?.addresses)
      ? response.data.addresses
      : [];
    return entries[0] ?? null;
  }

  /** Governed forward geocode of one chain node; null on any miss. */
  private async forwardGeocode(node: PlaceSketchNode): Promise<{
    bbox: GeoBbox | null;
    centroid: GeoPoint | null;
    providerPlaceId: string | null;
  } | null> {
    const query = encodeURIComponent(
      node.subdivisionCode
        ? `${node.name}, ${node.subdivisionCode}`
        : node.name,
    );
    const url = `${this.geocodeBaseUrl}/${query}.json`;
    const response = await this.governance.draw(
      'tomtom.cheapGeocode',
      'chain-probe',
      () =>
        firstValueFrom(
          this.httpService.get<TomtomGeocodeResponse>(url, {
            params: {
              key: this.apiKey as string,
              entityTypeSet: node.providerLevelCode,
              countrySet: node.countryCode,
              limit: 1,
            },
            timeout: this.timeoutMs,
          }),
        ),
    );
    if (!response) {
      return null; // pool denial: this node stays bbox-less until a later probe
    }
    const result = response.data?.results?.[0];
    if (
      !result ||
      result.entityType !== node.providerLevelCode ||
      result.address?.countryCode?.toUpperCase() !== node.countryCode
    ) {
      // A wrong-entity or wrong-country match must not donate its bbox to
      // this identity — §1's merge would then widen a place with foreign
      // geometry it can never shed (bboxes only ever grow).
      this.logger.debug(
        `forward geocode mismatch for ${node.providerLevelCode} "${node.name}" — skipping bbox`,
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

  /** Does the catalog already hold a bbox for this identity tuple? */
  private async catalogKnowsBbox(node: PlaceSketchNode): Promise<boolean> {
    const existing = await this.prisma.place.findFirst({
      where: {
        countryCode: node.countryCode,
        subdivisionCode: node.subdivisionCode ?? null,
        providerLevelCode: node.providerLevelCode,
        name: { equals: normalizePlaceName(node.name), mode: 'insensitive' },
      },
      select: { bboxMinLat: true },
    });
    return existing?.bboxMinLat != null;
  }

  /** anchor ± the vendor's 100 m default radius, in degrees at that latitude. */
  private probedBboxAround(anchor: GeoPoint): GeoBbox {
    const dLat = REVERSE_GEOCODE_RADIUS_METERS / METERS_PER_DEGREE_LAT;
    const cosLat = Math.max(
      Math.cos((anchor.lat * Math.PI) / 180),
      // Degenerate-at-poles guard: never divide by ~0; the bbox just widens.
      0.01,
    );
    const dLng = dLat / cosLat;
    return {
      minLat: anchor.lat - dLat,
      minLng: anchor.lng - dLng,
      maxLat: anchor.lat + dLat,
      maxLng: anchor.lng + dLng,
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
