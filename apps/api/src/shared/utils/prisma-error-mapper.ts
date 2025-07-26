import { Prisma } from '@prisma/client';
import {
  DatabaseException,
  ValidationException,
  AppException,
} from '../exceptions';
import {
  EntityNotFoundException,
  ForeignKeyConstraintException,
  UniqueConstraintException,
} from '../../repositories/base/repository.exceptions';
import { isPrismaError } from '../types/error-interfaces';

/**
 * Maps Prisma errors to appropriate application exceptions
 */
export class PrismaErrorMapper {
  /**
   * Map a Prisma error to an appropriate application exception
   */
  static mapError(
    error: any,
    entityType?: string,
    operation?: string,
  ): AppException {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapKnownRequestError(error, entityType, operation);
    }

    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      return new DatabaseException(operation || 'unknown', entityType, error, {
        type: 'PrismaClientUnknownRequestError',
        prismaError: error.message,
      });
    }

    if (error instanceof Prisma.PrismaClientRustPanicError) {
      return new DatabaseException(operation || 'unknown', entityType, error, {
        type: 'PrismaClientRustPanicError',
        prismaError: error.message,
      });
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return new ValidationException(
        'Invalid query parameters or data structure',
        {
          type: 'PrismaClientValidationError',
          entityType,
          operation,
          prismaError: error.message,
        },
      );
    }

    // Fallback for unknown Prisma errors
    return new DatabaseException(
      operation || 'unknown',
      entityType,
      error as Error,
      {
        type: (error as Error).constructor.name,
        prismaError: (error as Error).message,
      },
    );
  }

  /**
   * Map known Prisma request errors based on error code
   */
  private static mapKnownRequestError(
    error: Prisma.PrismaClientKnownRequestError,
    entityType?: string,
    operation?: string,
  ): AppException {
    const { code, meta } = error;

    switch (code) {
      case 'P2002': {
        // Unique constraint violation
        const fields = (meta?.target as string[]) || ['unknown field'];
        return new UniqueConstraintException(entityType || 'Entity', fields);
      }

      case 'P2003': {
        // Foreign key constraint violation
        const fieldName = meta?.field_name as string;
        return new ForeignKeyConstraintException(
          entityType || 'Entity',
          fieldName || 'unknown field',
          'referenced entity',
        );
      }

      case 'P2025': {
        // Record not found
        const cause = meta?.cause as string;
        return new EntityNotFoundException(
          entityType || 'Entity',
          cause || 'unknown identifier',
        );
      }

      case 'P2006': {
        // Invalid value for field
        return new ValidationException(
          `Invalid value provided for ${entityType || 'entity'} field`,
          {
            code,
            details: meta,
            operation,
          },
        );
      }

      case 'P2007': {
        // Data validation error
        return new ValidationException('Data validation failed', {
          code,
          details: meta,
          entityType,
          operation,
        });
      }

      case 'P2011': {
        // Null constraint violation
        const nullField = meta?.constraint as string;
        return new ValidationException(
          `Required field '${nullField}' cannot be null`,
          {
            code,
            field: nullField,
            entityType,
            operation,
          },
        );
      }

      case 'P2012': {
        // Missing required value
        const missingField = meta?.path as string;
        return new ValidationException(
          `Missing required value for '${missingField}'`,
          {
            code,
            field: missingField,
            entityType,
            operation,
          },
        );
      }

      case 'P2014': {
        // Invalid ID
        const invalidId = meta?.details as string;
        return new ValidationException(`Invalid ID provided: ${invalidId}`, {
          code,
          details: invalidId,
          entityType,
          operation,
        });
      }

      case 'P2015': {
        // Related record not found
        return new EntityNotFoundException(
          'Related entity',
          (meta?.details as string) || 'unknown',
        );
      }

      case 'P2016': {
        // Query interpretation error
        return new ValidationException('Query could not be interpreted', {
          code,
          details: meta,
          entityType,
          operation,
        });
      }

      case 'P2017': {
        // Records not connected
        return new ValidationException('Records are not properly connected', {
          code,
          relation: meta?.relation_name,
          entityType,
          operation,
        });
      }

      case 'P2018': {
        // Required connected records not found
        return new EntityNotFoundException(
          'Required connected entity',
          (meta?.details as string) || 'unknown',
        );
      }

      case 'P2021': {
        // Table does not exist
        const table = meta?.table as string;
        return new DatabaseException(operation || 'query', entityType, error, {
          code,
          table,
          message: `Table '${table}' does not exist`,
        });
      }

      case 'P2022': {
        // Column does not exist
        const column = meta?.column as string;
        return new DatabaseException(operation || 'query', entityType, error, {
          code,
          column,
          message: `Column '${column}' does not exist`,
        });
      }

      case 'P2024': {
        // Connection timeout
        return new DatabaseException(
          operation || 'connection',
          entityType,
          error,
          {
            code,
            message: 'Database connection timeout',
            timeout: meta?.timeout,
          },
        );
      }

      case 'P2034': {
        // Transaction failed
        return new DatabaseException(
          operation || 'transaction',
          entityType,
          error,
          {
            code,
            message: 'Transaction failed due to write conflict or deadlock',
          },
        );
      }

      default:
        // Fallback for unhandled Prisma error codes
        return new DatabaseException(
          operation || 'unknown',
          entityType,
          error,
          {
            code,
            meta,
            message: error.message,
          },
        );
    }
  }

  /**
   * Check if an error is a Prisma error
   */
  static isPrismaError(error: any): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError ||
      error instanceof Prisma.PrismaClientValidationError ||
      error instanceof Prisma.PrismaClientRustPanicError
    );
  }

  /**
   * Extract entity type from Prisma model name
   */
  static extractEntityType(modelName?: string): string {
    if (!modelName) return 'Entity';

    // Convert PascalCase to human-readable format
    return modelName
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();
  }

  /**
   * Create error context for logging
   */
  static createErrorContext(
    error: any,
    operation?: string,
    entityType?: string,
  ) {
    if (!this.isPrismaError(error)) {
      return {
        type: (error as Error).constructor.name,
        message: (error as Error).message,
        operation,
        entityType,
      };
    }

    interface ErrorContext {
      type: string;
      message: string;
      operation?: string;
      entityType?: string;
      code?: string;
      meta?: Record<string, unknown>;
    }

    const context: ErrorContext = {
      type: (error as Error).constructor.name,
      message: (error as Error).message,
      operation,
      entityType,
    };

    if (isPrismaError(error)) {
      context.code = error.code;
      context.meta = error.meta;
    }

    return context as unknown as Error;
  }
}
