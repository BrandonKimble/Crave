import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@googlemaps/google-maps-services-js';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  GooglePlacesConfig,
  GooglePlacesPerformanceMetrics,
  RestaurantEnrichmentInput,
  EnrichedRestaurantData,
  PlaceSearchResult,
  PlaceSearchOptions,
  GooglePlaceDetails,
  RetryOptions,
} from './google-places.types';
import {
  GooglePlacesAuthenticationError,
  GooglePlacesConfigurationError,
  GooglePlacesRateLimitError,
  GooglePlacesNetworkError,
  GooglePlacesApiError,
  GooglePlacesResponseParsingError,
} from './google-places.exceptions';

@Injectable()
export class GooglePlacesService implements OnModuleInit {
  private logger!: LoggerService;
  private googlePlacesConfig!: GooglePlacesConfig;
  private googleMapsClient!: Client;
  private performanceMetrics: GooglePlacesPerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    totalApiCalls: 0,
    lastReset: new Date(),
    errorCount: 0,
    successRate: 100,
    rateLimitHits: 0,
  };

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    if (this.loggerService) {
      this.logger = this.loggerService.setContext('GooglePlacesService');
    }
    this.googlePlacesConfig = {
      apiKey: this.configService.get<string>('googlePlaces.apiKey') || '',
      timeout: this.configService.get<number>('googlePlaces.timeout') || 10000,
      requestsPerSecond:
        this.configService.get<number>('googlePlaces.requestsPerSecond') || 50,
      defaultRadius:
        this.configService.get<number>('googlePlaces.defaultRadius') || 5000,
      retryOptions: {
        maxRetries:
          this.configService.get<number>(
            'googlePlaces.retryOptions.maxRetries',
          ) || 3,
        retryDelay:
          this.configService.get<number>(
            'googlePlaces.retryOptions.retryDelay',
          ) || 1000,
        retryBackoffFactor:
          this.configService.get<number>(
            'googlePlaces.retryOptions.retryBackoffFactor',
          ) || 2.0,
      },
    };

    this.googleMapsClient = new Client({
      axiosInstance: undefined, // Use default axios
    });

    this.validateConfig();

    this.logger.info('Google Places service initialized', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'module_init',
      provider: 'google-places',
    });
  }

  private validateConfig(): void {
    const missingFields: string[] = [];
    if (!this.googlePlacesConfig.apiKey) {
      missingFields.push('googlePlaces.apiKey');
    }

    if (missingFields.length > 0) {
      throw new GooglePlacesConfigurationError(
        `Missing required Google Places configuration: ${missingFields.join(
          ', ',
        )}`,
      );
    }
  }

  /**
   * Enrich restaurant data with Google Places information
   * Implements PRD Section 9.2.1: Restaurant data enrichment, location services setup
   */
  async enrichRestaurant(
    input: RestaurantEnrichmentInput,
  ): Promise<EnrichedRestaurantData> {
    this.logger.info('Enriching restaurant with Google Places data', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'enrich_restaurant',
      restaurantName: input.name,
      hasExistingPlaceId: !!input.existingPlaceId,
    });

    const startTime = Date.now();

    try {
      // Use existing place ID if available, otherwise search for the place
      let placeId = input.existingPlaceId;
      let apiCallsUsed = 0;

      if (!placeId) {
        const searchResult = await this.searchPlace({
          query: input.name,
          location:
            input.latitude && input.longitude
              ? { latitude: input.latitude, longitude: input.longitude }
              : undefined,
        });
        apiCallsUsed++;

        if (searchResult.length === 0) {
          throw new GooglePlacesResponseParsingError(
            `No results found for restaurant: ${input.name}`,
          );
        }

        // Use the first result (highest confidence)
        placeId = searchResult[0].placeId;
      }

      // Get detailed place information
      const placeDetails = await this.getPlaceDetails(placeId);
      apiCallsUsed++;

      const enrichedData = this.mapPlaceDetailsToEnrichedData(
        placeDetails,
        apiCallsUsed,
      );

      const responseTime = Date.now() - startTime;
      this.recordSuccessMetrics(responseTime, apiCallsUsed);

      this.logger.info('Restaurant enrichment completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'enrich_restaurant',
        responseTime,
        placeId: enrichedData.placeId,
        dataQuality: enrichedData.metadata.dataQuality,
      });

      return enrichedData;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordErrorMetrics(responseTime);

      this.logger.error('Restaurant enrichment failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'enrich_restaurant',
        error: error instanceof Error ? error.message : String(error),
        responseTime,
        restaurantName: input.name,
      });

      throw error;
    }
  }

  /**
   * Search for places using text query
   */
  async searchPlace(options: PlaceSearchOptions): Promise<PlaceSearchResult[]> {
    this.logger.info('Searching for places', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'search_place',
      query: options.query,
      hasLocation: !!options.location,
    });

    try {
      const response = await this.retryOperation(async () => {
        return this.googleMapsClient.textSearch({
          params: {
            query: options.query,
            location: options.location
              ? [options.location.latitude, options.location.longitude]
              : undefined,
            radius: options.radius || this.googlePlacesConfig.defaultRadius,
            region: options.region || 'US',
            key: this.googlePlacesConfig.apiKey,
          },
          timeout: this.googlePlacesConfig.timeout,
        });
      });

      if (
        response.data.status !== ('OK' as any) &&
        response.data.status !== ('ZERO_RESULTS' as any)
      ) {
        throw new GooglePlacesApiError(
          `Google Places search failed: ${response.data.status}`,
          response.status,
          JSON.stringify(response.data),
        );
      }

      const results: PlaceSearchResult[] = response.data.results
        .filter(
          (place) => place.place_id && place.name && place.geometry?.location,
        )
        .map((place, index) => ({
          placeId: place.place_id!,
          name: place.name!,
          latitude: place.geometry!.location.lat,
          longitude: place.geometry!.location.lng,
          address: place.formatted_address!,
          rating: place.rating,
          priceLevel: place.price_level,
          confidence: Math.max(0.1, 1.0 - index * 0.1), // Higher confidence for earlier results
        }));

      this.logger.info('Place search completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'search_place',
        resultsCount: results.length,
        query: options.query,
      });

      return results;
    } catch (error) {
      this.logger.error('Place search failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'search_place',
        error: error instanceof Error ? error.message : String(error),
        query: options.query,
      });

      throw this.handleGooglePlacesError(error);
    }
  }

  /**
   * Get detailed information about a specific place
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    this.logger.info('Getting place details', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'get_place_details',
      placeId,
    });

    try {
      const response = await this.retryOperation(async () => {
        return this.googleMapsClient.placeDetails({
          params: {
            place_id: placeId,
            fields: [
              'place_id',
              'name',
              'formatted_address',
              'geometry/location',
              'formatted_phone_number',
              'website',
              'opening_hours',
              'price_level',
              'rating',
              'user_ratings_total',
              'types',
              'business_status',
            ],
            key: this.googlePlacesConfig.apiKey,
          },
          timeout: this.googlePlacesConfig.timeout,
        });
      });

      if (response.data.status !== ('OK' as any)) {
        throw new GooglePlacesApiError(
          `Google Places details failed: ${response.data.status}`,
          response.status,
          JSON.stringify(response.data),
        );
      }

      this.logger.info('Place details retrieved', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'get_place_details',
        placeId,
        placeName: response.data.result.name,
      });

      return response.data.result as GooglePlaceDetails;
    } catch (error) {
      this.logger.error('Place details retrieval failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'get_place_details',
        error: error instanceof Error ? error.message : String(error),
        placeId,
      });

      throw this.handleGooglePlacesError(error);
    }
  }

  /**
   * Test Google Places API connectivity
   */
  async testConnection(): Promise<{
    status: string;
    message: string;
    details?: any;
  }> {
    try {
      const testInput: RestaurantEnrichmentInput = {
        name: 'Franklin Barbecue Austin',
        latitude: 30.2672,
        longitude: -97.7431,
      };

      await this.enrichRestaurant(testInput);

      return {
        status: 'connected',
        message: 'Google Places connection test passed',
        details: this.performanceMetrics,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'Google Places connection test failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get Google Places configuration (excluding sensitive data)
   */
  getGooglePlacesConfig(): Omit<GooglePlacesConfig, 'apiKey'> {
    return {
      timeout: this.googlePlacesConfig.timeout,
      requestsPerSecond: this.googlePlacesConfig.requestsPerSecond,
      defaultRadius: this.googlePlacesConfig.defaultRadius,
      retryOptions: this.googlePlacesConfig.retryOptions,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): GooglePlacesPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      totalApiCalls: 0,
      lastReset: new Date(),
      errorCount: 0,
      successRate: 100,
      rateLimitHits: 0,
    };
  }

  /**
   * Get service health status
   * Compatible with BaseExternalApiService interface
   */
  getHealthStatus() {
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      this.performanceMetrics.successRate > 80 ? 'healthy' : 'degraded';

    return {
      service: 'google-places',
      status,
      uptime: Date.now() - this.performanceMetrics.lastReset.getTime(),
      metrics: {
        requestCount: this.performanceMetrics.requestCount,
        totalResponseTime: this.performanceMetrics.totalResponseTime,
        averageResponseTime: this.performanceMetrics.averageResponseTime,
        lastReset: this.performanceMetrics.lastReset,
        errorCount: this.performanceMetrics.errorCount,
        successRate: this.performanceMetrics.successRate,
        rateLimitHits: this.performanceMetrics.rateLimitHits,
      },
      configuration: {
        timeout: this.googlePlacesConfig.timeout || 10000,
        retryOptions: this.googlePlacesConfig.retryOptions,
      },
    };
  }

  private mapPlaceDetailsToEnrichedData(
    placeDetails: GooglePlaceDetails,
    apiCallsUsed: number,
  ): EnrichedRestaurantData {
    // Parse opening hours
    const hours: Record<string, string> = {};
    if (placeDetails.opening_hours?.weekday_text) {
      placeDetails.opening_hours.weekday_text.forEach((dayText) => {
        const [day, time] = dayText.split(': ');
        const dayKey = day.toLowerCase();
        hours[dayKey] = time || 'Closed';
      });
    }

    // Determine data quality based on available fields
    let dataQuality: 'complete' | 'partial' | 'basic' = 'basic';
    const requiredFields = [
      placeDetails.formatted_phone_number,
      placeDetails.website,
      placeDetails.opening_hours,
      placeDetails.rating,
    ];
    const availableFields = requiredFields.filter(Boolean).length;

    if (availableFields >= 3) {
      dataQuality = 'complete';
    } else if (availableFields >= 1) {
      dataQuality = 'partial';
    }

    return {
      placeId: placeDetails.place_id,
      name: placeDetails.name,
      latitude: placeDetails.geometry.location.lat,
      longitude: placeDetails.geometry.location.lng,
      address: placeDetails.formatted_address,
      formattedAddress: placeDetails.formatted_address,
      phone: placeDetails.formatted_phone_number,
      website: placeDetails.website,
      hours: Object.keys(hours).length > 0 ? hours : undefined,
      priceLevel: placeDetails.price_level,
      rating: placeDetails.rating,
      totalRatings: placeDetails.user_ratings_total,
      metadata: {
        lastPlacesUpdate: new Date().toISOString(),
        dataQuality,
        confidence:
          dataQuality === 'complete'
            ? 0.9
            : dataQuality === 'partial'
              ? 0.7
              : 0.5,
        apiCallsUsed,
      },
    };
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    const retryOptions = {
      ...this.googlePlacesConfig.retryOptions,
      ...options,
    };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (error instanceof GooglePlacesAuthenticationError) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === retryOptions.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay =
          retryOptions.retryDelay *
          Math.pow(retryOptions.retryBackoffFactor, attempt);

        this.logger.warn('Retrying Google Places operation', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'retry_operation',
          attempt: attempt + 1,
          maxRetries: retryOptions.maxRetries,
          delay,
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'UnknownError',
          },
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Retry operation failed with unknown error');
  }

  private handleGooglePlacesError(error: unknown): Error {
    if (
      error instanceof GooglePlacesAuthenticationError ||
      error instanceof GooglePlacesApiError ||
      error instanceof GooglePlacesNetworkError ||
      error instanceof GooglePlacesRateLimitError
    ) {
      return error;
    }

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    // Reason: Google Maps API error handling requires any for external axios error structure
    const axiosError = error as any;

    if (axiosError.response?.status === 403) {
      return new GooglePlacesAuthenticationError(
        'Invalid Google Places API key',
        JSON.stringify(axiosError.response.data),
      );
    } else if (axiosError.response?.status === 429) {
      this.performanceMetrics.rateLimitHits++;
      return new GooglePlacesRateLimitError(
        parseInt(String(axiosError.response.headers?.['retry-after'] || '60')),
      );
    } else if (
      axiosError.code === 'ENOTFOUND' ||
      axiosError.code === 'ECONNREFUSED' ||
      axiosError.code === 'ETIMEDOUT'
    ) {
      return new GooglePlacesNetworkError(
        'Network error during Google Places API request',
        error as Error,
      );
    } else {
      return new GooglePlacesApiError(
        'Google Places API request failed',
        axiosError.response?.status,
        JSON.stringify(axiosError.response?.data),
      );
    }
  }

  private recordSuccessMetrics(
    responseTime: number,
    apiCallsUsed: number,
  ): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.totalApiCalls += apiCallsUsed;
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }

  private recordErrorMetrics(responseTime: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.errorCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }
}
