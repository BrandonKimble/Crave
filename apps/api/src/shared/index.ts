// Exception classes
export * from './exceptions';

// Filters
export { GlobalExceptionFilter } from './filters/global-exception.filter';

// DTOs
export { ErrorResponseDto } from './dto/error-response.dto';

// Validation
export { createValidationPipeConfig } from './pipes/validation.config';
export * from './pipes/custom-validators';

// Logging
export {
  createWinstonConfig,
  requestLoggingConfig,
} from './logging/winston.config';
export { LoggerService, LogMetadata } from './logging/logger.interface';
export { WinstonLoggerService } from './logging/winston-logger.service';
export { LoggingInterceptor } from './logging/logging.interceptor';
export { CorrelationUtils } from './logging/correlation.utils';

// Utilities
export { PrismaErrorMapper } from './utils/prisma-error-mapper';

// Module
export { SharedModule } from './shared.module';
