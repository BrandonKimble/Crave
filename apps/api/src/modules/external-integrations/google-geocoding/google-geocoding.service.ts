import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { LoggerService } from '../../../shared';
import { RateLimitCoordinatorService } from '../shared/rate-limit-coordinator.service';
import { ExternalApiService } from '../shared/external-integrations.types';

type GoogleGeocodeAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeGeometry = {
  location?: { lat: number; lng: number };
  viewport?: {
    northeast?: { lat: number; lng: number };
    southwest?: { lat: number; lng: number };
  };
  bounds?: {
    northeast?: { lat: number; lng: number };
    southwest?: { lat: number; lng: number };
  };
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  types?: string[];
  address_components?: GoogleGeocodeAddressComponent[];
  geometry?: GoogleGeocodeGeometry;
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

export type ReverseGeocodeMatch = {
  formattedAddress: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  viewport: {
    northEast: { lat: number; lng: number } | null;
    southWest: { lat: number; lng: number } | null;
  } | null;
};

@Injectable()
export class GoogleGeocodingService {
  private readonly logger: LoggerService;
  private readonly baseUrl =
    'https://maps.googleapis.com/maps/api/geocode/json';
  private readonly requestTimeout: number;

  constructor(
    loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimitCoordinator: RateLimitCoordinatorService,
  ) {
    this.logger = loggerService.setContext('GoogleGeocodingService');
    this.requestTimeout =
      Number(this.configService.get('googlePlaces.timeout')) || 10000;
  }

  async reverseGeocode(params: {
    lat: number;
    lng: number;
  }): Promise<ReverseGeocodeMatch | null> {
    const apiKey = this.configService.get<string>('googlePlaces.apiKey');
    if (!apiKey) {
      this.logger.warn('Google geocoding API key is not configured');
      return null;
    }

    const rateLimit = this.rateLimitCoordinator.requestPermission({
      service: ExternalApiService.GOOGLE_PLACES,
      operation: 'geocode',
    });
    if (!rateLimit.allowed) {
      this.logger.warn('Google geocoding rate limit reached');
      return null;
    }

    const requestStart = Date.now();
    const latlng = `${params.lat},${params.lng}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<GoogleGeocodeResponse>(this.baseUrl, {
          params: {
            latlng,
            key: apiKey,
          },
          timeout: this.requestTimeout,
        }),
      );

      const duration = Date.now() - requestStart;
      const data = response.data;
      const results = Array.isArray(data?.results) ? data.results : [];
      if (!results.length) {
        this.logger.debug('No geocoding results', { latlng, duration });
        return null;
      }

      const best = this.pickBestResult(results);
      if (!best) {
        return null;
      }

      const address = this.extractAddressParts(best.address_components ?? []);
      const viewport = this.extractViewport(best.geometry);

      return {
        formattedAddress: best.formatted_address ?? null,
        locality: address.locality,
        region: address.region,
        country: address.country,
        viewport,
      };
    } catch (error) {
      const duration = Date.now() - requestStart;
      this.logger.warn('Google geocoding failed', {
        latlng,
        duration,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return null;
    }
  }

  private pickBestResult(
    results: GoogleGeocodeResult[],
  ): GoogleGeocodeResult | null {
    const locality = results.find((result) =>
      result.types?.includes('locality'),
    );
    if (locality) {
      return locality;
    }
    const postalTown = results.find((result) =>
      result.types?.includes('postal_town'),
    );
    if (postalTown) {
      return postalTown;
    }
    const adminLevel2 = results.find((result) =>
      result.types?.includes('administrative_area_level_2'),
    );
    if (adminLevel2) {
      return adminLevel2;
    }
    return results[0] ?? null;
  }

  private extractAddressParts(components: GoogleGeocodeAddressComponent[]) {
    const findComponent = (type: string): string | null => {
      const match = components.find((component) =>
        component.types?.includes(type),
      );
      if (!match) {
        return null;
      }
      return match.short_name || match.long_name || null;
    };

    const locality =
      findComponent('locality') ||
      findComponent('postal_town') ||
      findComponent('sublocality') ||
      findComponent('sublocality_level_1');
    const region = findComponent('administrative_area_level_1');
    const country = findComponent('country');

    return {
      locality,
      region,
      country,
    };
  }

  private extractViewport(
    geometry: GoogleGeocodeGeometry | undefined,
  ): ReverseGeocodeMatch['viewport'] {
    if (!geometry) {
      return null;
    }
    const viewport = geometry.viewport ?? geometry.bounds ?? null;
    if (!viewport) {
      return null;
    }

    const northEast = viewport.northeast ?? null;
    const southWest = viewport.southwest ?? null;

    if (!northEast || !southWest) {
      return null;
    }

    return {
      northEast: { lat: northEast.lat, lng: northEast.lng },
      southWest: { lat: southWest.lat, lng: southWest.lng },
    };
  }
}
