import { Body, Controller, Get, Post } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Debug Controller for testing Sentry and other integrations
 *
 * This controller is ONLY for development/testing purposes.
 * In production, these endpoints should be disabled or protected.
 *
 * Endpoints:
 * - GET /debug/sentry-test - Triggers a test error to verify Sentry
 * - POST /debug/sentry-message - Sends a test message to Sentry
 */
@Controller('debug')
export class DebugController {
  /**
   * Trigger a test error to verify Sentry is working
   *
   * Usage: curl http://localhost:3000/api/debug/sentry-test
   *
   * This will:
   * 1. Throw an error that gets captured by Sentry
   * 2. You should see it in Sentry dashboard within a few seconds
   */
  @Get('sentry-test')
  triggerSentryTestError(): never {
    // Add breadcrumb for debugging
    Sentry.addBreadcrumb({
      category: 'debug',
      message: 'User triggered Sentry test error',
      level: 'info',
    });

    // This will be captured by Sentry
    throw new Error(
      'Sentry Test Error - This is a test error to verify Sentry integration is working! 🎉',
    );
  }

  /**
   * Send a test message to Sentry (not an error)
   * Useful for testing that messages are being captured
   */
  @Post('sentry-message')
  async sendSentryTestMessage(
    @Body() body?: { message?: string },
  ): Promise<{ status: string; message: string; flushed: boolean }> {
    const message =
      body?.message?.trim() || 'Sentry Test Message - Integration verified!';

    Sentry.captureMessage(message, {
      level: 'info',
      tags: {
        test: 'true',
        source: 'debug-controller',
      },
    });

    const flushed = await Sentry.flush(2000);

    return {
      status: 'ok',
      message: 'Test message sent to Sentry. Check your Sentry dashboard!',
      flushed,
    };
  }

  /**
   * Trigger an unhandled promise rejection
   * Tests async error handling
   */
  @Get('sentry-async-error')
  async triggerAsyncError(): Promise<never> {
    Sentry.addBreadcrumb({
      category: 'debug',
      message: 'User triggered async Sentry test error',
      level: 'info',
    });

    // Simulate async operation that fails
    await new Promise((resolve) => setTimeout(resolve, 100));

    throw new Error('Sentry Async Test Error - Testing async error capture!');
  }

  /**
   * Call an undefined function to test real-world error scenarios
   */
  @Get('undefined-function')
  triggerUndefinedFunction(): never {
    Sentry.addBreadcrumb({
      category: 'debug',
      message: 'User triggered undefined function test',
      level: 'info',
    });

    // This mimics the myUndefinedFunction() test from Sentry docs
    const undefinedFn = undefined as unknown as () => never;
    return undefinedFn();
  }
}
