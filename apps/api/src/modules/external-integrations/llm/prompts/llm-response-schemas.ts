export const SEARCH_QUERY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Collectible terms the residue fragment PLAINLY names. Invention is the expensive error; empty arrays are a first-class verdict',
  properties: {
    places: {
      type: 'array',
      items: { type: 'string' },
      description:
        'A restaurant name the fragment plainly names — never implied or guessed',
    },
    items: {
      type: 'array',
      items: { type: 'string' },
      description:
        'The dish the fragment names (THE ORDER TEST: "could you say this phrase to a server as the thing you want?"), plus each broader phrase that passes THE PREDICTION TEST, most specific first; never a wrapper (special, combo, menu) or a cuisine',
    },
    itemAttributes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Food properties passing THE STANDALONE TEST (dietary, flavor, preparation, cuisine-of-a-dish); praise words are never collectible',
    },
    placeAttributes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Place properties passing THE STANDALONE TEST (setting, service, price level, neighborhood, occasion, venue kind, cuisine-of-a-place)',
    },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description:
        'A component named as contents rather than as an order ("burrata", "something with miso"). A term is never both a food and an ingredient — the dish reading wins when it is orderable as-is',
    },
  },
  required: [
    'places',
    'items',
    'itemAttributes',
    'placeAttributes',
    'ingredients',
  ],
  additionalProperties: false,
} as const;

export const CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Venue facts stated by an editorial summary',
  properties: {
    cuisines: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Cuisines passing THE TRADITION TEST — the name of a cooking tradition a diner would give when asked "what kind of food do they make?"; empty when the summary supports none (the cheap error) — never a dish, diet, format, or quality stretched into one',
    },
    attributes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Venue attributes the summary STATES, passing THE FILTER TEST: describes rather than judges (could the word describe a BAD restaurant?) AND means one definite filterable thing severed from the sentence ("patio", "counter service", "live music", "vegetarian-friendly"); plainest common form; never praise, vibe-words ("no-frills", "chic"), or implications the text does not state — empty is the cheap error',
    },
  },
  required: ['cuisines', 'attributes'],
  additionalProperties: false,
} as const;

export const PLACE_CHOOSER_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['select', 'reject'],
      description:
        'select only when BOTH the IDENTITY gate and the GEOGRAPHY gate pass for one candidate; otherwise reject — reject means retrieval continues (the cheap error), a wrong select grounds the wrong place permanently',
    },
    candidateId: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'Selected candidate ID when decision is select, otherwise null.',
    },
    reason: {
      type: 'string',
      description:
        'Audit evidence, a few words: the identity+geography facts that made this candidate the answer, or the one that is missing (e.g. "source says Austin, candidate is Dallas").',
    },
  },
  required: ['decision', 'candidateId', 'reason'],
  additionalProperties: false,
} as const;

export const MODERATION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Content-safety decision for a piece of user text',
  properties: {
    allowed: {
      type: 'boolean',
      description:
        'true if the text is safe to publish, false if it must be blocked. Judge intent and target, never individual words; when intent is genuinely unclear, ALLOW',
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

export const ATTRIBUTE_NAME_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Best display name for a group of synonymous attribute terms',
  properties: {
    name: {
      type: 'string',
      description:
        'The clearest consumer-facing label for the group, copied verbatim from the provided synonyms',
    },
  },
  required: ['name'],
  additionalProperties: false,
} as const;

export const ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Decision for placing one candidate attribute term against a shortlist of canonicals',
  properties: {
    decision: {
      type: 'string',
      enum: ['match', 'new', 'reject'],
      description:
        'reject = term fails the DESCRIBE-VS-JUDGE, STANDALONE, or SCOPE test; match = same filter as a candidate (a diner filtering by one would accept the other); new = a real attribute, distinct from every candidate',
    },
    candidate_id: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'The matched candidate id when decision is match, otherwise null',
    },
    reason: {
      type: 'string',
      description: 'Short justification for the decision',
    },
  },
  required: ['decision', 'candidate_id', 'reason'],
  additionalProperties: false,
} as const;

export const ENTITY_MATCH_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Decision for matching one candidate entity (restaurant or dish) against a shortlist of existing entities',
  properties: {
    decision: {
      type: 'string',
      enum: ['match', 'new'],
      description:
        'THE ONE-THING TEST: "Would a diner treat the two names as one and the same thing — or as two options to choose between?" match = one and the same (a name VARIANT); new = a different SPECIFICATION, or any doubt — doubt says new, because a wrong match FUSES two real entities',
    },
    candidate_id: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'The matched candidate id when decision is match, otherwise null',
    },
    reason: {
      type: 'string',
      description: 'Short justification for the decision',
    },
  },
  required: ['decision', 'candidate_id', 'reason'],
  additionalProperties: false,
} as const;

