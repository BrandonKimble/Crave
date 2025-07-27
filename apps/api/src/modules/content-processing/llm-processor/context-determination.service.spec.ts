/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ContextDeterminationService } from './context-determination.service';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { LoggerService } from '../../../shared';
import {
  LLMOutputStructure,
  LLMMention,
  LLMEntityRef,
  LLMDishAttribute,
  LLMSource,
} from '../../external-integrations/llm/llm.types';
import { BatchResolutionResult } from '../entity-resolver/entity-resolution.types';

describe('ContextDeterminationService', () => {
  let service: ContextDeterminationService;
  let entityResolutionService: jest.Mocked<EntityResolutionService>;

  beforeEach(async () => {
    const mockEntityResolutionService = {
      resolveContextualAttributes: jest.fn(),
    };

    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextDeterminationService,
        {
          provide: EntityResolutionService,
          useValue: mockEntityResolutionService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<ContextDeterminationService>(
      ContextDeterminationService,
    );
    entityResolutionService = module.get(EntityResolutionService);
  });

  describe('processLLMOutputForAttributes', () => {
    it('should process LLM output with restaurant and dish attributes', async () => {
      const mockLLMOutput: LLMOutputStructure = {
        mentions: [
          createMockMention(
            'mention_1',
            ['patio', 'romantic'],
            [
              { attribute: 'spicy', type: 'descriptive' },
              { attribute: 'vegan', type: 'selective' },
            ],
          ),
        ],
      };

      const mockResolutionResult: BatchResolutionResult = {
        tempIdToEntityIdMap: new Map([
          ['mention_1_restaurant_attr_patio', 'entity_1'],
          ['mention_1_restaurant_attr_romantic', 'entity_2'],
          ['mention_1_dish_attr_spicy', 'entity_3'],
          ['mention_1_dish_attr_vegan', 'entity_4'],
        ]),
        resolutionResults: [],
        newEntitiesCreated: 4,
        performanceMetrics: {
          totalProcessed: 4,
          exactMatches: 0,
          aliasMatches: 0,
          fuzzyMatches: 0,
          newEntitiesCreated: 4,
          processingTimeMs: 100,
          averageConfidence: 0.9,
        },
      };

      entityResolutionService.resolveContextualAttributes.mockResolvedValue(
        mockResolutionResult,
      );

      const result = await service.processLLMOutputForAttributes(mockLLMOutput);

      expect(
        entityResolutionService.resolveContextualAttributes,
      ).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tempId: 'mention_1_restaurant_attr_patio',
            attributeName: 'patio',
            scope: 'restaurant',
          }),
          expect.objectContaining({
            tempId: 'mention_1_restaurant_attr_romantic',
            attributeName: 'romantic',
            scope: 'restaurant',
          }),
          expect.objectContaining({
            tempId: 'mention_1_dish_attr_spicy',
            attributeName: 'spicy',
            scope: 'dish',
          }),
          expect.objectContaining({
            tempId: 'mention_1_dish_attr_vegan',
            attributeName: 'vegan',
            scope: 'dish',
          }),
        ]),
        undefined,
      );

      expect(result).toBe(mockResolutionResult);
    });

    it('should handle LLM output with no attributes', async () => {
      const mockLLMOutput: LLMOutputStructure = {
        mentions: [createMockMention('mention_1', null, null)],
      };

      const result = await service.processLLMOutputForAttributes(mockLLMOutput);

      expect(
        entityResolutionService.resolveContextualAttributes,
      ).not.toHaveBeenCalled();
      expect(result.tempIdToEntityIdMap.size).toBe(0);
      expect(result.resolutionResults.length).toBe(0);
      expect(result.newEntitiesCreated).toBe(0);
    });

    it('should handle multiple mentions with mixed attributes', async () => {
      const mockLLMOutput: LLMOutputStructure = {
        mentions: [
          createMockMention(
            'mention_1',
            ['patio'],
            [{ attribute: 'spicy', type: 'descriptive' }],
          ),
          createMockMention('mention_2', ['family-friendly'], null),
          createMockMention('mention_3', null, [
            { attribute: 'vegan', type: 'selective' },
          ]),
        ],
      };

      const mockResolutionResult: BatchResolutionResult = {
        tempIdToEntityIdMap: new Map(),
        resolutionResults: [],
        newEntitiesCreated: 0,
        performanceMetrics: {
          totalProcessed: 4,
          exactMatches: 0,
          aliasMatches: 0,
          fuzzyMatches: 0,
          newEntitiesCreated: 0,
          processingTimeMs: 50,
          averageConfidence: 0.8,
        },
      };

      entityResolutionService.resolveContextualAttributes.mockResolvedValue(
        mockResolutionResult,
      );

      await service.processLLMOutputForAttributes(mockLLMOutput);

      const calledWith =
        entityResolutionService.resolveContextualAttributes.mock.calls[0][0];

      expect(calledWith).toHaveLength(4);
      expect(
        calledWith.filter((attr) => attr.scope === 'restaurant'),
      ).toHaveLength(2);
      expect(calledWith.filter((attr) => attr.scope === 'dish')).toHaveLength(
        2,
      );
    });
  });

  describe('processMentionForAttributes', () => {
    it('should extract restaurant attributes correctly', () => {
      const mention = createMockMention('test_1', ['patio', 'romantic'], null);
      const result = service.processMentionForAttributes(mention);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        tempId: 'test_1_restaurant_attr_patio',
        attributeName: 'patio',
        originalText: 'patio',
        scope: 'restaurant',
        aliases: [],
      });
      expect(result[1]).toEqual({
        tempId: 'test_1_restaurant_attr_romantic',
        attributeName: 'romantic',
        originalText: 'romantic',
        scope: 'restaurant',
        aliases: [],
      });
    });

    it('should extract dish attributes correctly', () => {
      const mention = createMockMention('test_1', null, [
        { attribute: 'spicy', type: 'descriptive' },
        { attribute: 'vegan', type: 'selective' },
      ]);
      const result = service.processMentionForAttributes(mention);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        tempId: 'test_1_dish_attr_spicy',
        attributeName: 'spicy',
        originalText: 'spicy',
        scope: 'dish',
        aliases: [],
      });
      expect(result[1]).toEqual({
        tempId: 'test_1_dish_attr_vegan',
        attributeName: 'vegan',
        originalText: 'vegan',
        scope: 'dish',
        aliases: [],
      });
    });

    it('should handle mention with no attributes', () => {
      const mention = createMockMention('test_1', null, null);
      const result = service.processMentionForAttributes(mention);

      expect(result).toHaveLength(0);
    });
  });

  // Helper function to create mock mentions
  function createMockMention(
    tempId: string,
    restaurantAttributes: string[] | null,
    dishAttributes: LLMDishAttribute[] | null,
  ): LLMMention {
    const mockRestaurant: LLMEntityRef = {
      normalized_name: 'Test Restaurant',
      original_text: 'test restaurant',
      temp_id: `${tempId}_restaurant`,
    };

    const mockSource: LLMSource = {
      type: 'post',
      id: 'test_post_1',
      url: 'https://reddit.com/test',
      upvotes: 10,
      created_at: '2024-01-01T00:00:00Z',
    };

    return {
      temp_id: tempId,
      restaurant: mockRestaurant,
      restaurant_attributes: restaurantAttributes,
      dish_or_category: null,
      dish_attributes: dishAttributes,
      is_menu_item: true,
      general_praise: false,
      source: mockSource,
    };
  }
});
