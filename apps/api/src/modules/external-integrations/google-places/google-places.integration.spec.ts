/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-return */

// Reason: Google Maps API mocking requires any for external library testing patterns

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GooglePlacesService } from './google-places.service';
import { RestaurantEnrichmentService } from './restaurant-enrichment.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService } from '../../../shared';
import { Entity, EntityType, Prisma } from '@prisma/client';

/**
 * Integration tests for Google Places service
 * Tests the complete integration with external Google Places API
 *
 * Note: These tests require a valid Google Places API key in environment
 * Set GOOGLE_PLACES_API_KEY in .env.test for full integration testing
 */
describe('GooglePlacesService Integration Tests', () => {
  let googlePlacesService: GooglePlacesService;
  let restaurantEnrichmentService: RestaurantEnrichmentService;
  let entityRepository: jest.Mocked<EntityRepository>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in test module setup
  let configService: ConfigService;

  const hasApiKey = !!process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesService,
        RestaurantEnrichmentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'googlePlaces.apiKey':
                  process.env.GOOGLE_PLACES_API_KEY || 'test-key',
                'googlePlaces.timeout': 10000,
                'googlePlaces.requestsPerSecond': 50,
                'googlePlaces.defaultRadius': 5000,
                'googlePlaces.retryOptions.maxRetries': 3,
                'googlePlaces.retryOptions.retryDelay': 1000,
                'googlePlaces.retryOptions.retryBackoffFactor': 2.0,
              };
              return config[key];
            }),
          },
        },
        {
          provide: EntityRepository,
          useValue: {
            createRestaurant: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
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

    googlePlacesService = module.get<GooglePlacesService>(GooglePlacesService);
    restaurantEnrichmentService = module.get<RestaurantEnrichmentService>(
      RestaurantEnrichmentService,
    );
    entityRepository = module.get(EntityRepository);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Google Places API Integration', () => {
    it('should connect to Google Places API and test connectivity', async () => {
      if (!hasApiKey) {
        console.log(
          'Skipping Google Places integration test - no API key provided',
        );
        expect(true).toBe(true);
        return;
      }

      const result = await googlePlacesService.testConnection();
      expect(result.status).toBe('connected');
      expect(result.message).toBe('Google Places connection test passed');
    }, 15000);

    it('should search for a real restaurant and return results', async () => {
      if (!hasApiKey) {
        console.log('Skipping Google Places search test - no API key provided');
        expect(true).toBe(true);
        return;
      }

      const searchResults = await googlePlacesService.searchPlace({
        query: 'Franklin Barbecue Austin Texas',
        location: {
          latitude: 30.2672,
          longitude: -97.7431,
        },
        radius: 1000,
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]).toMatchObject({
        placeId: expect.any(String),
        name: expect.stringContaining('Franklin'),
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        address: expect.any(String),
        confidence: expect.any(Number),
      });
    }, 15000);

    it('should get detailed place information for a known place ID', async () => {
      if (!hasApiKey) {
        console.log(
          'Skipping Google Places details test - no API key provided',
        );
        expect(true).toBe(true);
        return;
      }

      // First search for Franklin Barbecue to get a real place ID
      const searchResults = await googlePlacesService.searchPlace({
        query: 'Franklin Barbecue Austin',
        location: {
          latitude: 30.2672,
          longitude: -97.7431,
        },
      });

      if (searchResults.length === 0) {
        console.log('No search results found, skipping details test');
        return;
      }

      const placeId = searchResults[0].placeId;
      const placeDetails = await googlePlacesService.getPlaceDetails(placeId);

      expect(placeDetails).toMatchObject({
        place_id: placeId,
        name: expect.any(String),
        formatted_address: expect.any(String),
        geometry: {
          location: {
            lat: expect.any(Number),
            lng: expect.any(Number),
          },
        },
      });
    }, 15000);

    it('should enrich restaurant data with Google Places information', async () => {
      if (!hasApiKey) {
        console.log(
          'Skipping Google Places enrichment test - no API key provided',
        );
        expect(true).toBe(true);
        return;
      }

      const enrichmentInput = {
        name: 'Franklin Barbecue',
        latitude: 30.2672,
        longitude: -97.7431,
        address: '900 E 11th St, Austin, TX',
      };

      const enrichedData =
        await googlePlacesService.enrichRestaurant(enrichmentInput);

      expect(enrichedData).toMatchObject({
        placeId: expect.any(String),
        name: expect.any(String),
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        address: expect.any(String),
        formattedAddress: expect.any(String),
        metadata: {
          lastPlacesUpdate: expect.any(String),
          dataQuality: expect.stringMatching(/^(complete|partial|basic)$/),
          confidence: expect.any(Number),
          apiCallsUsed: expect.any(Number),
        },
      });

      // Check that we got some additional data
      expect(
        enrichedData.phone ||
          enrichedData.website ||
          enrichedData.hours ||
          enrichedData.rating,
      ).toBeTruthy();
    }, 15000);
  });

  describe('Restaurant Enrichment Service Integration', () => {
    const mockRestaurantEntity: Entity = {
      entityId: 'test-restaurant-id',
      name: 'Franklin Barbecue',
      type: EntityType.restaurant,
      aliases: [],
      restaurantAttributes: [],
      restaurantQualityScore: new Prisma.Decimal(0),
      latitude: null,
      longitude: null,
      address: null,
      googlePlaceId: null,
      restaurantMetadata: {},
      lastUpdated: new Date(),
      createdAt: new Date(),
    };

    it('should create enriched restaurant entity', async () => {
      const mockEnrichedData = {
        placeId: 'ChIJTest123',
        name: 'Franklin Barbecue',
        latitude: 30.2672,
        longitude: -97.7431,
        address: '900 E 11th St, Austin, TX 78702, USA',
        formattedAddress: '900 E 11th St, Austin, TX 78702, USA',
        phone: '(512) 653-1187',
        website: 'https://franklinbbq.com',
        hours: { monday: '11:00 AM - 2:00 PM', tuesday: '11:00 AM - 2:00 PM' },
        priceLevel: 2,
        rating: 4.5,
        totalRatings: 1500,
        metadata: {
          lastPlacesUpdate: new Date().toISOString(),
          dataQuality: 'complete' as const,
          confidence: 0.9,
          apiCallsUsed: 2,
        },
      };

      const mockEnrichedEntity = {
        ...mockRestaurantEntity,
        latitude: new Prisma.Decimal(30.2672),
        longitude: new Prisma.Decimal(-97.7431),
        address: '900 E 11th St, Austin, TX 78702, USA',
        googlePlaceId: 'ChIJTest123',
        restaurantMetadata: { phone: '(512) 653-1187' },
      };

      // Mock the GooglePlacesService
      jest.spyOn(googlePlacesService, 'enrichRestaurant').mockResolvedValue(mockEnrichedData);
      entityRepository.createRestaurant.mockResolvedValue(mockEnrichedEntity);

      const result = await restaurantEnrichmentService.createEnrichedRestaurant(
        {
          name: 'Franklin Barbecue',
          address: '900 E 11th St, Austin, TX',
        },
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.createRestaurant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.any(String),
          latitude: expect.any(Number),
          longitude: expect.any(Number),
          address: expect.any(String),
          googlePlaceId: expect.any(String),
          restaurantMetadata: expect.any(Object),
        }),
      );

      expect(result).toEqual(mockEnrichedEntity);
    }, 20000);

    it('should enrich existing restaurant entity', async () => {
      const mockEnrichedData = {
        placeId: 'ChIJTest123',
        name: 'Franklin Barbecue',
        latitude: 30.2672,
        longitude: -97.7431,
        address: '900 E 11th St, Austin, TX 78702, USA',
        formattedAddress: '900 E 11th St, Austin, TX 78702, USA',
        phone: '(512) 653-1187',
        website: 'https://franklinbbq.com',
        hours: { monday: '11:00 AM - 2:00 PM', tuesday: '11:00 AM - 2:00 PM' },
        priceLevel: 2,
        rating: 4.5,
        totalRatings: 1500,
        metadata: {
          lastPlacesUpdate: new Date().toISOString(),
          dataQuality: 'complete' as const,
          confidence: 0.9,
          apiCallsUsed: 2,
        },
      };

      const mockUpdatedEntity = {
        ...mockRestaurantEntity,
        latitude: new Prisma.Decimal(30.2672),
        longitude: new Prisma.Decimal(-97.7431),
        address: '900 E 11th St, Austin, TX 78702, USA',
        googlePlaceId: 'ChIJTest123',
        lastUpdated: new Date(),
      };

      // Mock the GooglePlacesService
      jest.spyOn(googlePlacesService, 'enrichRestaurant').mockResolvedValue(mockEnrichedData);
      entityRepository.update.mockResolvedValue(mockUpdatedEntity);

      const result =
        await restaurantEnrichmentService.enrichRestaurantEntity(
          mockRestaurantEntity,
        );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(entityRepository.update).toHaveBeenCalledWith(
        mockRestaurantEntity.entityId,
        expect.objectContaining({
          latitude: expect.any(Number),
          longitude: expect.any(Number),
          address: expect.any(String),
          googlePlaceId: expect.any(String),
          restaurantMetadata: expect.any(Object),
          lastUpdated: expect.any(Date),
        }),
      );

      expect(result).toEqual(mockUpdatedEntity);
    }, 20000);

    it('should handle bulk restaurant enrichment with rate limiting', async () => {
      if (!hasApiKey) {
        console.log('Skipping bulk enrichment test - no API key provided');
        expect(true).toBe(true);
        return;
      }

      const mockRestaurants = [
        {
          ...mockRestaurantEntity,
          entityId: 'restaurant-1',
          name: 'Restaurant 1',
        },
        {
          ...mockRestaurantEntity,
          entityId: 'restaurant-2',
          name: 'Restaurant 2',
        },
      ];

      entityRepository.update.mockResolvedValue(mockRestaurants[0]);

      const startTime = Date.now();
      const result = await restaurantEnrichmentService.bulkEnrichRestaurants(
        mockRestaurants,
        {
          batchSize: 2,
          delayBetweenBatches: 500,
          skipExisting: false,
        },
      );
      const endTime = Date.now();

      // Should take at least some time due to delays
      expect(endTime - startTime).toBeGreaterThan(200);

      expect(result.metrics.totalProcessed).toBe(2);
      expect(result.enrichedEntities).toHaveLength(2);
    }, 30000);
  });

  describe('Performance and Metrics', () => {
    it('should track performance metrics during operations', async () => {
      if (!hasApiKey) {
        console.log('Skipping performance metrics test - no API key provided');
        expect(true).toBe(true);
        return;
      }

      const initialMetrics = googlePlacesService.getPerformanceMetrics();
      expect(initialMetrics.requestCount).toBe(0);

      await googlePlacesService.testConnection();

      const afterMetrics = googlePlacesService.getPerformanceMetrics();
      expect(afterMetrics.requestCount).toBeGreaterThan(0);
      expect(afterMetrics.averageResponseTime).toBeGreaterThan(0);
      expect(afterMetrics.successRate).toBeGreaterThan(0);
    }, 15000);

    it('should provide configuration without sensitive data', () => {
      const config = googlePlacesService.getGooglePlacesConfig();

      expect(config).not.toHaveProperty('apiKey');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('defaultRadius');
      expect(config).toHaveProperty('retryOptions');
    });
  });
});