const NULLABLE_STRING_SCHEMA = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

export const POLL_SUBJECT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Classify a poll question as rankable (ranked + axis) or open (discussion), and extract the leaderboard axis',
  properties: {
    mode: {
      type: 'string',
      enum: ['ranked', 'discussion'],
      description:
        'ranked = a leaderboard over specific dishes/restaurants; discussion = an open thread, no leaderboard',
    },
    confidence: {
      type: 'number',
      description: '0..1 — how clearly this is a rankable food question',
    },
    axis: {
      anyOf: [
        {
          type: 'object',
          properties: {
            target_type: {
              type: 'string',
              enum: ['dish', 'place'],
              description: 'what the leaderboard ranks',
            },
            constraint: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    kind: {
                      type: 'string',
                      enum: [
                        'category',
                        'cuisine',
                        'dish_attribute',
                        'place_attribute',
                      ],
                    },
                    value: { type: 'string' },
                  },
                  required: ['kind', 'value'],
                  additionalProperties: false,
                },
                { type: 'null' },
              ],
              description: 'the single filter scoping the ranking, or null',
            },
            anchor: NULLABLE_STRING_SCHEMA,
            market_hint: NULLABLE_STRING_SCHEMA,
          },
          required: ['target_type', 'constraint', 'anchor', 'market_hint'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
      description: 'the leaderboard axis when ranked, otherwise null',
    },
    reason: {
      type: 'string',
      description: 'short justification',
    },
  },
  required: ['mode', 'confidence', 'axis', 'reason'],
  additionalProperties: false,
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

const PLACE_OBSERVED_SCHEMA = withDescription(
  { type: 'string' },
  'The restaurant name AS WRITTEN in the cited source (bars, cafés, trucks, and stalls all qualify): lowercase and whitespace-collapse only — diacritics, punctuation, and possessives kept as written; never expanded, corrected, unified with another spelling in the thread, or completed from world knowledge of the venue, and never a bare generic word kept from a list slot ("Best", "Good") — such a slot emits the fuller observed form (citing its source) or nothing',
);

const PLACE_SOURCE_ID_SCHEMA = withDescription(
  { type: 'string' },
  'The id of the source whose text contains the emitted name form — usually equal to source_id; differs only for a resolved reference (point at the source that NAMES the place) or a shorthand completed by a fuller form elsewhere (point at the fuller form)',
);

const PLACE_ATTRIBUTES_SCHEMA = withDescription(
  { ...NULLABLE_STRING_ARRAY_SCHEMA },
  "Restaurant-scoped attributes STATED by THIS source (ambiance, features, service model, price, cuisine — cuisine is a PLACE property only and is never inferred from a dish's identity), plus the ask's venue-level constraint words when this source is an unqualified fit-asserting pick; never from a parent comment or world knowledge of the venue",
);

const SOURCE_ID_SCHEMA = withDescription(
  { type: 'string' },
  'Chunk-local source identifier copied exactly from the input payload id field (for example SRC001)',
);

const TEMP_ID_SCHEMA = withDescription(
  { type: 'string' },
  'Unique identifier for this mention',
);

/**
 * Two mention shapes, structurally exclusive: a PLACE mention is the only
 * carrier of general_praise and has no dish fields; a DISH mention requires
 * item and has no praise flag (the dish connection IS its endorsement).
 * The invalid combination — praise flag on a dish row — is unrepresentable
 * at the decode layer, replacing the F.1 split-before-emitting instruction.
 */
