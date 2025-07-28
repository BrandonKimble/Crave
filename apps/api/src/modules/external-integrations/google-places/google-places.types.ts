/**
 * Google Places API configuration
 */
export interface GooglePlacesConfig {
  apiKey: string;
  timeout: number;
  requestsPerSecond: number;
  defaultRadius: number;
  retryOptions: {
    maxRetries: number;
    retryDelay: number;
    retryBackoffFactor: number;
  };
}

/**
 * Performance metrics for Google Places API
 */
export interface GooglePlacesPerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  totalApiCalls: number;
  lastReset: Date;
  errorCount: number;
  successRate: number;
  rateLimitHits: number;
}

/**
 * Input data for restaurant enrichment
 */
export interface RestaurantEnrichmentInput {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  existingPlaceId?: string;
}

/**
 * Enriched restaurant data from Google Places
 */
export interface EnrichedRestaurantData {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  formattedAddress: string;
  phone?: string;
  website?: string;
  hours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  priceLevel?: number;
  rating?: number;
  totalRatings?: number;
  metadata: {
    lastPlacesUpdate: string;
    dataQuality: 'complete' | 'partial' | 'basic';
    confidence: number;
    apiCallsUsed: number;
  };
}

/**
 * Place search result
 */
export interface PlaceSearchResult {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  rating?: number;
  priceLevel?: number;
  confidence: number;
}

/**
 * Place details response from Google Places API
 */
export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: {
    weekday_text: string[];
    periods: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  price_level?: number;
  rating?: number;
  user_ratings_total?: number;
  types: string[];
  business_status?: string;
}

/**
 * Google Places API search response
 */
export interface GooglePlacesSearchResponse {
  results: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    rating?: number;
    price_level?: number;
    types: string[];
    business_status?: string;
  }>;
  status: string;
  next_page_token?: string;
}

/**
 * Google Places API place details response
 */
export interface GooglePlacesDetailsResponse {
  result: GooglePlaceDetails;
  status: string;
}

/**
 * Retry options for Google Places API calls
 */
export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryBackoffFactor: number;
}

/**
 * Search options for finding places
 */
export interface PlaceSearchOptions {
  query: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  radius?: number;
  type?: string;
  language?: string;
  region?: string;
}
