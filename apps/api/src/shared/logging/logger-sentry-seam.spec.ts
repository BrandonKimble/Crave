import 'reflect-metadata';
import * as Sentry from '@sentry/nestjs';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SharedModule } from '../shared.module';
import { LoggerService } from './logger.interface';

jest.mock('@sentry/nestjs', () => ({
  isInitialized: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

/**
 * THE crash-reporting seam spec (RED-able), bound to the WIRING.
 *
 * WHY IT IS WRITTEN THIS WAY (audit 2026-08-02, F400). The previous version of
 * this file constructed its subject with `new LoggerService(...)` against a
 * SECOND class that nothing in the app ever resolved. It was green for a year
 * while the shipped API sent Sentry nothing at all — the always-green-metric
 * disease, inside the crash reporter. So this spec resolves `LoggerService`
 * from a COMPILED SharedModule: it asserts that whatever DI actually binds to
 * that token captures to Sentry. Re-bind the token to something without
 * capture, or delete the capture call, and this suite goes red — which is the
 * only version of this test worth having.
 */
describe('LoggerService (as DI binds it) → Sentry seam', () => {
  let moduleRef: TestingModule;
  let logger: LoggerService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), SharedModule],
    }).compile();
    // Resolved from the container, NOT constructed — this is the whole point.
    logger = moduleRef.get(LoggerService).setContext('SeamSpec');
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
  });

  it('captures an Error via captureException with metadata as extra', () => {
    const err = new Error('boom');
    logger.error('cron failed', err, { operation: 'sweep' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, ctx] = (Sentry.captureException as jest.Mock).mock
      .calls[0] as [unknown, { extra: Record<string, unknown> }];
    expect(captured).toBe(err);
    expect(ctx.extra.operation).toBe('sweep');
    expect(ctx.extra.message).toBe('cron failed');
  });

  it('captures a message-only error via captureMessage at error level', () => {
    logger.error('bad state, no exception object');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'bad state, no exception object',
      expect.objectContaining({ level: 'error' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('is a strict no-op when Sentry is not initialized (no DSN)', () => {
    (Sentry.isInitialized as jest.Mock).mockReturnValue(false);
    expect(() => logger.error('boom', new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('never captures for warn/info/debug levels', () => {
    logger.warn('a warning');
    logger.info('an info');
    logger.debug('a debug');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('tags events with the logger context for triage', () => {
    logger.error('boom', new Error('boom'));
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
    expect(() => logger.error('boom', new Error('boom'))).not.toThrow();
  });

  it('the 5xx path the GlobalExceptionFilter uses reaches Sentry', () => {
    // The filter logs a server error as logger.error(message, exception, ctx).
    const exception = new Error('Database create failed for User');
    moduleRef
      .get(LoggerService)
      .error(exception.message, exception, { statusCode: 500 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
