import { RetryOptions } from '../shared/external-integrations.types';

/**
 * LLM configuration interface for Gemini API
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  queryModel?: string | null;
  queryLogOutputs?: boolean;
  baseUrl?: string;
  timeout?: number;
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;
  connectTimeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  thinking?: {
    level?: string;
    queryLevel?: string;
    includeThoughts?: boolean;
    /** Runtime per-caller level overrides; wins over the profile table
     *  (gemini-caller-profiles.ts), which is the value SOURCE. */
    perCaller?: Record<string, string>;
  };
  thoughtDebug?: {
    enabled: boolean;
    query: boolean;
    content: boolean;
    maxChars: number;
    maxQueryEntries?: number;
    maxContentEntries?: number;
    writeToFile?: boolean;
    filePath?: string;
    filePathQuery?: string;
    filePathContent?: string;
  };
  retryOptions: RetryOptions;
  cache?: {
    systemTtlSeconds: number;
    systemRefreshLeadSeconds: number;
    queryResultTtlSeconds?: number;
    queryResultRedisKey?: string;
    queryResultCacheVersion?: string;
    queryResultLocalTtlSeconds?: number;
    queryResultLocalMaxEntries?: number;
    queryResultIncludeMetadata?: boolean;
  };
}

/**
 * LLM Input Structure as defined in PRD Section 6.3.1
 */
export interface LLMSourceMapEntry {
  canonical_id: string;
  source_type: 'post' | 'comment';
}

export type LLMSourceMap = Record<string, LLMSourceMapEntry>;

export interface LLMModelInput {
  posts: LLMPost[];
}

export interface LLMProcessingInput extends LLMModelInput {
  source_map: LLMSourceMap;
}

export interface LLMPost {
  id: string;
  title: string;
  content: string;
  subreddit: string;
  // null = author unobserved (deleted/absent); never a fabricated sentinel (F4906).
  author: string | null;
  url: string;
  score: number;
  // null = creation time unknown; never NOW-as-a-fact (F4905).
  created_at: string | null;
  comments: LLMComment[];
  extract_from_post?: boolean;
}

export interface LLMComment {
  id: string;
  content: string;
  author: string | null;
  score: number;
  created_at: string | null;
  parent_id: string | null;
  url: string;
}

/**
 * LLM Output Structure - flattened for performance while preserving ALL properties
 * Enhanced for compound term processing with hierarchical decomposition
 */
export interface LLMOutputStructure {
  mentions: LLMMention[];
  usageMetadata?: LLMUsageMetadata | null;
  rateLimitInfo?: RateLimitInfo;
}

