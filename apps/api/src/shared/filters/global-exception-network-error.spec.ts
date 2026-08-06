/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggerService } from '../../shared';

/**
 * F423: `isPrismaError` used to duck-type on `{code, message}`, which also
 * matches Node system errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT) and most
 * vendor SDK errors — misclassifying a network failure as DATABASE_ERROR in
 * every HTTP response. This proves the fix: a genuine network error is no
 * longer routed through `handlePrismaError`, and a real Prisma error still is.
 */
describe('GlobalExceptionFilter error classification (F423)', () => {
  function buildFilter(): GlobalExceptionFilter {
    const loggerService = {
      setContext: jest.fn().mockReturnValue({
        error: jest.fn(),
        warn: jest.fn(),
        log: jest.fn(),
      }),
    } as unknown as LoggerService;
    const configService = {
      get: jest.fn(),
    } as unknown as ConfigService;
    const filter = new GlobalExceptionFilter(configService, loggerService);
    filter.onModuleInit();
    return filter;
  }

  it('does NOT classify a network error (code+message, not a Prisma instance) as DATABASE_ERROR', () => {
    const filter = buildFilter();
    const networkError: unknown = Object.assign(
      new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      {
        code: 'ECONNREFUSED',
        errno: -61,
        syscall: 'connect',
      },
    );

    const details = (filter as any).extractErrorDetails(networkError);

    expect(details.errorCode).not.toBe('DATABASE_ERROR');
    expect(details.status).toBe(500);
    expect(details.errorCode).toBe('ECONNREFUSED');
  });

  it('still classifies a genuine Prisma known-request error as DATABASE_ERROR (P2002 -> UNIQUE_CONSTRAINT_ERROR)', () => {
    const filter = buildFilter();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.4.1', meta: { target: ['email'] } },
    );

    const details = (filter as any).extractErrorDetails(prismaError);

    expect(details.errorCode).toBe('UNIQUE_CONSTRAINT_ERROR');
  });
});
