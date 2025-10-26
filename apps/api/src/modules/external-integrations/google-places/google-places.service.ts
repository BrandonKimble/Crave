import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
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

const DEFAULT_DETAIL_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'address_component',
  'geometry/location',
  'international_phone_number',
  'opening_hours',
  'current_opening_hours',
  'business_status',
  'types',
  'website',
  'formatted_phone_number',
];

export interface GooglePlaceDetailsOptions {
  fields?: string[];
  language?: string;
  region?: string;
  sessionToken?: string;
  includeRaw?: boolean;
}

export interface GooglePlaceDetailsApiResponse {
  status: string;
  result?: GooglePlaceDetailsResult;
  error_message?: string;
  html_attributions?: string[];
}

export interface GooglePlaceDetailsResult {
  place_id: string;
  name?: string;
  formatted_address?: string;
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  types?: string[];
  website?: string;
  international_phone_number?: string;
  formatted_phone_number?: string;
  opening_hours?: Record<string, unknown>;
  current_opening_hours?: Record<string, unknown>;
  utc_offset_minutes?: number;
  business_status?: string;
  [key: string]: unknown;
}

export interface GooglePlaceDetailsResponse {
  status: string;
  result?: GooglePlaceDetailsResult;
  errorMessage?: string;
  raw?: GooglePlaceDetailsApiResponse;
  metadata: {
    fields: string[];
    requestDurationMs: number;
  };
}

export interface GooglePlacePrediction {
  description: string;
  place_id: string;
  reference?: string;
  distance_meters?: number;
  types?: string[];
  matched_substrings?: Array<{ length: number; offset: number }>;
  structured_formatting?: {
    main_text?: string;
    main_text_matched_substrings?: Array<{ length: number; offset: number }>;
    secondary_text?: string;
    secondary_text_matched_substrings?: Array<{
      length: number;
      offset: number;
    }>;
  };
  terms?: Array<{ offset: number; value: string }>;
}

export interface GooglePlaceAutocompleteApiResponse {
  status: string;
  predictions: GooglePlacePrediction[];
  error_message?: string;
  info_messages?: string[];
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

export interface GooglePlaceAutocompleteResponse {
  status: string;
  predictions: GooglePlacePrediction[];
  errorMessage?: string;
  raw?: GooglePlaceAutocompleteApiResponse;
  metadata: {
    requestDurationMs: number;
    locationBiasApplied: boolean;
    predictionCount: number;
  };
}

@Injectable()
export class GooglePlacesService {
  private readonly logger: LoggerService;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
  private readonly requestTimeout: number;

  constructor(
    loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimitCoordinator: RateLimitCoordinatorService,
  ) {
    this.logger = loggerService.setContext('GooglePlacesService');
    this.requestTimeout =
      Number(this.configService.get('GOOGLE_PLACES_TIMEOUT')) || 10000;
  }

