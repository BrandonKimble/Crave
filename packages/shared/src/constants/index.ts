// Application constants

// Entity types from PRD Section 4.1
export const ENTITY_TYPES = {
  RESTAURANT: 'restaurant',
  FOOD: 'food',
  FOOD_ATTRIBUTE: 'food_attribute',
  RESTAURANT_ATTRIBUTE: 'restaurant_attribute',
} as const;

// Activity levels from PRD
export const ACTIVITY_LEVELS = {
  TRENDING: 'trending',
  ACTIVE: 'active',
  NORMAL: 'normal',
} as const;

// API endpoints (to be defined)
export const API_ENDPOINTS = {
  SEARCH: '/api/search',
  ENTITIES: '/api/entities',
} as const;
