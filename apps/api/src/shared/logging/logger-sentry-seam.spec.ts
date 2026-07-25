import 'reflect-metadata';
import * as Sentry from '@sentry/nestjs';
import { LoggerService } from './logger.service';

jest.mock('@sentry/nestjs', () => ({
  isInitialized: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

/**
 * THE crash-reporting seam spec (RED-able): LoggerService.error is the single
 * place API errors reach Sentry — HTTP 500s (GlobalExceptionFilter logs
 * there), cron catches, boot failures. These specs prove capture actually
 * fires (and stays silent when Sentry is off / for non-error levels), so a
 * refactor that severs the seam turns the suite red instead of silently
 * blinding production crash reporting.
 */
describe('LoggerService → Sentry seam', () => {
  const winston = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
    child: jest.fn(),
  };
  const build = () => new LoggerService(winston as never, 'SeamSpec');

  beforeEach(() => {
    jest.clearAllMocks();
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
  });

  it('captures an Error via captureException with metadata as extra', () => {
    const err = new Error('boom');
    build().error('cron failed', err, { operation: 'sweep' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, ctx] = (Sentry.captureException as jest.Mock).mock
      .calls[0] as [unknown, { extra: Record<string, unknown> }];
    expect(captured).toBe(err);
    expect(ctx.extra.operation).toBe('sweep');
    expect(ctx.extra.message).toBe('cron failed');
  });

  it('captures a message-only error via captureMessage at error level', () => {
    build().error('bad state, no exception object');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'bad state, no exception object',
      expect.objectContaining({ level: 'error' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('is a strict no-op when Sentry is not initialized (no DSN)', () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(false);
    build().error('boom', new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    // The winston log still happens — Sentry off never mutes logging.
    expect(winston.error).toHaveBeenCalled();
  });

  it('never captures for warn/info/debug levels', () => {
    const logger = build();
    logger.warn('a warning');
    logger.info('an info');
    logger.debug('a debug');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('tags events with the logger context for triage', () => {
    build().error('boom', new Error('boom'));
    const [, ctx] = (Sentry.captureException as jest.Mock).mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(ctx.tags.logger_context).toBe('SeamSpec');
  });

  it('survives a throwing Sentry client (capture must never crash the app)', () => {
    (Sentry.captureException as jest.Mock).mockImplementation(() => {
      throw new Error('sentry down');
    });
    expect(() => build().error('boom', new Error('boom'))).not.toThrow();
    expect(winston.error).toHaveBeenCalled();
  });
});
