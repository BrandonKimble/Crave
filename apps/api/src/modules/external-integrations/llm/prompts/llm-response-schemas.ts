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
      description: 'Restaurant-level attributes such as ambiance or amenities',
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
      description:
        'Selected candidate ID when decision is select, otherwise null.',
    },
  },
  required: ['decision', 'candidateId'],
  additionalProperties: false,
} as const;

export const MODERATION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Content-safety decision for a piece of user text',
  properties: {
    allowed: {
      type: 'boolean',
      description:
        'true if the text is safe to publish, false if it must be blocked',
    },
    reason: {
      type: 'string',
      description:
        'Short label for the decision (e.g. "safe", "violent threat", "sexual content", "harassment", "hate")',
    },
  },
  required: ['allowed', 'reason'],
  additionalProperties: false,
} as const;

export const ATTRIBUTE_ONTOLOGY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Canonicalization plan: synonym groups plus rejected junk terms for a set of attribute terms',
  properties: {
    groups: {
      type: 'array',
      description:
        'Synonym clusters. Each group collapses to one canonical attribute; every member is a synonym of it.',
      items: {
        type: 'object',
        properties: {
          canonical: {
            type: 'string',
            description:
              'The surviving canonical name for this group. Prefer an existing canonical when the group contains one.',
          },
          members: {
            type: 'array',
            items: { type: 'string' },
            description:
              'All terms that belong to this group, copied verbatim from the input (including the canonical itself).',
          },
        },
        required: ['canonical', 'members'],
        additionalProperties: false,
      },
    },
    rejected: {
      type: 'array',
      description:
        'Terms that are not valid attributes (junk, noise, non-descriptive, or wrong-category).',
      items: {
        type: 'object',
        properties: {
          term: {
            type: 'string',
            description: 'The rejected term, copied verbatim from the input.',
          },
          reason: {
            type: 'string',
            description: 'Short justification for rejecting the term.',
          },
        },
        required: ['term', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups', 'rejected'],
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
  description:
    'Restaurant and food mentions extracted from food community content',
  properties: {
    mentions: {
      type: 'array',
      description: 'Array of restaurant/food mentions with entity details',
      items: {
        type: 'object',
        description:
          'Single mention of restaurant or food with complete metadata',
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
