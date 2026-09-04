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
  /** CONTEXT-ONLY (reply-chain windows, 2026-09-04): an ancestor riding in
   *  a window so references resolve; it emits nothing here, is never a
   *  `source_id`, and may be a `place_source_id`. Emitted to the model only
   *  when true (the comment's own window carries it without the flag). */
  context_only?: true;
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
  /** LEGACY (D4 category move, 2026-08-30): the schema no longer offers this
   *  field, so new extractions never carry it — category membership is
   *  derived once per dish concept by the dish-knowledge pass. The type
   *  stays so stored-payload replays (pre-v18 batches) keep decoding. */
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
 * ADMITTED mention (redteam-l1 F1): THE UNION TRAVELS WHOLE. The old
 * `LLMInternalMention` spread the wire union flat into an
 * everything-optional shape one function after it was born — `item` and
 * `general_praise` became independent fields again and the v16-forbidden
 * combination (praise on a dish row) was representable everywhere
 * downstream. Now admission ADDS derived provenance ALONGSIDE the wire
 * shape (an intersection, never a spread-over): the discriminant survives
 * to the DB write, `general_praise` exists ONLY on the place arm (the wire
 * value — never stored/derived as separate state; the one write site that
 * needs the legacy semantics derives it from the SHAPE at the point of
 * use), and provenance is NON-OPTIONAL once admitted.
 */
export interface AdmittedProvenance {
  /** Canonical resolver-facing name derived in code from place_observed. */
  place: string;
  /** Exact span as observed in the cited source (= place_observed). */
  place_surface: string;
  /** Verbatim observed span from the wire mention (provenance). */
  place_observed: string;
  /** CANONICAL source id whose text contains the observed span. */
  place_source_id: string;
  /** CANONICAL source id (chunk-local SRC ref resolved server-side). */
  source_id: string;
  /** Surface tokens aligned with place_attributes (set post-admission). */
  place_attribute_surfaces?: (string | null)[] | null;
}

/** Dish-arm surface alignments the pipeline fills in post-admission. */
export interface AdmittedDishSurfaces {
  item_surface?: string | null;
  item_category_surfaces?: (string | null)[] | null;
  item_attribute_surfaces?: (string | null)[] | null;
}

export type Admitted<M extends LLMMention> = M &
  AdmittedProvenance &
  (M extends LLMDishMention ? AdmittedDishSurfaces : unknown);

export type AdmittedMention =
  | Admitted<LLMPlaceMention>
  | Admitted<LLMDishMention>;

/**
 * Source-metadata + internal processing fields the collector hydrates onto
 * an admitted mention.
 */
export interface MentionEnrichment {
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
 * Enriched mention union: the admitted wire shape (discriminant intact)
 * plus hydrated source metadata. `isDishMention` narrows it exactly as it
 * narrows the wire union.
 */
export type EnrichedLLMMention =
  | (Admitted<LLMPlaceMention> & MentionEnrichment)
  | (Admitted<LLMDishMention> & MentionEnrichment);

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
  /** A few real places/dishes currently carrying this tag — grounds what
   *  the tag's filter actually returns (judge-ledger audit D2: bare 1–2
   *  word names invite plausible-sounding folds like piano bar→live
   *  music). Wire field: `used_by`. */
  usedBy?: string[];
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

export interface LLMAttributeMergeBatchInput {
  kind: 'item_attribute' | 'place_attribute';
  /** Independent pairs of LIVE attribute names; index-addressed replies.
   *  aUsedBy/bUsedBy (wire: `a_used_by`/`b_used_by`) carry a few real
   *  carriers of each tag — the D2 context-curation standard. */
  pairs: { a: string; b: string; aUsedBy?: string[]; bUsedBy?: string[] }[];
}

export interface LLMAttributeMergeVerdict {
  decision: 'merge' | 'keep';
  /** The judge's stated ground. The hearing ledger requires it — a
   *  reasonless verdict is not recorded — and the fail-closed path
   *  deliberately carries none, so an outage can never mint a ruling. */
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
  /** Restaurant(s) this candidate is served at (items/ingredients) — the
   *  HOME-RESTAURANT evidence of the D2 context standard. Wire field:
   *  `home_places`. */
  homePlaces?: string[];
  /** True when the candidate lives at the same restaurant the term was
   *  mentioned/served at (the OTOKO rule made mechanical). Wire field:
   *  `same_place`. */
  samePlace?: boolean;
}

export interface LLMEntityMatchInput {
  /** The newly-extracted entity name to resolve. */
  term: string;
  /** restaurant (a place), food (a dish), or ingredient (a component). */
  kind: 'place' | 'item' | 'ingredient';
  /** Existing entities recalled as the closest matches to `term`. */
  candidates: LLMEntityMatchCandidate[];
  /** The verbatim sentence the term was extracted from (D2 context
   *  standard — resolves reference questions the bare string cannot).
   *  Wire field: `mention`. */
  mention?: string | null;
  /** The restaurant the mention's thread was crediting. Wire field:
   *  `thread_place`. */
  threadPlace?: string | null;
  /** Sweep hearings: restaurant(s) the term's own entity is connected to.
   *  Wire field: `term_home_places`. */
  termHomePlaces?: string[];
}

export interface LLMEntityMatchResult {
  decision: 'match' | 'new' | 'reject';
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
  /** How many community mentions this place has on record in the source
   *  market — tells the judge how much weight one snippet can carry
   *  (rule v2: snippets are samples, not a census). */
  mentionCount?: number | null;
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