export const COLLECTION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description:
    'Restaurant and food mentions extracted from food community content',
  properties: {
    mentions: {
      type: 'array',
      description:
        'Array of restaurant/food mentions — each is either a PLACE mention (endorsement/attribute carrier, no dish fields) or a DISH mention (non-null item, no praise flag)',
      items: {
        anyOf: [
          {
            type: 'object',
            description:
              'PLACE mention: restaurant-only carrier of holistic endorsement (general_praise) or venue attributes — no dish fields',
            properties: {
              temp_id: TEMP_ID_SCHEMA,
              place_observed: PLACE_OBSERVED_SCHEMA,
              place_source_id: PLACE_SOURCE_ID_SCHEMA,
              place_attributes: PLACE_ATTRIBUTES_SCHEMA,
              general_praise: withDescription(
                { type: 'boolean' },
                'True when this source carries holistic place-level endorsement or an ANSWER-TEST pick; false for an attribute-only statement about the venue',
              ),
              source_id: SOURCE_ID_SCHEMA,
            },
            required: [
              'temp_id',
              'place_observed',
              'place_source_id',
              'general_praise',
              'source_id',
            ],
            propertyOrdering: [
              'temp_id',
              'place_observed',
              'place_source_id',
              'place_attributes',
              'general_praise',
              'source_id',
            ],
          },
          {
            type: 'object',
            description:
              'DISH mention: a composed dish claim at a place — the connection is its own endorsement, so it carries no praise flag',
            properties: {
              temp_id: TEMP_ID_SCHEMA,
              place_observed: PLACE_OBSERVED_SCHEMA,
              place_source_id: PLACE_SOURCE_ID_SCHEMA,
              place_attributes: PLACE_ATTRIBUTES_SCHEMA,
              item: withDescription(
                { type: 'string' },
                'The order-name (THE ORDER TEST: sayable to a server as the thing you want) — "anything orderable — drinks included"; complete compound term, singular, excluding attributes — never a delivery wrapper (special, combo, menu), a cuisine, or a food token from the venue name',
              ),
              item_categories: withDescription(
                { ...NULLABLE_STRING_ARRAY_SCHEMA },
                'Broader orderable dish classes the food rolls up into (what arrives, most specific first); NEVER a cuisine (chinese, italian), meal period, or delivery wrapper — a cuisine belongs in place_attributes only',
              ),
              ingredients: withDescription(
                { ...NULLABLE_STRING_ARRAY_SCHEMA },
                'Ingredient nouns THIS source names for this dish (with-clauses or dish-name components); singular lowercase; empty for most mentions; never from world knowledge',
              ),
              is_menu_item: withDescription(
                { ...NULLABLE_BOOLEAN_SCHEMA },
                'True only when THIS source names one specific orderable item (two diners ordering "the X" get the same thing); false for families and for any dish inherited from the ask or a parent — a dish this source never named is never true',
              ),
              item_attributes: withDescription(
                { ...NULLABLE_STRING_ARRAY_SCHEMA },
                'Dish properties THIS source states for THIS dish (dietary, preparation, texture, flavor), each passing the DESCRIBE-not-judge bar and THE STANDALONE TEST; never praise, never a comparison, never a cuisine (place side only), never a property stated for a neighboring dish or venue — empty is the normal output',
              ),
              source_id: SOURCE_ID_SCHEMA,
            },
            required: [
              'temp_id',
              'place_observed',
              'place_source_id',
              'item',
              'source_id',
            ],
            propertyOrdering: [
              'temp_id',
              'place_observed',
              'place_source_id',
              'place_attributes',
              'item',
              'item_categories',
              'ingredients',
              'is_menu_item',
              'item_attributes',
              'source_id',
            ],
          },
        ],
      },
    },
  },
  required: ['mentions'],
} as const;

/**
 * Chunk-constrained variant of the collection schema: `source_id` becomes an
 * ENUM of exactly the chunk's valid SRC refs, so constrained decoding makes
 * ref typos (SRC0018 for SRC018, SRC01 for SRC001 — the digit-count drift
 * class attributed 2026-07-10 from stored batch payloads) IMPOSSIBLE at the
 * decode layer instead of failing ingest post-hoc. Falls back to the
 * unconstrained schema when refs are unavailable.
 */
export function collectionResponseJsonSchemaForSourceRefs(
  sourceRefs: readonly string[] | undefined,
): Record<string, unknown> {
  if (!sourceRefs || sourceRefs.length === 0) {
    return COLLECTION_RESPONSE_JSON_SCHEMA as unknown as Record<
      string,
      unknown
    >;
  }
  const schema = structuredClone(
    COLLECTION_RESPONSE_JSON_SCHEMA,
  ) as unknown as {
    properties: {
      mentions: {
        items: {
          anyOf: Array<{ properties: Record<string, Record<string, unknown>> }>;
        };
      };
    };
  };
  for (const variant of schema.properties.mentions.items.anyOf) {
    variant.properties.source_id = {
      type: 'string',
      enum: [...sourceRefs],
      description:
        'Chunk-local source identifier: exactly one of the id values in the input payload',
    };
    variant.properties.place_source_id = {
      type: 'string',
      enum: [...sourceRefs],
      description:
        'Id of the source whose text contains the emitted name form: exactly one of the id values in the input payload',
    };
  }
  return schema as unknown as Record<string, unknown>;
}

export const CUISINE_HUB_CLASSIFY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          isCuisineHub: { type: 'boolean' },
        },
        required: ['name', 'isCuisineHub'],
      },
    },
  },
  required: ['verdicts'],
} as const;

