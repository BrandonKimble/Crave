/**
 * Historical LLM Integration Exports
 *
 * Provides integration components that bridge historical archive processing
 * with existing M02 LLM processing pipeline.
 *
 * Implements PRD Section 5.1.1 and 6.1 integration requirements.
 */

// Core integration adapter
export { HistoricalLlmIntegrationAdapter } from './historical-llm-integration.adapter';
export type { HistoricalLlmIntegrationConfig } from './historical-llm-integration.adapter';
export { HistoricalLlmIntegrationError } from './historical-llm-integration.adapter';

// Configuration management
export { HistoricalLlmIntegrationConfigService } from './historical-llm-integration.config';
export type {
  HistoricalLlmIntegrationConfig as DetailedIntegrationConfig,
  HistoricalDataRoutingConfig,
  HistoricalErrorHandlingConfig,
} from './historical-llm-integration.config';
export {
  DEFAULT_HISTORICAL_LLM_INTEGRATION_CONFIG,
  DEFAULT_HISTORICAL_DATA_ROUTING_CONFIG,
  DEFAULT_HISTORICAL_ERROR_HANDLING_CONFIG,
} from './historical-llm-integration.config';

// Validation services
export { HistoricalLlmIntegrationValidator } from './historical-llm-integration.validator';
export type {
  ValidationResult,
  ValidationIssue,
  ValidationSummary,
} from './historical-llm-integration.validator';

/**
 * Re-export historical content pipeline types for convenience
 */
export type {
  HistoricalContentBatch,
  CraveRedditSubmission,
  CraveRedditComment,
  HistoricalProcessingConfig,
} from './historical-content-pipeline.types';

/**
 * Re-export LLM types for integration
 */
export type {
  LLMInputStructure,
  LLMOutputStructure,
  LLMMention,
  LLMPost,
  LLMComment,
} from '../../external-integrations/llm/llm.types';
