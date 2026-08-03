import 'reflect-metadata';
import { of, throwError, firstValueFrom } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';
import { LoggerService } from './logger.interface';

/**
 * F407 lockdown: the interceptor is NOT an error logger.
 *
 * WHY. It used to call logger.error() for any exception, and GlobalException
 * Filter logged the SAME exception again — twice per failed request, and the
 * interceptor's copy had no status branch, so a 404 was emitted at ERROR
 * level. Since error level is the Sentry capture seam (F400), that meant every
 * 404 would become a metered Sentry event. The filter owns severity because it
 * is the only place that knows the status.
 */
describe('LoggingInterceptor error path', () => {
  const errorSpy = jest.fn();
  const warnSpy = jest.fn();
  const httpSpy = jest.fn();
  const logger = {
    setContext: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: warnSpy,
    error: errorSpy,
    http: httpSpy,
    database: jest.fn(),
    performance: jest.fn(),
    audit: jest.fn(),
    child: jest.fn(),
  } as unknown as LoggerService;

  const context = (): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/v1/restaurants/does-not-exist',
          headers: {},
          ip: '127.0.0.1',
          query: {},
          params: {},
        }),
        getResponse: () => ({
          header: jest.fn(),
          statusCode: 200,
          getHeader: jest.fn(),
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('does not log a thrown exception at ANY level (the filter does)', async () => {
    const boom = new Error('Not Found');
    const next: CallHandler = { handle: () => throwError(() => boom) };

    await expect(
      firstValueFrom(new LoggingInterceptor(logger).intercept(context(), next)),
    ).rejects.toBe(boom);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still propagates the exception unchanged to the filter', async () => {
    const boom = new Error('propagate me');
    const next: CallHandler = { handle: () => throwError(() => boom) };
    await expect(
      firstValueFrom(new LoggingInterceptor(logger).intercept(context(), next)),
    ).rejects.toBe(boom);
  });

  it('still logs successful responses at http level', async () => {
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await firstValueFrom(
      new LoggingInterceptor(logger).intercept(context(), next),
    );
    expect(httpSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
