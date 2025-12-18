import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { LoggerService } from '../../../shared';
import { RateLimitCoordinatorService } from '../shared/rate-limit-coordinator.service';
import { ExternalApiService } from '../shared/external-integrations.types';

const DEFAULT_PLACE_DETAILS_FIELD_MASK_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'internationalPhoneNumber',
  'regularOpeningHours',
  'currentOpeningHours',
  'utcOffsetMinutes',
  'businessStatus',
  'types',
  'websiteUri',
  'nationalPhoneNumber',
  'priceLevel',
  'priceRange',
  'allowsDogs',
  'curbsidePickup',
  'delivery',
  'dineIn',
  'goodForChildren',
  'goodForGroups',
  'goodForWatchingSports',
  'liveMusic',
  'outdoorSeating',
  'servesBeer',
  'servesBreakfast',
  'servesBrunch',
  'servesCocktails',
  'servesCoffee',
  'servesDinner',
  'servesDessert',
  'servesLunch',
  'servesVegetarianFood',
  'servesWine',
  'takeout',
];

const DEFAULT_TEXT_SEARCH_FIELD_MASK_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
];

const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,' +
  'suggestions.placePrediction.structuredFormat.mainText.text,' +
  'suggestions.placePrediction.structuredFormat.secondaryText.text,' +
  'suggestions.placePrediction.types,' +
  'suggestions.placePrediction.distanceMeters';

type PlacesNewErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

export interface GooglePlaceDetailsOptions {
  fields?: string[];
  language?: string;
  region?: string;
  sessionToken?: string;
  includeRaw?: boolean;
}

export interface GooglePlacesV1AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface GooglePlacesV1Place {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: GooglePlacesV1AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  businessStatus?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  priceLevel?: string;
  priceRange?: unknown;
  utcOffsetMinutes?: number;
  regularOpeningHours?: Record<string, unknown>;
  currentOpeningHours?: Record<string, unknown>;
  allowsDogs?: boolean;
  curbsidePickup?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  liveMusic?: boolean;
  outdoorSeating?: boolean;
  takeout?: boolean;
  servesBeer?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesCocktails?: boolean;
  servesCoffee?: boolean;
  servesDinner?: boolean;
  servesDessert?: boolean;
  servesLunch?: boolean;
  servesVegetarianFood?: boolean;
  servesWine?: boolean;
  [key: string]: unknown;
}

export interface GooglePlacesV1PlaceDetailsResponse {
  place: GooglePlacesV1Place;
  raw?: unknown;
  metadata: {
    fieldMask: string;
    requestDurationMs: number;
  };
}

export interface GooglePlacesV1PlacePrediction {
  placeId?: string;
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
  types?: string[];
  distanceMeters?: number;
  [key: string]: unknown;
}

export interface GooglePlacesV1AutocompleteSuggestion {
  placePrediction?: GooglePlacesV1PlacePrediction;
  [key: string]: unknown;
}

export interface GooglePlacesV1AutocompleteResponse {
  suggestions: GooglePlacesV1AutocompleteSuggestion[];
  raw?: unknown;
  metadata: {
    fieldMask: string;
    requestDurationMs: number;
    locationBiasApplied: boolean;
    suggestionCount: number;
  };
}

export interface GooglePlaceAutocompleteOptions {
  language?: string;
  sessionToken?: string;
  components?: {
    country?: string;
  };
  locationBias?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
  types?: string;
  includeRaw?: boolean;
}

export interface GoogleFindPlaceOptions {
  fields?: string[];
  language?: string;
  sessionToken?: string;
  includeRaw?: boolean;
  locationBias?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
}

export interface GooglePlacesV1TextSearchResponse {
  places: GooglePlacesV1Place[];
  nextPageToken?: string;
  raw?: unknown;
  metadata: {
    fieldMask: string;
    requestDurationMs: number;
    locationBiasApplied: boolean;
    placeCount: number;
  };
}

@Injectable()
export class GooglePlacesService {
  private readonly logger: LoggerService;
  private readonly baseUrl = 'https://places.googleapis.com/v1';
  private readonly requestTimeout: number;
  private readonly defaultRadiusMeters: number;

  constructor(
    loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimitCoordinator: RateLimitCoordinatorService,
  ) {
    this.logger = loggerService.setContext('GooglePlacesService');
    this.requestTimeout =
      Number(this.configService.get('googlePlaces.timeout')) || 10000;
    this.defaultRadiusMeters = Math.max(
      1,
      Math.min(
        Number(this.configService.get('googlePlaces.defaultRadius')) || 5000,
        50000,
      ),
    );
  }

