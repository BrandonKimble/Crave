// Exception classes
export * from './exceptions';

// Filters
export { GlobalExceptionFilter } from './filters/global-exception.filter';

// DTOs
export { ErrorResponseDto } from './dto/error-response.dto';

// Validation
export { createValidationPipeConfig } from './pipes/validation.config';

// Decorators & types
export { CurrentUser } from './decorators/current-user.decorator';
export type { AuthenticatedRequest } from './types/authenticated-request.type';

// Logging
export { createWinstonConfig } from './logging/winston.config';
export { LoggerService, LogMetadata } from './logging/logger.interface';
export { WinstonLoggerService } from './logging/winston-logger.service';
export { LoggingInterceptor } from './logging/logging.interceptor';
export { CorrelationUtils } from './logging/correlation.utils';

// Utilities
export { TextSanitizerService } from './sanitization/text-sanitizer.service';

// Module
export { SharedModule } from './shared.module';
export { AdvisoryLockService } from './advisory-lock/advisory-lock.service';
export type { AdvisoryLockOutcome } from './advisory-lock/advisory-lock.service';
export { buildCauseChain } from './error-cause';
export { startCompletionWorkTimer } from './completion-work-timer';
export type {
  CompletionWorkTimerHandle,
  CompletionWorkTimerOptions,
} from './completion-work-timer';
