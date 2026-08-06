/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import 'reflect-metadata';
import { of, firstValueFrom } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';
import { LoggerService } from './logger.interface';

/**
 * F408 lockdown: the request-log userId must come from the VERIFIED
 * request.user.userId (set by ClerkAuthGuard), never from an unverified
 * base64 decode of the raw JWT payload.
 *
 * Before the fix, `extractUserIdFromToken` decoded whatever `sub`/`userId`
 * an attacker put in an unsigned/forged bearer token and stamped it into
 * the request log context — audit-trail forgery. This spec proves: (a) a
 * forged bearer token contributes NOTHING to the logged userId, and (b) the
 * verified `request.user.userId` IS what gets logged.
 */
describe('LoggingInterceptor userId provenance (F408)', () => {
  const httpSpy = jest.fn();
  const logger = {
    setContext: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: httpSpy,
    database: jest.fn(),
    performance: jest.fn(),
    audit: jest.fn(),
    child: jest.fn(),
  } as unknown as LoggerService;

  const forgedToken = () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user_attacker_forged' }),
    ).toString('base64');
    return `x.${payload}.x`;
  };

  const context = (
    requestExtra: Record<string, unknown> = {},
  ): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/v1/restaurants',
          headers: { authorization: `Bearer ${forgedToken()}` },
          ip: '127.0.0.1',
          query: {},
          params: {},
          ...requestExtra,
        }),
        getResponse: () => ({
          header: jest.fn(),
          statusCode: 200,
          getHeader: jest.fn(),
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('does NOT log the userId from a forged/unverified bearer token', async () => {
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await firstValueFrom(
      new LoggingInterceptor(logger).intercept(context(), next),
    );

    expect(httpSpy).toHaveBeenCalled();
    const requestLogCall = httpSpy.mock.calls.find((c) =>
      String(c[0]).startsWith('Incoming'),
    );
    expect(requestLogCall).toBeDefined();
    const meta = requestLogCall![5] as Record<string, unknown>;
    expect(meta.userId).not.toBe('user_attacker_forged');
    expect(meta.userId).toBeUndefined();
  });

  it('DOES log the verified request.user.userId when a guard has set it', async () => {
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await firstValueFrom(
      new LoggingInterceptor(logger).intercept(
        context({ user: { userId: 'user_verified_real' } }),
        next,
      ),
    );

    const requestLogCall = httpSpy.mock.calls.find((c) =>
      String(c[0]).startsWith('Incoming'),
    );
    const meta = requestLogCall![5] as Record<string, unknown>;
    expect(meta.userId).toBe('user_verified_real');
  });
});
