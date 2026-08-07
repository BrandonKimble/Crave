import { WinstonLoggerService } from './winston-logger.service';

/**
 * F2603 mutation guard: the winston logger's metadata sanitizer must be
 * cycle/depth bounded. It used a hand-rolled recursion with NO seen-set or
 * depth cap, so a self-referential object (a Fastify request/reply, a Prisma
 * client, an Axios error passed as `{ context }`) stack-overflowed OUT of the
 * logger into the caller — aborting the very request the log line described.
 * Revert `sanitizeMetadata` to the old `sanitizeNestedObject` recursion and
 * this spec REDs with `RangeError: Maximum call stack size exceeded`.
 */
describe('WinstonLoggerService cyclic metadata (F2603)', () => {
  const buildLogger = (): WinstonLoggerService => {
    const configService = {
      get: (): string => 'test',
    };
    return new WinstonLoggerService(configService as never);
  };

  const cyclic = (): Record<string, unknown> => {
    const a: Record<string, unknown> = { name: 'root' };
    a.self = a;
    const child: Record<string, unknown> = { parent: a };
    a.child = child;
    return a;
  };

  it('does not throw/overflow when a self-referential object is logged', () => {
    const logger = buildLogger();
    expect(() => logger.warn('cyclic payload', cyclic())).not.toThrow();
    expect(() => logger.info('cyclic payload', cyclic())).not.toThrow();
    expect(() => logger.debug('cyclic payload', cyclic())).not.toThrow();
    expect(() =>
      logger.error('cyclic payload', new Error('boom'), cyclic()),
    ).not.toThrow();
  });

  it('still redacts sensitive keys inside a bounded (non-cyclic) graph', () => {
    const logger = buildLogger();
    // Capture what actually reaches the winston transport layer.
    const written: Record<string, unknown>[] = [];
    const internalLogger = (
      logger as unknown as {
        logger: { log: (...args: unknown[]) => void };
      }
    ).logger;
    internalLogger.log = (...args: unknown[]): void => {
      written.push(args[2] as Record<string, unknown>);
    };

    logger.warn('with secret', {
      apiKey: 'sk-live-123',
      nested: { accessToken: 'tok-abc', keep: 'visible' },
    });

    const meta = written[0];
    expect(meta.apiKey).toBe('[REDACTED]');
    const nested = meta.nested as Record<string, unknown>;
    expect(nested.accessToken).toBe('[REDACTED]');
    expect(nested.keep).toBe('visible');
  });
});