  async getPlaceDetails(
    placeId: string,
    options: GooglePlaceDetailsOptions = {},
  ): Promise<GooglePlacesV1PlaceDetailsResponse> {
    const apiKey = this.configService.get<string>('googlePlaces.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Places API key is not configured',
      );
    }

    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }

    const fieldMaskFields = this.resolvePlaceDetailsFieldMaskFields(
      options.fields,
    );
    const fieldMask = fieldMaskFields.join(',');

    const rateLimit = this.rateLimitCoordinator.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'placeDetails',
    });

    if (!rateLimit.allowed) {
      throw this.buildTooManyRequestsError(
        'Google Places rate limit reached. Try again shortly.',
      );
    }

    const params: Record<string, string> = {};
    if (options.language) {
      params.languageCode = options.language;
    }
    if (options.region) {
      params.regionCode = options.region;
    }
    if (options.sessionToken) {
      params.sessionToken = options.sessionToken;
    }

    const requestStart = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${this.baseUrl}/places/${encodeURIComponent(placeId)}`,
          {
            params,
            timeout: this.requestTimeout,
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': fieldMask,
            },
          },
        ),
      );

      const duration = Date.now() - requestStart;
      const place = response.data;

      if (!place || typeof place !== 'object') {
        throw new InternalServerErrorException(
          'Google Places response invalid',
        );
      }

      this.logger.debug('Retrieved Google Place details (New)', {
        placeId,
        duration,
      });
      return {
        place: place as GooglePlacesV1Place,
        raw: options.includeRaw ? place : undefined,
        metadata: {
          fieldMask,
          requestDurationMs: duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - requestStart;
      const axiosError = error as AxiosError<PlacesNewErrorResponse>;
      const message =
        axiosError.response?.data?.error?.message || axiosError.message;

      this.logger.error('Failed to retrieve Google Place details', {
        placeId,
        message,
        duration,
      });

      if (
        axiosError.response?.status === 429 ||
        axiosError.response?.data?.error?.code === 429
      ) {
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.GOOGLE_PLACES,
          60,
          'placeDetails',
        );
        throw this.buildTooManyRequestsError(
          'Google Places rate limit exceeded',
        );
      }

      if (axiosError.response?.status === 400) {
        throw new BadRequestException(message);
      }

      if (axiosError.response?.status === 404) {
        throw new NotFoundException(message || 'Place not found');
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to fetch Google Place');
    }
  }

  async autocompletePlace(
    input: string,
    options: GooglePlaceAutocompleteOptions = {},
  ): Promise<GooglePlacesV1AutocompleteResponse> {
    const apiKey = this.configService.get<string>('googlePlaces.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Places API key is not configured',
      );
    }

    const trimmedInput = input?.trim();
    if (!trimmedInput) {
      throw new BadRequestException('input is required for autocomplete');
    }

    const rateLimit = this.rateLimitCoordinator.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'placeAutocomplete',
    });

    if (!rateLimit.allowed) {
      throw this.buildTooManyRequestsError(
        'Google Places rate limit reached. Try again shortly.',
      );
    }

    const payload: Record<string, unknown> = {
      input: trimmedInput,
      languageCode: options.language || 'en',
    };

    if (options.sessionToken) {
      payload.sessionToken = options.sessionToken;
    }

    if (options.components?.country) {
      const code = options.components.country.trim().toUpperCase();
      if (code) {
        payload.includedRegionCodes = [code];
        payload.regionCode = code;
      }
    }

    if (options.types) {
      const raw = options.types.trim();
      if (raw) {
        const types = raw
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        if (types.length > 0) {
          payload.includedPrimaryTypes = types;
        }
      }
    }

    if (options.locationBias) {
      const { lat, lng, radiusMeters } = options.locationBias;
      if (
        typeof lat === 'number' &&
        Number.isFinite(lat) &&
        typeof lng === 'number' &&
        Number.isFinite(lng)
      ) {
        const radius =
          typeof radiusMeters === 'number' && Number.isFinite(radiusMeters)
            ? Math.max(1, Math.min(Math.trunc(radiusMeters), 50000))
            : this.defaultRadiusMeters;
        payload.locationBias = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        };
        payload.origin = { latitude: lat, longitude: lng };
      }
    }

    const requestStart = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post<Record<string, unknown>>(
          `${this.baseUrl}/places:autocomplete`,
          payload,
          {
            timeout: this.requestTimeout,
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
            },
          },
        ),
      );

      const duration = Date.now() - requestStart;
      const data = response.data as {
        suggestions?: GooglePlacesV1AutocompleteSuggestion[];
      };
      const suggestions = Array.isArray(data?.suggestions)
        ? data.suggestions
        : [];

      this.logger.debug('Retrieved Google Places autocomplete results (New)', {
        input: trimmedInput,
        suggestionCount: suggestions.length,
        duration,
      });

      return {
        suggestions,
        raw: options.includeRaw ? data : undefined,
        metadata: {
          fieldMask: AUTOCOMPLETE_FIELD_MASK,
          requestDurationMs: duration,
          locationBiasApplied: Boolean(payload.locationBias),
          suggestionCount: suggestions.length,
        },
      };
    } catch (error) {
      const duration = Date.now() - requestStart;
      const message =
        (error as AxiosError<PlacesNewErrorResponse>)?.response?.data?.error
          ?.message || (error as AxiosError).message;

      this.logger.error('Failed to fetch autocomplete predictions', {
        input: trimmedInput,
        message,
        duration,
      });

      const axiosError = error as AxiosError<PlacesNewErrorResponse>;
      if (
        axiosError.response?.status === 429 ||
        axiosError.response?.data?.error?.code === 429
      ) {
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.GOOGLE_PLACES,
          60,
          'placeAutocomplete',
        );
        throw this.buildTooManyRequestsError(
          'Google Places rate limit exceeded',
        );
      }

      if (axiosError.response?.status === 400) {
        throw new BadRequestException(message);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to fetch Google autocomplete predictions',
      );
    }
  }

  async findPlaceFromText(
    input: string,
    options: GoogleFindPlaceOptions = {},
  ): Promise<GooglePlacesV1TextSearchResponse> {
    const apiKey = this.configService.get<string>('googlePlaces.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Places API key is not configured',
      );
    }

    const trimmedInput = input?.trim();
    if (!trimmedInput) {
      throw new BadRequestException('input is required for find place');
    }

    const rateLimit = this.rateLimitCoordinator.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'findPlaceFromText',
    });

    if (!rateLimit.allowed) {
      throw this.buildTooManyRequestsError(
        'Google Places rate limit reached. Try again shortly.',
      );
    }

    const fieldMaskFields = this.resolveTextSearchFieldMaskFields(
      options.fields,
    );
    const fieldMask = [
      ...fieldMaskFields.map((field) => `places.${field}`),
      'nextPageToken',
    ].join(',');

    const payload: Record<string, unknown> = {
      textQuery: trimmedInput,
      languageCode: options.language || 'en',
    };

    if (options.sessionToken) {
      payload.sessionToken = options.sessionToken;
    }

    if (options.locationBias) {
      const { lat, lng, radiusMeters } = options.locationBias;
      if (
        typeof lat === 'number' &&
        Number.isFinite(lat) &&
        typeof lng === 'number' &&
        Number.isFinite(lng)
      ) {
        const radius =
          typeof radiusMeters === 'number' && Number.isFinite(radiusMeters)
            ? Math.max(1, Math.min(Math.trunc(radiusMeters), 50000))
            : this.defaultRadiusMeters;
        payload.locationBias = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        };
      }
    }

    const requestStart = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post<Record<string, unknown>>(
          `${this.baseUrl}/places:searchText`,
          payload,
          {
            timeout: this.requestTimeout,
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': fieldMask,
            },
          },
        ),
      );

      const duration = Date.now() - requestStart;
      const data = response.data as {
        places?: GooglePlacesV1Place[];
        nextPageToken?: string;
      };
      const places = Array.isArray(data?.places) ? data.places : [];

      this.logger.debug('Retrieved Google Places text search results (New)', {
        input: trimmedInput,
        placeCount: places.length,
        duration,
      });

      return {
        places,
        nextPageToken:
          typeof data.nextPageToken === 'string'
            ? data.nextPageToken
            : undefined,
        raw: options.includeRaw ? data : undefined,
        metadata: {
          fieldMask,
          requestDurationMs: duration,
          locationBiasApplied: Boolean(payload.locationBias),
          placeCount: places.length,
        },
      };
    } catch (error) {
      const duration = Date.now() - requestStart;
      const axiosError = error as AxiosError<PlacesNewErrorResponse>;
      const message =
        axiosError.response?.data?.error?.message || axiosError.message;

      this.logger.error('Failed to fetch Google find place results', {
        input: trimmedInput,
        message,
        duration,
      });

      if (
        axiosError.response?.status === 429 ||
        axiosError.response?.data?.error?.code === 429
      ) {
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.GOOGLE_PLACES,
          60,
          'findPlaceFromText',
        );
        throw this.buildTooManyRequestsError(
          'Google Places rate limit exceeded',
        );
      }

      if (axiosError.response?.status === 400) {
        throw new BadRequestException(message);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to fetch Google find place results',
      );
    }
  }

  private normalizeRequestedFields(fields?: string[]): string[] {
    if (!fields || fields.length === 0) {
      return [];
    }

    const normalized = fields
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    return Array.from(new Set(normalized));
  }

  private resolvePlaceDetailsFieldMaskFields(fields?: string[]): string[] {
    const requested = this.normalizeRequestedFields(fields);
    const unique =
      requested.length > 0
        ? requested
        : DEFAULT_PLACE_DETAILS_FIELD_MASK_FIELDS;
    if (!unique.includes('id')) {
      unique.unshift('id');
    }
    return Array.from(new Set(unique));
  }

  private resolveTextSearchFieldMaskFields(fields?: string[]): string[] {
    const requested = this.normalizeRequestedFields(fields);
    const unique =
      requested.length > 0 ? requested : DEFAULT_TEXT_SEARCH_FIELD_MASK_FIELDS;
    if (!unique.includes('id')) {
      unique.unshift('id');
    }
    return Array.from(new Set(unique));
  }

  private buildTooManyRequestsError(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
