// Application constants

// Entity types from PRD Section 4.1
export const ENTITY_TYPES = {
  RESTAURANT: 'restaurant',
  FOOD: 'food',
  FOOD_ATTRIBUTE: 'food_attribute',
  RESTAURANT_ATTRIBUTE: 'restaurant_attribute',
} as const;

// API endpoints (to be defined)
export const API_ENDPOINTS = {
  SEARCH: '/api/search',
  ENTITIES: '/api/entities',
} as const;

export const ONBOARDING_VERSION = 1;