export const ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          decision: {
            type: 'string',
            enum: ['match', 'new'],
            description:
              'THE ONE-THING TEST: "Would a diner treat the two names as one and the same thing — or as two options to choose between?" match = a name VARIANT of one candidate; new = a different SPECIFICATION, or any doubt — doubt says new, because a wrong match FUSES two real entities',
          },
          candidateId: { type: ['integer', 'null'] },
          reason: {
            type: 'string',
            description:
              'Audit evidence, a few words: the variant relation matched on, or the specification that split them',
          },
        },
        required: ['index', 'decision', 'candidateId', 'reason'],
      },
    },
  },
  required: ['items'],
} as const;

export const RELEVANCE_GATE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  description: 'Thread-admission verdicts for a batch of posts',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          keep: { type: 'boolean' },
          reason: {
            type: 'string',
            description:
              'Terse audit evidence; when keeping for a food ask, QUOTE the ask verbatim',
          },
        },
        required: ['index', 'keep', 'reason'],
      },
    },
  },
  required: ['verdicts'],
} as const;

/**
 * Convert our JSON-Schema-style response schemas to Google's TYPED Schema
 * form. The batch backend rejects `responseJsonSchema` outright (blanket
 * INVALID_ARGUMENT — proven by single-variable slice tests 2026-07-06) but
 * accepts + enforces typed `responseSchema`, so batch requests convert at
 * build time. Handles the subset our schemas use: basic types, anyOf-null
 * (-> nullable), enum, description, required, propertyOrdering.
 */
export function jsonSchemaToTypedSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const TYPE_MAP: Record<string, string> = {
    object: 'OBJECT',
    array: 'ARRAY',
    string: 'STRING',
    boolean: 'BOOLEAN',
    integer: 'INTEGER',
    number: 'NUMBER',
  };

  const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(anyOf)) {
    const nonNull = anyOf.filter((entry) => entry.type !== 'null');
    if (nonNull.length === 1 && nonNull.length !== anyOf.length) {
      return { ...jsonSchemaToTypedSchema(nonNull[0]), nullable: true };
    }
    // MULTI-VARIANT anyOf (v17 mention union): Google's typed Schema carries
    // anyOf natively; each variant converts recursively. A null variant
    // alongside multiple shapes is unsupported (no such schema exists here).
    if (nonNull.length === anyOf.length && nonNull.length > 1) {
      const out: Record<string, unknown> = {
        anyOf: nonNull.map((entry) => jsonSchemaToTypedSchema(entry)),
      };
      if (typeof schema.description === 'string') {
        out.description = schema.description;
      }
      return out;
    }
    throw new Error(
      'jsonSchemaToTypedSchema: unsupported anyOf combination (null + multiple variants)',
    );
  }

  const out: Record<string, unknown> = {};
  const type = schema.type as string | undefined;
  if (type) {
    const mapped = TYPE_MAP[type];
    if (!mapped) {
      throw new Error(`jsonSchemaToTypedSchema: unsupported type "${type}"`);
    }
    out.type = mapped;
  }
  if (typeof schema.description === 'string') {
    out.description = schema.description;
  }
  if (Array.isArray(schema.enum)) {
    out.enum = schema.enum;
  }
  if (Array.isArray(schema.required)) {
    out.required = schema.required;
  }
  if (Array.isArray(schema.propertyOrdering)) {
    out.propertyOrdering = schema.propertyOrdering;
  }
  if (schema.items && typeof schema.items === 'object') {
    out.items = jsonSchemaToTypedSchema(
      schema.items as Record<string, unknown>,
    );
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      schema.properties as Record<string, unknown>,
    )) {
      properties[key] = jsonSchemaToTypedSchema(
        value as Record<string, unknown>,
      );
    }
    out.properties = properties;
  }
  return out;
}

export const DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          ingredients: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Canonical core contents of the dish AS NAMED, from world knowledge; THE IDENTITY-MODIFIER TEST governs — identity words in the name override the standard preparation; empty when the name is too ambiguous (an unanswered dish is asked again; an invented list is indistinguishable from a real one forever)',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Established co-names passing THE EXCLUSIVITY TEST — the alias points to nothing but this dish anywhere in the food world; never invented, shortened, or translated; empty is the expected default',
          },
          cuisines: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Cooking tradition(s) the dish name AS NAMED unmistakably belongs to, everywhere it is served (THE TRADITION TEST); canonical everyday spelling, at the level the name commits to; EMPTY when the name is shared across traditions — empty is the cheap error, a wrong tradition mis-files every restaurant serving the dish',
          },
        },
        required: ['index', 'ingredients', 'aliases', 'cuisines'],
      },
    },
  },
  required: ['dishes'],
} as const;
