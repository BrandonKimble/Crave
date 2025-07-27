/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerService } from '../../../shared';
import {
  AliasManagementService,
  EntityMergeInput,
} from './alias-management.service';

describe('AliasManagementService', () => {
  let service: AliasManagementService;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      http: jest.fn(),
      database: jest.fn(),
      performance: jest.fn(),
      audit: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AliasManagementService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<AliasManagementService>(AliasManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mergeAliases', () => {
    it('should merge aliases and remove duplicates', () => {
      const sourceAliases = ['ramen', 'ramen noodles'];
      const targetAliases = ['ramen', 'japanese noodles'];
      const originalTexts = ['tonkotsu ramen'];

      const result = service.mergeAliases(
        sourceAliases,
        targetAliases,
        originalTexts,
      );

      expect(result.mergedAliases).toHaveLength(4);
      expect(result.mergedAliases).toContain('ramen');
      expect(result.mergedAliases).toContain('ramen noodles');
      expect(result.mergedAliases).toContain('japanese noodles');
      expect(result.mergedAliases).toContain('tonkotsu ramen');
      expect(result.duplicatesRemoved).toBe(1); // 'ramen' was duplicate
    });

    it('should handle empty alias arrays', () => {
      const result = service.mergeAliases([], [], []);

      expect(result.mergedAliases).toHaveLength(0);
      expect(result.duplicatesRemoved).toBe(0);
    });

    it('should normalize and filter invalid aliases', () => {
      const sourceAliases = ['  valid  ', '', '   ', 'x'.repeat(300)]; // too long
      const targetAliases = ['valid', 'another'];

      const result = service.mergeAliases(sourceAliases, targetAliases, []);

      expect(result.mergedAliases).toContain('valid');
      expect(result.mergedAliases).toContain('another');
      expect(result.mergedAliases).not.toContain('');
      expect(result.mergedAliases).not.toContain('   ');
      expect(result.mergedAliases).not.toContain('x'.repeat(300));
    });
  });

  describe('removeDuplicates', () => {
    it('should remove case-insensitive duplicates', () => {
      const aliases = ['Ramen', 'RAMEN', 'ramen', 'Sushi', 'sushi'];

      const result = service.removeDuplicates(aliases);

      expect(result.uniqueAliases).toHaveLength(2);
      expect(result.uniqueAliases).toContain('Ramen'); // keeps first occurrence
      expect(result.uniqueAliases).toContain('Sushi');
      expect(result.duplicatesRemoved).toBe(3);
    });

    it('should preserve original casing of first occurrence', () => {
      const aliases = ['Spicy', 'SPICY', 'spicy'];

      const result = service.removeDuplicates(aliases);

      expect(result.uniqueAliases).toHaveLength(1);
      expect(result.uniqueAliases[0]).toBe('Spicy'); // original casing preserved
      expect(result.duplicatesRemoved).toBe(2);
    });

    it('should handle empty array', () => {
      const result = service.removeDuplicates([]);

      expect(result.uniqueAliases).toHaveLength(0);
      expect(result.duplicatesRemoved).toBe(0);
    });
  });

  describe('validateScopeConstraints', () => {
    it('should allow valid dish attributes', () => {
      const aliases = ['spicy', 'crispy', 'house-made', 'gluten-free'];

      const result = service.validateScopeConstraints(
        'dish_attribute',
        aliases,
      );

      expect(result.validAliases).toEqual(aliases);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow valid restaurant attributes', () => {
      const aliases = ['patio', 'romantic', 'family-friendly', 'casual'];

      const result = service.validateScopeConstraints(
        'restaurant_attribute',
        aliases,
      );

      expect(result.validAliases).toEqual(aliases);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect cross-scope violations for dish attributes', () => {
      const aliases = ['spicy', 'patio', 'crispy']; // 'patio' should be restaurant-only

      const result = service.validateScopeConstraints(
        'dish_attribute',
        aliases,
      );

      expect(result.validAliases).toEqual(['spicy', 'crispy']);
      expect(result.violations).toContain('patio');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Scope violation detected',
        expect.objectContaining({
          alias: 'patio',
          entityType: 'dish_attribute',
        }),
      );
    });

    it('should detect cross-scope violations for restaurant attributes', () => {
      const aliases = ['patio', 'spicy', 'romantic']; // 'spicy' should be dish-only

      const result = service.validateScopeConstraints(
        'restaurant_attribute',
        aliases,
      );

      expect(result.validAliases).toEqual(['patio', 'romantic']);
      expect(result.violations).toContain('spicy');
    });

    it('should allow all aliases when preventCrossScope is disabled', () => {
      const aliases = ['spicy', 'patio', 'crispy'];

      const result = service.validateScopeConstraints(
        'dish_attribute',
        aliases,
        {
          preventCrossScope: false,
        },
      );

      expect(result.validAliases).toEqual(aliases);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow any aliases for main entity types', () => {
      const aliases = ['spicy', 'patio', 'various', 'terms'];

      const restaurantResult = service.validateScopeConstraints(
        'restaurant',
        aliases,
      );
      const dishResult = service.validateScopeConstraints(
        'dish_or_category',
        aliases,
      );

      expect(restaurantResult.validAliases).toEqual(aliases);
      expect(restaurantResult.violations).toHaveLength(0);
      expect(dishResult.validAliases).toEqual(aliases);
      expect(dishResult.violations).toHaveLength(0);
    });
  });

  describe('prepareAliasesForMerge', () => {
    it('should prepare aliases for entity merge with validation', () => {
      const mergeInput: EntityMergeInput = {
        sourceEntityId: 'source-id',
        targetEntityId: 'target-id',
        sourceAliases: ['spicy', 'hot'],
        targetAliases: ['spicy', 'flavorful'],
        entityType: 'dish_attribute',
      };

      const result = service.prepareAliasesForMerge(mergeInput);

      expect(result.mergedAliases).toContain('spicy');
      expect(result.mergedAliases).toContain('hot');
      expect(result.mergedAliases).toContain('flavorful');
      expect(result.duplicatesRemoved).toBe(1); // 'spicy' duplicate
      expect(result.crossScopeViolations).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Preparing aliases for entity merge',
        expect.objectContaining({
          sourceEntityId: 'source-id',
          targetEntityId: 'target-id',
          entityType: 'dish_attribute',
        }),
      );
    });

    it('should detect violations during merge preparation', () => {
      const mergeInput: EntityMergeInput = {
        sourceEntityId: 'source-id',
        targetEntityId: 'target-id',
        sourceAliases: ['spicy', 'patio'], // patio violates dish_attribute scope
        targetAliases: ['crispy'],
        entityType: 'dish_attribute',
      };

      const result = service.prepareAliasesForMerge(mergeInput);

      expect(result.mergedAliases).toContain('spicy');
      expect(result.mergedAliases).toContain('crispy');
      expect(result.mergedAliases).not.toContain('patio');
      expect(result.crossScopeViolations).toContain('patio');
    });
  });

  describe('addOriginalTextAsAlias', () => {
    it('should add new alias when not present', () => {
      const existingAliases = ['ramen', 'noodles'];
      const originalText = 'tonkotsu ramen';

      const result = service.addOriginalTextAsAlias(
        existingAliases,
        originalText,
      );

      expect(result.updatedAliases).toHaveLength(3);
      expect(result.updatedAliases).toContain('ramen');
      expect(result.updatedAliases).toContain('noodles');
      expect(result.updatedAliases).toContain('tonkotsu ramen');
      expect(result.aliasAdded).toBe(true);
    });

    it('should not add duplicate alias', () => {
      const existingAliases = ['ramen', 'noodles'];
      const originalText = 'ramen';

      const result = service.addOriginalTextAsAlias(
        existingAliases,
        originalText,
      );

      expect(result.updatedAliases).toHaveLength(2);
      expect(result.aliasAdded).toBe(false);
    });

    it('should handle empty original text', () => {
      const existingAliases = ['ramen', 'noodles'];
      const originalText = '';

      const result = service.addOriginalTextAsAlias(
        existingAliases,
        originalText,
      );

      expect(result.updatedAliases).toEqual(existingAliases);
      expect(result.aliasAdded).toBe(false);
    });

    it('should handle whitespace-only original text', () => {
      const existingAliases = ['ramen', 'noodles'];
      const originalText = '   ';

      const result = service.addOriginalTextAsAlias(
        existingAliases,
        originalText,
      );

      expect(result.updatedAliases).toEqual(existingAliases);
      expect(result.aliasAdded).toBe(false);
    });
  });
});
