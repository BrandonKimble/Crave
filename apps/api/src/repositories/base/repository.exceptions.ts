import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../shared/exceptions/app-exception.base';

/**
 * Base repository exception class
 */
export abstract class RepositoryException extends AppException {
  abstract readonly errorCode: string;
  readonly isOperational = true;

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    context?: Record<string, any>,
    cause?: Error,
  ) {
    super(message, status, context, cause);
  }
}

/**
 * Exception thrown when entity is not found
 */
export class EntityNotFoundException extends RepositoryException {
  readonly errorCode = 'ENTITY_NOT_FOUND';

  constructor(entityType: string, identifier: string | object) {
    const id =
      typeof identifier === 'string' ? identifier : JSON.stringify(identifier);
    super(
      `${entityType} with identifier ${id} not found`,
      HttpStatus.NOT_FOUND,
      { entityType, identifier },
    );
  }
}

/**
 * Exception thrown when attempting to create entity that already exists
 */
export class EntityAlreadyExistsException extends RepositoryException {
  readonly errorCode = 'ENTITY_ALREADY_EXISTS';

  constructor(entityType: string, identifier: string | object) {
    const id =
      typeof identifier === 'string' ? identifier : JSON.stringify(identifier);
    super(
      `${entityType} with identifier ${id} already exists`,
      HttpStatus.CONFLICT,
      { entityType, identifier },
    );
  }
}

/**
 * Exception thrown when database operation fails
 */
export class DatabaseOperationException extends RepositoryException {
  readonly errorCode = 'DATABASE_OPERATION_ERROR';

  constructor(operation: string, entityType: string, originalError: Error) {
    super(
      `Database ${operation} operation failed for ${entityType}: ${originalError.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { operation, entityType, originalError },
    );
  }
}

/**
 * Exception thrown when validation fails before database operation
 */
export class ValidationException extends RepositoryException {
  readonly errorCode = 'REPOSITORY_VALIDATION_ERROR';

  constructor(entityType: string, validationErrors: string[]) {
    super(
      `Validation failed for ${entityType}: ${validationErrors.join(', ')}`,
      HttpStatus.BAD_REQUEST,
      { entityType, validationErrors },
    );
  }
}

/**
 * Exception thrown when foreign key constraint is violated
 */
export class ForeignKeyConstraintException extends RepositoryException {
  readonly errorCode = 'FOREIGN_KEY_CONSTRAINT_ERROR';

  constructor(
    entityType: string,
    foreignKey: string,
    referencedEntity: string,
  ) {
    super(
      `Foreign key constraint violated for ${entityType}: ${foreignKey} references non-existent ${referencedEntity}`,
      HttpStatus.BAD_REQUEST,
      { entityType, foreignKey, referencedEntity },
    );
  }
}

/**
 * Exception thrown when unique constraint is violated
 */
export class UniqueConstraintException extends RepositoryException {
  readonly errorCode = 'UNIQUE_CONSTRAINT_ERROR';

  constructor(entityType: string, fields: string[]) {
    super(
      `Unique constraint violated for ${entityType} on fields: ${fields.join(', ')}`,
      HttpStatus.CONFLICT,
      { entityType, fields },
    );
  }
}
