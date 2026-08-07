import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryInterceptor } from './sentry.interceptor';

jest.mock('@sentry/nestjs', () => ({
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  startSpan: jest.fn((_opts: unknown, cb: () => unknown): unknown => cb()),
}));

/**
 * F2221 mutation guard: the interceptor must NEVER ship the raw request url —
 * query string included — as the `http.url` span attribute (nor in the error
 * breadcrumb). Restore `'http.url': url` (the raw value) and this REDs.
 */
describe('SentryInterceptor URL scrubbing (F2221)', () => {
  const buildContext = (method: string, url: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
      }),
    }) as unknown as ExecutionContext;

  const buildHandler = (): CallHandler => ({
    handle: () => of('ok'),
  });

  beforeEach(() => jest.clearAllMocks());

  it('strips the query string (and dynamic ids) from the http.url span attribute', async () => {
    const interceptor = new SentryInterceptor();
    const url = '/search/users/12345?token=secret-abc&q=pizza';

    await lastValueFrom(
      interceptor.intercept(buildContext('GET', url), buildHandler()),
    );

    const startSpan = Sentry.startSpan as jest.Mock;
    expect(startSpan).toHaveBeenCalledTimes(1);
    const calls = startSpan.mock.calls as unknown[][];
    const opts = calls[0][0] as {
      name: string;
      attributes: Record<string, unknown>;
    };
    const httpUrl = String(opts.attributes['http.url']);

    expect(httpUrl).not.toContain('secret-abc');
    expect(httpUrl).not.toContain('token');
    expect(httpUrl).not.toContain('?');
    expect(httpUrl).not.toContain('12345');
    expect(httpUrl).toBe('/search/users/:id');
    expect(opts.name).not.toContain('secret-abc');
  });
});
