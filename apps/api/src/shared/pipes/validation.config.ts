import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ValidationException } from '../exceptions';

/**
 * Enhanced validation configuration with security and error handling improvements
 */
export function createValidationPipeConfig(isProd = false): ValidationPipe {
  return new ValidationPipe({
    // Security settings
    whitelist: true, // Strip properties not in DTO
    forbidNonWhitelisted: true, // Reject requests with unknown properties
    forbidUnknownValues: true, // Reject unknown values in known properties

    // Transformation settings
    transform: true, // Transform payloads to DTO instances
    transformOptions: {
      enableImplicitConversion: false, // Require explicit type conversion for security
      excludeExtraneousValues: true, // Remove extra values during transformation
    },

    // Error handling
    disableErrorMessages: isProd, // Hide detailed validation errors in production
    stopAtFirstError: isProd, // Stop validation on first error in production

    // Validation error configuration
    validationError: {
      target: false, // Don't include target object in errors (security)
      value: false, // Don't include invalid value in errors (security)
    },

    // Custom exception factory for consistent error responses
    exceptionFactory: (validationErrors: ValidationError[]) => {
      const errorMessages = extractValidationMessages(validationErrors);
      return new ValidationException(errorMessages, {
        validationErrors: isProd ? undefined : validationErrors,
      });
    },
  });
}

/**
 * Extract human-readable error messages from validation errors
 */
function extractValidationMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }

    // Handle nested validation errors
    if (error.children && error.children.length > 0) {
      const nestedMessages = extractValidationMessages(error.children);
      messages.push(...nestedMessages.map((msg) => `${error.property}.${msg}`));
    }
  }

  return messages;
}

/**
 * Custom validation decorators for enhanced security
 */
export * from './custom-validators';
