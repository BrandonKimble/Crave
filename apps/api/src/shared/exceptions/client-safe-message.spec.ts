import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.base';
import * as exceptions from './index';

/**
 * PROD NEVER SEES A 5xx MESSAGE (audit 2026-08-02, F422).
 *
 * `getClientSafeMessage` used to redact on `isProd && !isOperational`, and a
 * census of every subclass found 22 `isOperational = true` and zero `false` —
 * so the branch was unreachable and production callers were handed
 * `Database create failed for User` and `Gemini service error during
 * generateContent` verbatim. The flag is deleted; redaction now keys on the
 * status, exactly like the untyped-error path in GlobalExceptionFilter and
 * exactly like `logError`'s "by STATUS, never by exception class".
 */
describe('AppException.getClientSafeMessage', () => {
  class Server5xx extends AppException {
    readonly errorCode = 'TEST_5XX';
    constructor() {
      super(
        'Database create failed for User',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  class Client4xx extends AppException {
    readonly errorCode = 'TEST_4XX';
    constructor() {
      super('Poll not found', HttpStatus.NOT_FOUND);
    }
  }

  it('redacts a 5xx message in prod — the exact leak F422 found', () => {
    expect(new Server5xx().getClientSafeMessage(true)).toBe(
      'An internal error occurred',
    );
    expect(new Server5xx().getClientSafeMessage(true)).not.toContain(
      'Database',
    );
  });

  it('still shows the 5xx message outside prod (debugging is the point)', () => {
    expect(new Server5xx().getClientSafeMessage(false)).toBe(
      'Database create failed for User',
    );
  });

  it('never redacts a 4xx — the client caused it and must be told', () => {
    expect(new Client4xx().getClientSafeMessage(true)).toBe('Poll not found');
  });

  it('the deleted flag cannot come back as a per-class opt-out', () => {
    // A boolean every author sets to the permissive value is not a
    // discriminator. If a future exception needs a client-visible 5xx message
    // it opts in with an explicit `clientMessage`, not by re-declaring this.
    expect('isOperational' in new Server5xx()).toBe(false);
    expect(new Server5xx().getLogContext()).not.toHaveProperty('isOperational');
  });

  it('EVERY real 5xx exception in the codebase redacts in prod', () => {
    // Whole-module sweep, not a hand-picked list: the original defect was
    // "the classes someone thought of" all defaulting the same wrong way.
    const built: string[] = [];
    for (const Ctor of Object.values(exceptions)) {
      if (
        typeof Ctor !== 'function' ||
        !(Ctor.prototype instanceof AppException)
      ) {
        continue;
      }
      let instance: AppException;
      try {
        instance = new (Ctor as new (...args: unknown[]) => AppException)(
          'op',
          'Entity',
        );
      } catch {
        continue; // constructor needs a shape this sweep can't fabricate
      }
      if (instance.getStatus() < 500) continue;
      built.push(Ctor.name);
      expect(instance.getClientSafeMessage(true)).toBe(
        'An internal error occurred',
      );
    }
    // The sweep must actually have swept something — an empty loop is a
    // green metric that cannot show red.
    expect(built.length).toBeGreaterThan(0);
  });
});
