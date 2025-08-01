/**
 * Unified Processing Exceptions
 *
 * Exception handling for unified processing integration following established patterns
 * from existing codebase infrastructure.
 */

import { AppException } from '../../../shared/exceptions';
import { HttpStatus } from '@nestjs/common';

/**
 * Base exception for unified processing operations
 */
export abstract class UnifiedProcessingException extends AppException {
  abstract readonly errorCode: string;
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, metadata, cause);
  }
}

/**
 * Exception for LLM integration failures
 */
export class LLMIntegrationException extends UnifiedProcessingException {
  readonly errorCode = 'LLM_INTEGRATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(`LLM Integration: ${message}`, cause, {
      ...metadata,
      component: 'llm_integration',
    });
  }
}

/**
 * Exception for entity processing failures
 */
export class EntityProcessingException extends UnifiedProcessingException {
  readonly errorCode = 'ENTITY_PROCESSING_ERROR';
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(`Entity Processing: ${message}`, cause, {
      ...metadata,
      component: 'entity_processing',
    });
  }
}

/**
 * Exception for database integration failures
 */
export class DatabaseIntegrationException extends UnifiedProcessingException {
  readonly errorCode = 'DATABASE_INTEGRATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(`Database Integration: ${message}`, cause, {
      ...metadata,
      component: 'database_integration',
    });
  }
}

/**
 * Exception for data conversion failures
 */
export class DataConversionException extends UnifiedProcessingException {
  readonly errorCode = 'DATA_CONVERSION_ERROR';
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(`Data Conversion: ${message}`, cause, {
      ...metadata,
      component: 'data_conversion',
    });
  }
}

/**
 * Exception for quality score integration failures
 */
export class QualityScoreIntegrationException extends UnifiedProcessingException {
  readonly errorCode = 'QUALITY_SCORE_INTEGRATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, cause?: Error, metadata?: Record<string, any>) {
    super(`Quality Score Integration: ${message}`, cause, {
      ...metadata,
      component: 'quality_score_integration',
    });
  }
}

/**
 * Factory for creating unified processing exceptions
 * Follows established exception factory patterns from existing codebase
 */
export class UnifiedProcessingExceptionFactory {
  static createProcessingFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): LLMIntegrationException {
    return new LLMIntegrationException(message, cause, metadata);
  }

  static createLLMIntegrationFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): LLMIntegrationException {
    return new LLMIntegrationException(message, cause, metadata);
  }

  static createEntityProcessingFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): EntityProcessingException {
    return new EntityProcessingException(message, cause, metadata);
  }

  static createDatabaseIntegrationFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): DatabaseIntegrationException {
    return new DatabaseIntegrationException(message, cause, metadata);
  }

  static createDataConversionFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): DataConversionException {
    return new DataConversionException(message, cause, metadata);
  }

  static createQualityScoreIntegrationFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): QualityScoreIntegrationException {
    return new QualityScoreIntegrationException(message, cause, metadata);
  }

  static createEntityExtractionFailed(
    message: string,
    cause?: Error,
    metadata?: Record<string, any>,
  ): EntityProcessingException {
    return new EntityProcessingException(
      `Entity Extraction: ${message}`,
      cause,
      {
        ...metadata,
        operation: 'entity_extraction',
      },
    );
  }
}
