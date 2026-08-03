import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base application exception class that all custom exceptions should extend.
 * Provides consistent error handling across the entire application.
 */
export abstract class AppException extends HttpException {
  abstract readonly errorCode: string;

  constructor(
    message: string,
    status: HttpStatus,
    public readonly context?: Record<string, any>,
    cause?: Error,
  ) {
    super(message, status, { cause });
  }

  /**
   * The message a production client is allowed to see.
   *
   * A 5xx MESSAGE IS NEVER SHOWN IN PROD (audit 2026-08-02, F422). This used
   * to read `isProd && !this.isOperational`, gated on an abstract
   * `isOperational` boolean each subclass declared for itself. A census found
   * 22 declarations, ALL `= true`, and zero `false` — every author defaulted
   * to the permissive, working-looking value — so the redaction branch was
   * unreachable and prod callers received `Database create failed for User`
   * and `Gemini service error during generateContent` verbatim. A TYPED
   * exception was LESS redacted than an untyped one, whose message the very
   * next branch of the filter carefully replaces.
   *
   * Whether a message is safe to show a client is a property of the MESSAGE,
   * not of the class. The fact the filter actually needs — "is this a 5xx" —
   * is already carried by the status, which is why `logError` was rewritten to
   * level "by STATUS, never by exception class". This matches it. An exception
   * that genuinely wants a client-visible 5xx message (none today) opts in
   * explicitly with a `clientMessage`, a positive assertion rather than a
   * forgotten negative.
   */
  getClientSafeMessage(isProd = false): string {
    if (isProd && this.getStatus() >= 500) {
      return 'An internal error occurred';
    }
    return this.message;
  }

  /**
   * Get full error context for logging
   */
  getLogContext(): Record<string, any> {
    return {
      errorCode: this.errorCode,
      status: this.getStatus(),
      context: this.context,
      stack: this.stack,
    };
  }
}
