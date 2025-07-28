/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-require-imports */
// Reason: Google Maps API mocking requires any for external library testing patterns

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GooglePlacesService } from './google-places.service';
import { LoggerService } from '../../../shared';
import {
  GooglePlacesConfigurationError,
  GooglePlacesAuthenticationError,
  GooglePlacesRateLimitError,
  GooglePlacesNetworkError,
} from './google-places.exceptions';

// Mock the Google Maps client
jest.mock('@googlemaps/google-maps-services-js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    textSearch: jest.fn(),
    placeDetails: jest.fn(),
  })),
}));

describe('GooglePlacesService', () => {
  let service: GooglePlacesService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in test module setup
  let configService: jest.Mocked<ConfigService>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in test module setup
  let loggerService: jest.Mocked<LoggerService>;

  const mockConfig = {
    'googlePlaces.apiKey': 'test-api-key',
    'googlePlaces.timeout': 10000,
    'googlePlaces.requestsPerSecond': 50,
    'googlePlaces.defaultRadius': 5000,
    'googlePlaces.retryOptions.maxRetries': 3,
    'googlePlaces.retryOptions.retryDelay': 1000,
    'googlePlaces.retryOptions.retryBackoffFactor': 2.0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GooglePlacesService>(GooglePlacesService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Configuration Validation', () => {
    it('should throw GooglePlacesConfigurationError when API key is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            GooglePlacesService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => ''), // Return empty string for API key
              },
            },
            {
              provide: LoggerService,
              useValue: {
                setContext: jest.fn().mockReturnThis(),
                info: jest.fn(),
                error: jest.fn(),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow(GooglePlacesConfigurationError);
    });
  });

  describe('enrichRestaurant', () => {
    const mockRestaurantInput = {
      name: 'Franklin Barbecue',
      latitude: 30.2672,
      longitude: -97.7431,
      address: '900 E 11th St, Austin, TX 78702',
    };

    const mockSearchResponse = {
      data: {
        status: 'OK',
        results: [
          {
            place_id: 'ChIJTest123',
            name: 'Franklin Barbecue',
            formatted_address: '900 E 11th St, Austin, TX 78702, USA',
            geometry: {
              location: {
                lat: 30.2672,
                lng: -97.7431,
              },
            },
            rating: 4.6,
            price_level: 2,
          },
        ],
      },
      status: 200,
    };

    const mockDetailsResponse = {
      data: {
        status: 'OK',
        result: {
          place_id: 'ChIJTest123',
          name: 'Franklin Barbecue',
          formatted_address: '900 E 11th St, Austin, TX 78702, USA',
          geometry: {
            location: {
              lat: 30.2672,
              lng: -97.7431,
            },
          },
          formatted_phone_number: '(512) 653-1187',
          website: 'https://franklinbbq.com',
          opening_hours: {
            weekday_text: [
              'Monday: Closed',
              'Tuesday: 11:00 AM – 2:00 PM',
              'Wednesday: 11:00 AM – 2:00 PM',
              'Thursday: 11:00 AM – 2:00 PM',
              'Friday: 11:00 AM – 2:00 PM',
              'Saturday: 11:00 AM – 2:00 PM',
              'Sunday: 11:00 AM – 2:00 PM',
            ],
          },
          price_level: 2,
          rating: 4.6,
          user_ratings_total: 8345,
          types: ['restaurant', 'food', 'establishment'],
          business_status: 'OPERATIONAL',
        },
      },
      status: 200,
    };

    beforeEach(() => {
      // Reset the mock implementation before each test
      const { Client } = require('@googlemaps/google-maps-services-js');
      Client.mockImplementation(() => ({
        textSearch: jest.fn().mockResolvedValue(mockSearchResponse),
        placeDetails: jest.fn().mockResolvedValue(mockDetailsResponse),
      }));

      // Create new service instance with mocked client
      (service as any).googleMapsClient = new Client();
    });

    it('should successfully enrich restaurant with existing place ID', async () => {
      const input = {
        ...mockRestaurantInput,
        existingPlaceId: 'ChIJTest123',
      };

      const result = await service.enrichRestaurant(input);

      expect(result).toEqual({
        placeId: 'ChIJTest123',
        name: 'Franklin Barbecue',
        latitude: 30.2672,
        longitude: -97.7431,
        address: '900 E 11th St, Austin, TX 78702, USA',
        formattedAddress: '900 E 11th St, Austin, TX 78702, USA',
        phone: '(512) 653-1187',
        website: 'https://franklinbbq.com',
        hours: {
          monday: 'Closed',
          tuesday: '11:00 AM – 2:00 PM',
          wednesday: '11:00 AM – 2:00 PM',
          thursday: '11:00 AM – 2:00 PM',
          friday: '11:00 AM – 2:00 PM',
          saturday: '11:00 AM – 2:00 PM',
          sunday: '11:00 AM – 2:00 PM',
        },
        priceLevel: 2,
        rating: 4.6,
        totalRatings: 8345,
        metadata: expect.objectContaining({
          dataQuality: 'complete',
          confidence: 0.9,
          apiCallsUsed: 1,
        }),
      });
    });

    it('should search for place and then get details when no place ID provided', async () => {
      const mockClient = (service as any).googleMapsClient;

      const result = await service.enrichRestaurant(mockRestaurantInput);

      expect(mockClient.textSearch).toHaveBeenCalled();

      expect(mockClient.placeDetails).toHaveBeenCalledWith({
        params: expect.objectContaining({
          place_id: 'ChIJTest123',
        }),
        timeout: 10000,
      });
      expect(result.metadata.apiCallsUsed).toBe(2);
    });

    it('should handle authentication errors', async () => {
      const { Client } = require('@googlemaps/google-maps-services-js');
      const mockClient = new Client();
      mockClient.placeDetails.mockRejectedValue({
        response: { status: 403, data: { error: 'Invalid API key' } },
      });

      (service as any).googleMapsClient = mockClient;

      await expect(
        service.enrichRestaurant({
          ...mockRestaurantInput,
          existingPlaceId: 'ChIJTest123',
        }),
      ).rejects.toThrow(GooglePlacesAuthenticationError);
    });

    it('should handle rate limit errors', async () => {
      const { Client } = require('@googlemaps/google-maps-services-js');
      const mockClient = new Client();
      mockClient.placeDetails.mockRejectedValue({
        response: {
          status: 429,
          data: { error: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' },
        },
      });

      (service as any).googleMapsClient = mockClient;

      await expect(
        service.enrichRestaurant({
          ...mockRestaurantInput,
          existingPlaceId: 'ChIJTest123',
        }),
      ).rejects.toThrow(GooglePlacesRateLimitError);
    });

    it('should handle network errors', async () => {
      const { Client } = require('@googlemaps/google-maps-services-js');
      const mockClient = new Client();
      mockClient.placeDetails.mockRejectedValue({
        code: 'ENOTFOUND',
        message: 'Network error',
      });

      (service as any).googleMapsClient = mockClient;

      await expect(
        service.enrichRestaurant({
          ...mockRestaurantInput,
          existingPlaceId: 'ChIJTest123',
        }),
      ).rejects.toThrow(GooglePlacesNetworkError);
    });
  });

  describe('testConnection', () => {
    it('should pass connection test with valid configuration', async () => {
      const mockClient = (service as any).googleMapsClient;
      mockClient.textSearch.mockResolvedValue({
        data: {
          status: 'OK',
          results: [
            {
              place_id: 'test',
              name: 'Test Place',
              formatted_address: 'Test Address',
              geometry: { location: { lat: 0, lng: 0 } },
            },
          ],
        },
      });
      mockClient.placeDetails.mockResolvedValue({
        data: {
          status: 'OK',
          result: {
            place_id: 'test',
            name: 'Test Place',
            formatted_address: 'Test Address',
            geometry: { location: { lat: 0, lng: 0 } },
          },
        },
      });

      const result = await service.testConnection();

      expect(result.status).toBe('connected');
      expect(result.message).toBe('Google Places connection test passed');
    });

    it('should fail connection test with invalid configuration', async () => {
      const { Client } = require('@googlemaps/google-maps-services-js');
      const mockClient = new Client();
      mockClient.textSearch.mockRejectedValue(new Error('Invalid API key'));

      (service as any).googleMapsClient = mockClient;

      const result = await service.testConnection();

      expect(result.status).toBe('failed');
      expect(result.message).toBe('Google Places connection test failed');
    });
  });

  describe('Performance Metrics', () => {
    it('should track and reset performance metrics', () => {
      const initialMetrics = service.getPerformanceMetrics();
      expect(initialMetrics.requestCount).toBe(0);

      service.resetPerformanceMetrics();
      const resetMetrics = service.getPerformanceMetrics();
      expect(resetMetrics.requestCount).toBe(0);
      expect(resetMetrics.lastReset).toBeInstanceOf(Date);
    });

    it('should return config without sensitive data', () => {
      const config = service.getGooglePlacesConfig();
      expect(config).not.toHaveProperty('apiKey');
      expect(config.timeout).toBe(10000);
      expect(config.defaultRadius).toBe(5000);
    });
  });
});