  async getPlaceDetails(
    placeId: string,
    options: GooglePlaceDetailsOptions = {},
  ): Promise<GooglePlaceDetailsResponse> {
    const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Places API key is not configured',
      );
    }

    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }

    const fields = this.normalizeFields(options.fields);

    const rateLimit = this.rateLimitCoordinator.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'placeDetails',
    });

    if (!rateLimit.allowed) {
      throw this.buildTooManyRequestsError(
        'Google Places rate limit reached. Try again shortly.',
      );
    }

    const params: Record<string, string> = {
      place_id: placeId,
      key: apiKey,
      fields: fields.join(','),
      language: options.language || 'en',
    };

    if (options.region) {
      params.region = options.region;
    }

    if (options.sessionToken) {
      params.sessiontoken = options.sessionToken;
    }

    const requestStart = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<GooglePlaceDetailsApiResponse>(
          `${this.baseUrl}/details/json`,
          {
            params,
            timeout: this.requestTimeout,
          },
        ),
      );

      const duration = Date.now() - requestStart;
      const data = response.data;

      if (!data) {
        throw new InternalServerErrorException(
          'Google Places response did not contain data',
        );
      }

      if (data.status === 'OK') {
        this.logger.debug('Retrieved Google Place details', {
          placeId,
          duration,
        });

        return {
          status: data.status,
          result: data.result,
          raw: options.includeRaw ? data : undefined,
          metadata: {
            fields,
            requestDurationMs: duration,
          },
        };
      }

      if (data.status === 'OVER_QUERY_LIMIT') {
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.GOOGLE_PLACES,
          60,
          'placeDetails',
        );
        throw this.buildTooManyRequestsError(
          'Google Places rate limit exceeded',
        );
      }

      if (data.status === 'INVALID_REQUEST') {
        throw new BadRequestException(
          data.error_message || 'Invalid Google Places request',
        );
      }

      if (data.status === 'NOT_FOUND') {
        return {
          status: data.status,
          errorMessage: data.error_message || 'Place not found',
          metadata: {
            fields,
            requestDurationMs: duration,
          },
        };
      }

      throw new ServiceUnavailableException(
        data.error_message || `Google Places error: ${data.status}`,
      );
    } catch (error) {
      const duration = Date.now() - requestStart;
      const axiosError = error as AxiosError<GooglePlaceDetailsApiResponse>;
      const status = axiosError.response?.data?.status;
      const message =
        axiosError.response?.data?.error_message || axiosError.message;

      this.logger.error('Failed to retrieve Google Place details', {
        placeId,
        status,
        message,
        duration,
      });

      if (axiosError.response?.status === 429) {
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
        throw new ServiceUnavailableException('Place not found');
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
  ): Promise<GooglePlaceAutocompleteResponse> {
    const apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
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

    const params: Record<string, string> = {
      input: trimmedInput,
      key: apiKey,
      types: options.types || 'establishment',
      language: options.language || 'en',
    };

    if (options.sessionToken) {
      params.sessiontoken = options.sessionToken;
    }

    if (options.components?.country) {
      params.components = `country:${options.components.country}`;
    }

    if (options.locationBias) {
      const { lat, lng, radiusMeters } = options.locationBias;
      if (
        typeof lat === 'number' &&
        Number.isFinite(lat) &&
        typeof lng === 'number' &&
        Number.isFinite(lng)
      ) {
        if (typeof radiusMeters === 'number' && Number.isFinite(radiusMeters)) {
          const radius = Math.max(1, Math.min(Math.trunc(radiusMeters), 50000));
          params.locationbias = `circle:${radius}@${lat},${lng}`;
        } else {
          params.locationbias = `point:${lat},${lng}`;
        }
      }
    }

    const requestStart = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<GooglePlaceAutocompleteApiResponse>(
          `${this.baseUrl}/autocomplete/json`,
          {
            params,
            timeout: this.requestTimeout,
          },
        ),
      );

      const duration = Date.now() - requestStart;
      const data = response.data;

      if (!data) {
        throw new InternalServerErrorException(
          'Google Places autocomplete response missing data',
        );
      }

      if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
        this.logger.debug('Retrieved Google Places autocomplete results', {
          input: trimmedInput,
          predictionCount: data.predictions.length,
          duration,
        });

        return {
          status: data.status,
          predictions: data.predictions,
          raw: options.includeRaw ? data : undefined,
          metadata: {
            requestDurationMs: duration,
            locationBiasApplied: Boolean(params.locationbias),
            predictionCount: data.predictions.length,
          },
        };
      }

      if (data.status === 'OVER_QUERY_LIMIT') {
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.GOOGLE_PLACES,
          60,
          'placeAutocomplete',
        );
        throw this.buildTooManyRequestsError(
          'Google Places rate limit exceeded',
        );
      }

      if (data.status === 'INVALID_REQUEST' || data.status === 'REQUEST_DENIED') {
        throw new BadRequestException(
          data.error_message || 'Invalid autocomplete request',
        );
      }

      throw new ServiceUnavailableException(
        data.error_message || `Google Places error: ${data.status}`,
      );
    } catch (error) {
      const duration = Date.now() - requestStart;
      const axiosError = error as AxiosError<GooglePlaceAutocompleteApiResponse>;
      const status = axiosError.response?.data?.status;
      const message =
        axiosError.response?.data?.error_message || axiosError.message;

      this.logger.error('Failed to fetch autocomplete predictions', {
        input: trimmedInput,
        status,
        message,
        duration,
      });

      if (axiosError.response?.status === 429) {
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

  private normalizeFields(fields?: string[]): string[] {
    if (!fields || fields.length === 0) {
      return DEFAULT_DETAIL_FIELDS;
    }

    const normalized = fields
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    return normalized.length > 0 ? normalized : DEFAULT_DETAIL_FIELDS;
  }

  private buildTooManyRequestsError(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
