import { EntityType } from '@prisma/client';

/**
 * Entity resolution interfaces for the three-tier resolution system
 * Implements PRD Section 5.2.1 - Resolution Process Flow
 */

/**
 * Input entity for resolution with normalized data and context
 */
export interface EntityResolutionInput {
  tempId: string;
  normalizedName: string;
  originalText: string;
  entityType: EntityType;
  aliases?: string[];
  /** §13 territory-as-retrieval-prior: the batch's SOURCE engine (collection
   *  provenance) — geo-biases restaurant recall via the engine's territory
   *  grounds. null = no covering engine (global; poll-surface threads and
   *  identity remain global either way). Never a market key. */
  engineId?: string | null;
  /**
   * The language of the SOURCE DOCUMENT this mention was read out of
   * (`collection_source_documents.language`, stamped from the community's
   * declaration). It scopes which `entity_surface` rows the mention may
   * ground through: `localeLookupChain(documentLocale)` — the document's own
   * language plus the universal 'und' slice, never another language's.
   *
   * Absent/null = locale-less caller (query-time linking, poll seeding). The
   * chain is then `['und']`, which is byte-for-byte the und-only scope the
   * tiers hard-coded before, so nothing about those callers changes.
   */
  documentLocale?: string | null;
}

/**
 * Resolution result with confidence scoring
 * Updated for PRD approach - pure matching with transaction creation support
 */
export interface EntityResolutionResult {
  tempId: string;
  entityId: string | null;
  /** Tie plurality (query-time linker only): when several same-tier candidates
   *  are indistinguishable within epsilon, ALL of them — the caller reveals the
   *  set (one OR-filter group) instead of trusting a silent argmax. entityId
   *  stays the first for single-id consumers. */
  entityIds?: string[];
  confidence: number;
  /** 'dense' = admitted by the M4 dense tier (multilingual): semantic
   *  evidence only, gated on the ABSENCE of any lexical evidence. It is
   *  its own tier so a cross-lingual link is never laundered as a
   *  lexical 'fuzzy' in the ledgers or the diagnostics. */
  resolutionTier: 'exact' | 'alias' | 'fuzzy' | 'dense' | 'new' | 'unmatched';
  /** Query-time maximal linking: this result is the DECOMPOSED reading of a
   *  compound span (the part, not the whole). Consumers section it at
   *  match tier 1; the compound itself stays tier 0. Never set by
   *  content-processing resolution. */
  decomposed?: boolean;
  matchedName?: string;
  originalInput: EntityResolutionInput;

  // Additional fields for transaction-based entity creation (PRD approach)
  isNewEntity?: boolean; // Flag indicating entity needs creation in transaction
  entityType?: EntityType; // Entity type for transaction creation
  normalizedName?: string; // Normalized name for transaction creation
  validatedAliases?: string[]; // Validated aliases for transaction creation
  primaryTempId?: string; // When duplicate of another new entity within same batch
}

/**
 * Batch processing result with ID mapping
 */
export interface BatchResolutionResult {
  tempIdToEntityIdMap: Map<string, string>;
  resolutionResults: EntityResolutionResult[];
  newEntitiesCreated: number;
  performanceMetrics: ResolutionPerformanceMetrics;
}

/**
 * Performance metrics for resolution operations
 */
export interface ResolutionPerformanceMetrics {
  totalProcessed: number;
  exactMatches: number;
  aliasMatches: number;
  fuzzyMatches: number;
  newEntitiesCreated: number;
  processingTimeMs: number;
}

/**
 * Resolution configuration options
 */
export interface EntityResolutionConfig {
  batchSize: number; // Number of entities to process in each batch
  enableFuzzyMatching: boolean; // Gate for Tier 3 (recall → LLM matcher)
  allowEntityCreation: boolean; // Toggle creation of new entities for unmatched inputs
  /**
   * Opt this consumer's Tier 3 into the recall → LLM-as-matcher path. OFF by
   * default — only the offline ingestion path sets it, so query-time callers
   * (autocomplete fallback, search interpretation) get exact+alias only and
   * never pay the per-entity LLM latency.
   */
  useLlmMatcher?: boolean;
}
