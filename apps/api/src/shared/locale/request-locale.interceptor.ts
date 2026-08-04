import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import {
  resolveRequestLocale,
  type LocaleAwareRequest,
} from './request-locale';

/**
 * M1 — primes `request.craveLocale` for every HTTP request, AFTER the guards
 * have attached `request.user` (so D4's profile override is visible) and
 * BEFORE the handler runs.
 *
 * It exists so that a service reading the raw request — and the response
 * header below — see the same negotiated value the `@RequestLocale()`
 * decorator hands the controller. `Content-Language` is not decoration: it is
 * what makes a wrong negotiation VISIBLE in a curl, instead of a mystery
 * inside a rendered string. It is also the header any HTTP cache in front of
 * us must vary on, which is why `Vary: Accept-Language` is set beside it — a
 * shared cache that ignores it would serve one user's language to another.
 */
@Injectable()
export class RequestLocaleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const locale = resolveRequestLocale(http.getRequest<LocaleAwareRequest>());
    const response = http.getResponse<{
      header?: (name: string, value: string) => void;
    }>();
    if (typeof response?.header === 'function') {
      response.header('Content-Language', locale);
      response.header('Vary', 'Accept-Language');
    }
    return next.handle();
  }
}
