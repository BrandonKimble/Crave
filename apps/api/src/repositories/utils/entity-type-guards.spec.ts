import { EntityType, Prisma } from '@prisma/client';
import {
  isValidRestaurantData,
  isValidDishOrCategoryData,
  isValidDishAttributeData,
  isValidRestaurantAttributeData,
  validateEntityTypeData,
  isValidEntityType,
  validateRestaurantRequiredFields,
  validateEssentialEntityFields,
} from './entity-type-guards';

describe('Entity Type Guards', () => {
  describe('isValidRestaurantData', () => {
    it('should return true for valid restaurant data', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Test St',
      };

      expect(isValidRestaurantData(validData)).toBe(true);
    });

    it('should return true for restaurant data without location', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      expect(isValidRestaurantData(validData)).toBe(true);
    });

    it('should return true for non-restaurant data', () => {
      const dishData: Prisma.EntityCreateInput = {
        name: 'Pizza',
        type: 'dish_or_category',
      };

      expect(isValidRestaurantData(dishData)).toBe(true);
    });
  });

  describe('isValidDishOrCategoryData', () => {
    it('should return true for valid dish/category data', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Pizza',
        type: 'dish_or_category',
      };

      expect(isValidDishOrCategoryData(validData)).toBe(true);
    });

    it('should return true for non-dish data', () => {
      const restaurantData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      expect(isValidDishOrCategoryData(restaurantData)).toBe(true);
    });
  });

  describe('isValidDishAttributeData', () => {
    it('should return true for valid dish attribute data', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Spicy',
        type: 'dish_attribute',
      };

      expect(isValidDishAttributeData(validData)).toBe(true);
    });

    it('should return true for non-dish-attribute data', () => {
      const restaurantData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      expect(isValidDishAttributeData(restaurantData)).toBe(true);
    });
  });

  describe('isValidRestaurantAttributeData', () => {
    it('should return true for valid restaurant attribute data', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Family-friendly',
        type: 'restaurant_attribute',
      };

      expect(isValidRestaurantAttributeData(validData)).toBe(true);
    });

    it('should return true for non-restaurant-attribute data', () => {
      const dishData: Prisma.EntityCreateInput = {
        name: 'Pizza',
        type: 'dish_or_category',
      };

      expect(isValidRestaurantAttributeData(dishData)).toBe(true);
    });
  });

  describe('validateEntityTypeData', () => {
    it('should validate restaurant data correctly', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      expect(validateEntityTypeData('restaurant', validData)).toBe(true);
    });

    it('should validate dish_or_category data correctly', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Pizza',
        type: 'dish_or_category',
      };

      expect(validateEntityTypeData('dish_or_category', validData)).toBe(true);
    });

    it('should validate dish_attribute data correctly', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Spicy',
        type: 'dish_attribute',
      };

      expect(validateEntityTypeData('dish_attribute', validData)).toBe(true);
    });

    it('should validate restaurant_attribute data correctly', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Family-friendly',
        type: 'restaurant_attribute',
      };

      expect(validateEntityTypeData('restaurant_attribute', validData)).toBe(
        true,
      );
    });

    it('should return false for invalid entity type', () => {
      const data: Prisma.EntityCreateInput = {
        name: 'Test',
        type: 'restaurant',
      };

      expect(validateEntityTypeData('invalid_type' as EntityType, data)).toBe(
        false,
      );
    });
  });

  describe('isValidEntityType', () => {
    it('should return true for valid entity types', () => {
      expect(isValidEntityType('restaurant')).toBe(true);
      expect(isValidEntityType('dish_or_category')).toBe(true);
      expect(isValidEntityType('dish_attribute')).toBe(true);
      expect(isValidEntityType('restaurant_attribute')).toBe(true);
    });

    it('should return false for invalid entity types', () => {
      expect(isValidEntityType('invalid_type')).toBe(false);
      expect(isValidEntityType('')).toBe(false);
      expect(isValidEntityType('RESTAURANT')).toBe(false);
    });
  });

  describe('validateRestaurantRequiredFields', () => {
    it('should validate restaurant with all required fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Test St',
      };

      const result = validateRestaurantRequiredFields(validData);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should validate restaurant with minimal fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      const result = validateRestaurantRequiredFields(validData);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should return invalid for missing name', () => {
      const invalidData: Prisma.EntityCreateInput = {
        type: 'restaurant',
      } as Prisma.EntityCreateInput;

      const result = validateRestaurantRequiredFields(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('name');
    });

    it('should return invalid for empty name', () => {
      const invalidData: Prisma.EntityCreateInput = {
        name: '',
        type: 'restaurant',
      };

      const result = validateRestaurantRequiredFields(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('name');
    });

    it('should return invalid for whitespace-only name', () => {
      const invalidData: Prisma.EntityCreateInput = {
        name: '   ',
        type: 'restaurant',
      };

      const result = validateRestaurantRequiredFields(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('name');
    });
  });

  describe('validateEssentialEntityFields', () => {
    it('should validate restaurant entity fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Test Restaurant',
        type: 'restaurant',
      };

      const result = validateEssentialEntityFields('restaurant', validData);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should validate dish_or_category entity fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Pizza',
        type: 'dish_or_category',
      };

      const result = validateEssentialEntityFields(
        'dish_or_category',
        validData,
      );
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should validate dish_attribute entity fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Spicy',
        type: 'dish_attribute',
      };

      const result = validateEssentialEntityFields('dish_attribute', validData);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should validate restaurant_attribute entity fields', () => {
      const validData: Prisma.EntityCreateInput = {
        name: 'Family-friendly',
        type: 'restaurant_attribute',
      };

      const result = validateEssentialEntityFields(
        'restaurant_attribute',
        validData,
      );
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should return invalid for missing name across all types', () => {
      const testCases: Array<{
        type: EntityType;
        data: Prisma.EntityCreateInput;
      }> = [
        {
          type: 'restaurant',
          data: { type: 'restaurant' } as Prisma.EntityCreateInput,
        },
        {
          type: 'dish_or_category',
          data: { type: 'dish_or_category' } as Prisma.EntityCreateInput,
        },
        {
          type: 'dish_attribute',
          data: { type: 'dish_attribute' } as Prisma.EntityCreateInput,
        },
        {
          type: 'restaurant_attribute',
          data: { type: 'restaurant_attribute' } as Prisma.EntityCreateInput,
        },
      ];

      testCases.forEach(({ type, data }) => {
        const result = validateEssentialEntityFields(type, data);
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('name');
      });
    });

    it('should return invalid for empty name across all types', () => {
      const testCases: Array<{
        type: EntityType;
        data: Prisma.EntityCreateInput;
      }> = [
        { type: 'restaurant', data: { name: '', type: 'restaurant' } },
        {
          type: 'dish_or_category',
          data: { name: '', type: 'dish_or_category' },
        },
        { type: 'dish_attribute', data: { name: '', type: 'dish_attribute' } },
        {
          type: 'restaurant_attribute',
          data: { name: '', type: 'restaurant_attribute' },
        },
      ];

      testCases.forEach(({ type, data }) => {
        const result = validateEssentialEntityFields(type, data);
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('name');
      });
    });
  });
});
