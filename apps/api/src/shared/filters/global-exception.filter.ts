import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
// TODO: Import proper Fastify types when available
// Using any types for now to resolve compilation issues
import { ConfigService } from '@nestjs/config';
import { AppException } from '../exceptions/app-exception.base';
import { ErrorResponseDto } from '../dto/error-response.dto';
import { LoggerService, CorrelationUtils } from '../../shared';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerService;
  private readonly isProd: boolean;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('GlobalExceptionFilter');
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<any>();
    const response = ctx.getResponse<any>();

    // Get or generate correlation ID for request tracing
    const correlationId =
      CorrelationUtils.getCorrelationId() ||
      this.generateCorrelationId(request);

    // Determine error details
    const errorDetails = this.extractErrorDetails(exception, correlationId);

    // Log the error with full context
    this.logError(exception, request, correlationId, errorDetails);

    // Create formatted error response
    const errorResponse: ErrorResponseDto = {
      statusCode: errorDetails.status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      errorCode: errorDetails.errorCode,
      message: errorDetails.message,
      correlationId,
      ...(errorDetails.details && { details: errorDetails.details }),
    };

    // Send error response
    response.status(errorDetails.status).send(errorResponse);
  }

  private extractErrorDetails(exception: unknown, correlationId: string) {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        errorCode: exception.errorCode,
        message: exception.getClientSafeMessage(this.isProd),
        details: this.isProd ? undefined : exception.context,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as any)?.message || exception.message;

      return {
        status: exception.getStatus(),
        errorCode: 'HTTP_EXCEPTION',
        message: Array.isArray(message) ? message.join(', ') : message,
        details: this.isProd
          ? undefined
          : typeof response === 'object'
            ? response
            : undefined,
      };
    }

    // Handle Prisma errors
    if (this.isPrismaError(exception)) {
      return this.handlePrismaError(exception as any);
    }

    // Handle unexpected errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_ERROR',
      message: this.isProd
        ? 'An internal error occurred'
        : (exception as Error)?.message || 'Unknown error',
      details: this.isProd ? undefined : { type: typeof exception },
    };
  }

  private isPrismaError(exception: unknown): boolean {
    return exception instanceof Error && exception.name?.includes('Prisma');
  }

  private handlePrismaError(error: any) {
    const code = error.code;

    // Map common Prisma error codes
    switch (code) {
      case 'P2002': // Unique constraint violation
        return {
          status: HttpStatus.CONFLICT,
          errorCode: 'UNIQUE_CONSTRAINT_ERROR',
          message: 'A record with this data already exists',
          details: this.isProd ? undefined : { fields: error.meta?.target },
        };

      case 'P2025': // Record not found
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: 'RECORD_NOT_FOUND',
          message: 'The requested record was not found',
          details: this.isProd ? undefined : error.meta,
        };

      case 'P2003': // Foreign key constraint violation
        return {
          status: HttpStatus.BAD_REQUEST,
          errorCode: 'FOREIGN_KEY_ERROR',
          message: 'Referenced record does not exist',
          details: this.isProd ? undefined : { field: error.meta?.field_name },
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: 'DATABASE_ERROR',
          message: this.isProd ? 'Database operation failed' : error.message,
          details: this.isProd ? undefined : { code, meta: error.meta },
        };
    }
  }

  private generateCorrelationId(request: any): string {
    // Check if correlation ID already exists in headers
    const existingId = request.headers['x-correlation-id'] as string;
    if (existingId) return existingId;

    // Generate new correlation ID
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private logError(
    exception: unknown,
    request: any,
    correlationId: string,
    errorDetails: any,
  ) {
    const logContext = {
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      statusCode: errorDetails.status,
      errorCode: errorDetails.errorCode,
    };

    if (exception instanceof AppException) {
      // Log operational errors at warn level
      this.logger.warn(exception.message, {
        ...logContext,
        ...exception.getLogContext(),
      });
    } else if (exception instanceof HttpException) {
      // Log HTTP exceptions at warn level
      this.logger.warn(exception.message, {
        ...logContext,
        stack: exception.stack,
      });
    } else {
      // Log unexpected errors at error level with full stack trace
      this.logger.error(
        'Unhandled exception occurred',
        exception instanceof Error ? exception : new Error(String(exception)),
        {
          ...logContext,
        },
      );
    }
  }
}