export interface EnrichedLLMOutputStructure {
  mentions: EnrichedLLMMention[];
  usageMetadata?: LLMUsageMetadata | null;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * THE V17 WIRE CONTRACT (observed-span, plans/v17-program.md item 1): the
 * model never authors a name — it emits `place_observed` (the span AS
 * WRITTEN in a source, mechanical lowercase only) and `place_source_id`
 * (WHICH source's text contains it). Ingest derives the canonical name in
 * code (place-name-contract.ts) and mechanically refuses a span absent from
 * the cited source — refusals are BANKED, never dropped.
 */
interface LLMWireMentionCommon {
  temp_id: string;
  /** The restaurant name exactly as the cited source's text wrote it. */
  place_observed: string;
  /** Chunk-local SRC ref of the source whose text contains the span. */
  place_source_id: string;
  place_attributes?: string[] | null;
  // Source tracking from the prompt input, using chunk-local source refs
  // such as SRC001 that are resolved back to canonical IDs server-side.
  source_id: string;
}

/**
 * PLACE mention: restaurant-only carrier of holistic endorsement or venue
 * attributes. The ONLY shape that carries `general_praise`; it has no dish
 * fields — praise-on-a-dish-row is unrepresentable (red team F6).
 */
export interface LLMPlaceMention extends LLMWireMentionCommon {
  general_praise: boolean;
  item?: never;
  item_categories?: never;
  ingredients?: never;
  is_menu_item?: never;
  item_attributes?: never;
}

/**
 * DISH mention: a composed dish claim at a place. The connection IS its
 * endorsement, so it carries no praise flag at all.
 */
export interface LLMDishMention extends LLMWireMentionCommon {
  item: string;
  item_categories?: string[] | null;
  ingredients?: string[] | null; // Source-named ingredient nouns for this dish — evidence tier; canonical dish ingredients are synthesized offline
  is_menu_item?: boolean | null;
  item_attributes?: string[] | null;
  general_praise?: never;
}

/**
 * The decode-layer mention union — discriminated by the presence of `item`
 * (see COLLECTION_RESPONSE_JSON_SCHEMA's anyOf twin). The invalid state
 * (praise flag + dish fields on one row) is unrepresentable in TS too.
 */
export type LLMMention = LLMPlaceMention | LLMDishMention;

export function isDishMention(mention: LLMMention): mention is LLMDishMention {
  return typeof mention.item === 'string';
}

/**
 * INTERNAL mention shape, post-ingest: the extraction pipeline converts the
 * wire union into this — `place` is the CODE-derived canonical
 * (canonicalizeObservedPlaceName over place_observed), `place_surface` is
 * the observed span verbatim, and `general_praise` is DERIVED from the wire
 * shape (dish mention -> false; place mention -> its flag) so downstream
 * writers keep their old semantics unchanged.
 */
export interface LLMInternalMention {
  temp_id: string;

  // Restaurant fields (REQUIRED)
  place: string; // Canonical name derived in code from place_observed
  place_surface?: string | null; // Exact string as observed in source (= place_observed)
  /** Verbatim observed span from the wire mention (provenance). */
  place_observed?: string | null;
  /** Canonical source id whose text contains the observed span. */
  place_source_id?: string | null;

  // Food entity fields (optional - null when no food mentioned)
  item?: string | null; // Normalized name only
  item_surface?: string | null; // Exact string as observed in source
  item_categories?: string[] | null; // Hierarchical decomposition
  ingredients?: string[] | null; // Source-named ingredient nouns for this dish (4.6) — evidence tier; canonical dish ingredients are synthesized offline
  item_category_surfaces?: (string | null)[] | null; // Surface tokens aligned with item_categories
  is_menu_item?: boolean | null;

  // Attributes (preserved as arrays)
  place_attributes?: string[] | null;
  place_attribute_surfaces?: (string | null)[] | null;
  item_attributes?: string[] | null;
  item_attribute_surfaces?: (string | null)[] | null;

  // Core processing fields (VITAL) — derived at ingest from the wire shape.
  general_praise: boolean;

  // Source tracking from the prompt input, using chunk-local source refs
  // such as SRC001 that are resolved back to canonical IDs server-side.
  source_id: string;
}

/**
 * Enriched mention shape used after the collector hydrates model output
 * with source metadata and internal provenance.
 */
export interface EnrichedLLMMention extends LLMInternalMention {
  source_id: string;
  source_type: 'post' | 'comment';
  source_content?: string;
  source_ups: number;
  source_url: string;
  source_created_at: string;
  subreddit?: string;
  post_context?: string;

  // Internal processing fields populated server-side
  __placeTempId?: string | null;
  __itemEntityTempId?: string | null;
  __itemCategoryTempIds?: Array<{
    name: string;
    tempId: string;
    surface?: string | null;
  }>;
  __inputChunkId?: string | null;
  __extractionInputId?: string | null;
  __sourceDocumentId?: string | null;
}

/**
 * Gemini API response structure
 */
export interface LLMApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
        thought?: boolean;
        thoughtSignature?: string;
      }>;
      role?: string;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
    citationMetadata?: {
      citationSources: Array<{
        startIndex: number;
        endIndex: number;
        uri: string;
        license: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  modelVersion?: string;
  promptFeedback?: unknown;
}

/**
 * Gemini API request structure
 */
export interface LLMSearchQueryAnalysis {
  places: string[];
  items: string[];
  itemAttributes: string[];
  placeAttributes: string[];
  /** Ingredient nouns searched BY ("burrata", "miso") — the ingredient lane. */
  ingredients?: string[];
  /** Ingredient nouns the user wants ABSENT ("no egg", "without cilantro",
   *  "peanut-free") — the allergy-safe exclusion lane. */
  metadata?: Record<string, unknown>;
}

export interface LLMCuisineExtractionResult {
  cuisines: string[];
  /** Venue attributes the summary STATES (THE FILTER TEST) — S4 widening. */
  attributes: string[];
}

export interface LLMModerationResult {
  allowed: boolean;
  reason: string;
}

export interface LLMAttributePlacementCandidate {
  id: number;
  name: string;
}

export interface LLMAttributePlacementInput {
  term: string;
  kind: 'item_attribute' | 'place_attribute';
  candidates: LLMAttributePlacementCandidate[];
}

export interface LLMAttributePlacementResult {
  decision: 'match' | 'new' | 'reject';
  candidateId: number | null;
  /** Audit-only; absent in prod (llm-audit-policy). */
  reason?: string;
}

export interface LLMAttributeNameInput {
  kind: 'item_attribute' | 'place_attribute';
  /** The synonym group (canonical + aliases) to pick a display name from. */
  names: string[];
}

export interface LLMEntityMatchCandidate {
  id: number;
  name: string;
  /**
   * Other names this candidate is known by (recall surfaces / extracted
   * aliases). SAME evidence on BOTH transports (red team 2026-08-12): the
   * batch path always carried these while the single path silently dropped
   * them, so the identical (term, candidate) pair could judge differently by
   * batch size. Each envelope states the rule: an alias counts as that
   * candidate's name.
   */
  aliases?: string[];
}

export interface LLMEntityMatchInput {
  /** The newly-extracted entity name to resolve. */
  term: string;
  /** restaurant (a place), food (a dish), or ingredient (a component). */
  kind: 'place' | 'item' | 'ingredient';
  /** Existing entities recalled as the closest matches to `term`. */
  candidates: LLMEntityMatchCandidate[];
}

export interface LLMEntityMatchResult {
  decision: 'match' | 'new';
  candidateId: number | null;
  /** Audit-only; absent in prod (llm-audit-policy). */
  reason?: string;
}

export interface LLMPollAxisConstraint {
  kind: 'category' | 'cuisine' | 'dish_attribute' | 'place_attribute';
  value: string;
}

export interface LLMPollAxis {
  targetType: 'dish' | 'place';
  constraint: LLMPollAxisConstraint | null;
  anchor: string | null;
  marketHint: string | null;
}

export interface LLMPollSubjectResult {
  mode: 'ranked' | 'discussion';
  confidence: number;
  axis: LLMPollAxis | null;
  reason: string;
}

export interface LLMPlaceChooserCandidate {
  candidateId: string;
  name: string;
  address?: string | null;
  types?: string[] | null;
  sourceLabels?: string[] | null;
  autocompleteRank?: number | null;
  searchTextRank?: number | null;
}

export interface LLMPlaceChooserInput {
  query: string;
  sourceText?: string | null;
  sourceLocale?: {
    city?: string | null;
    region?: string | null;
  } | null;
  candidates: LLMPlaceChooserCandidate[];
}

export interface LLMPlaceChooserDecision {
  decision: 'select' | 'reject';
  candidateId?: string | null;
  /** The judge's stated ground, when the model returned one. The grounding
   *  hearing ledger requires it — a reasonless verdict is not recorded (H5
   *  amendment (d)) — and the fail-closed paths (no candidates, parse error)
   *  deliberately carry none, so an outage can never mint a remembered
   *  rejection. */
  reason?: string;
}

export type LLMUsageMetadata = NonNullable<LLMApiResponse['usageMetadata']>;

export interface RateLimitInfo {
  waitTimeMs: number;
  totalDurationMs: number;
  processingTimeMs: number;
  guaranteed: boolean;
  workerId: string;
  utilizationPercent: number;
  rpmUtilization: number;
  tpmUtilization: number;
}
