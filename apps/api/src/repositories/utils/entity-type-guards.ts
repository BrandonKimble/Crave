import { EntityType, Prisma } from '@prisma/client';

/**
 * Type guard functions for runtime validation of entity data
 * These functions validate that entity creation/update data conforms to type-specific requirements
 */

/**
 * Type guard for restaurant entity data
 */
export function isValidRestaurantData(
  data: Prisma.EntityCreateInput | Prisma.EntityUpdateInput,
): boolean {
  // Restaurant entities should have a valid name
  if ('name' in data) {
    const name = data.name;
    if (typeof name === 'string' && name.trim().length === 0) {
      return false; // Empty name is invalid
    }
  }

  // For restaurant type, basic validation passes
  if ('type' in data && data.type === 'restaurant') {
    return true; // Location fields are optional
  }
  return true;
}

/**
 * Type guard for dish or category entity data
 */
export function isValidDishOrCategoryData(
  data: Prisma.EntityCreateInput | Prisma.EntityUpdateInput,
): boolean {
  // Dish/category entities should have name and optionally description
  if ('type' in data && data.type === 'dish_or_category') {
    return (
      'name' in data && typeof data.name === 'string' && data.name.length > 0
    );
  }
  return true;
}

/**
 * Type guard for dish attribute entity data
 */
export function isValidDishAttributeData(
  data: Prisma.EntityCreateInput | Prisma.EntityUpdateInput,
): boolean {
  // Dish attributes should have minimal requirements
  if ('type' in data && data.type === 'dish_attribute') {
    return (
      'name' in data && typeof data.name === 'string' && data.name.length > 0
    );
  }
  return true;
}

/**
 * Type guard for restaurant attribute entity data
 */
export function isValidRestaurantAttributeData(
  data: Prisma.EntityCreateInput | Prisma.EntityUpdateInput,
): boolean {
  // Restaurant attributes should have minimal requirements
  if ('type' in data && data.type === 'restaurant_attribute') {
    return (
      'name' in data && typeof data.name === 'string' && data.name.length > 0
    );
  }
  return true;
}

/**
 * General entity type validation dispatcher
 */
export function validateEntityTypeData(
  type: EntityType,
  data: Prisma.EntityCreateInput | Prisma.EntityUpdateInput,
): boolean {
  switch (type) {
    case 'restaurant':
      return isValidRestaurantData(data);
    case 'dish_or_category':
      return isValidDishOrCategoryData(data);
    case 'dish_attribute':
      return isValidDishAttributeData(data);
    case 'restaurant_attribute':
      return isValidRestaurantAttributeData(data);
    default:
      return false;
  }
}

/**
 * Runtime entity type guard
 */
export function isValidEntityType(type: string): type is EntityType {
  return [
    'restaurant',
    'dish_or_category',
    'dish_attribute',
    'restaurant_attribute',
  ].includes(type);
}

/**
 * Validate required fields for restaurant entities
 */
export function validateRestaurantRequiredFields(
  data: Prisma.EntityCreateInput,
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (
    !data.name ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0
  ) {
    missingFields.push('name');
  }

  // Optional but recommended fields for restaurants
  const hasLocation = data.latitude && data.longitude;
  const hasAddress =
    data.address &&
    typeof data.address === 'string' &&
    data.address.trim().length > 0;

  // Log warning if no location data provided
  if (!hasLocation && !hasAddress) {
    // This is valid but not ideal - could be logged as warning
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate essential fields for all entity types
 */
export function validateEssentialEntityFields(
  type: EntityType,
  data: Prisma.EntityCreateInput,
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  // All entities require a name
  if (
    !data.name ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0
  ) {
    missingFields.push('name');
  }

  // Type-specific validation
  switch (type) {
    case 'restaurant': {
      const restaurantValidation = validateRestaurantRequiredFields(data);
      missingFields.push(...restaurantValidation.missingFields);
      break;
    }
    case 'dish_or_category':
    case 'dish_attribute':
    case 'restaurant_attribute':
      // These only need name, which is already validated above
      break;
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
