export const SEARCH_QUERY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Structured representation of the search request',
  properties: {
    restaurants: {
      type: 'array',
      items: { type: 'string' },
      description: 'Restaurant names explicitly requested or implied',
    },
    foods: {
      type: 'array',
      items: { type: 'string' },
      description: 'Food or dish names derived from the query',
    },
    foodAttributes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Food-level attributes such as dietary or flavor notes',
    },
    restaurantAttributes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Restaurant-level attributes such as ambiance or amenities',
    },
  },
  required: ['restaurants', 'foods', 'foodAttributes', 'restaurantAttributes'],
  additionalProperties: false,
} as const;

export const CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Cuisine extraction result',
  properties: {
    cuisines: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of cuisine names inferred from the summary',
    },
  },
  required: ['cuisines'],
  additionalProperties: false,
} as const;

export const RESTAURANT_PLACE_CHOOSER_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['select', 'reject'],
      description: 'Select one candidate or reject all candidates.',
    },
    candidateId: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Selected candidate ID when decision is select, otherwise null.',
    },
  },
  required: ['decision', 'candidateId'],
  additionalProperties: false,
} as const;

const NULLABLE_STRING_SCHEMA = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const NULLABLE_BOOLEAN_SCHEMA = {
  anyOf: [{ type: 'boolean' }, { type: 'null' }],
} as const;

const NULLABLE_STRING_ARRAY_SCHEMA = {
  anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
} as const;

function withDescription<T extends Record<string, unknown>>(
  schema: T,
  description: string,
): T & { description: string } {
  return { ...schema, description };
}

export const COLLECTION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Restaurant and food mentions extracted from food community content',
  properties: {
    mentions: {
      type: 'array',
      description: 'Array of restaurant/food mentions with entity details',
      items: {
        type: 'object',
        description: 'Single mention of restaurant or food with complete metadata',
        properties: {
          temp_id: withDescription(
            { type: 'string' },
            'Unique identifier for this mention',
          ),
          restaurant: withDescription(
            { type: 'string' },
            'Canonical restaurant name: lowercase, no articles (the/a/an), standardized spacing',
          ),
          restaurant_attributes: withDescription(
            { ...NULLABLE_STRING_ARRAY_SCHEMA },
            'Restaurant-scoped attributes: ambiance, features, service model, cuisine when applied to restaurant',
          ),
          food: withDescription(
            { ...NULLABLE_STRING_SCHEMA },
            'Complete compound food term as primary name, singular form, excluding attributes',
          ),
          food_categories: withDescription(
            { ...NULLABLE_STRING_ARRAY_SCHEMA },
            'Hierarchical decomposition: parent categories, ingredient categories, related food terms',
          ),
          food_attributes: withDescription(
            { ...NULLABLE_STRING_ARRAY_SCHEMA },
            'Food attributes: dietary filters, preparation styles, textures, flavors, or other descriptors applied to the dish',
          ),
          is_menu_item: withDescription(
            { ...NULLABLE_BOOLEAN_SCHEMA },
            'True if specific menu item, false if general food type',
          ),
          general_praise: withDescription(
            { type: 'boolean' },
            'True if mention contains holistic restaurant praise, regardless of specific food praise',
          ),
          source_id: withDescription(
            { type: 'string' },
            'Chunk-local source identifier copied exactly from the input payload id field (for example SRC001)',
          ),
        },
        required: ['temp_id', 'restaurant', 'general_praise', 'source_id'],
        propertyOrdering: [
          'temp_id',
          'restaurant',
          'restaurant_attributes',
          'food',
          'food_categories',
          'is_menu_item',
          'food_attributes',
          'general_praise',
          'source_id',
        ],
      },
    },
  },
  required: ['mentions'],
} as const;
