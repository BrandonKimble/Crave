import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { OpsTokenGuard } from './ops-token.guard';
import {
  OPS_SESSION_COOKIE,
  isValidOpsSessionCookie,
  readCookie,
} from './ops-session-cookie';

/**
 * TWO RESOURCES, TWO CREDENTIAL MECHANISMS, ONE DECISION (F200).
 *
 * The header path is UNCHANGED and still owned by OpsTokenGuard — a
 * header-capable client (curl, a script, the deploy smoke) behaves exactly as
 * it did, byte for byte, including the absent-env 404 and the constant-time
 * comparison. This guard only adds the credential a BROWSER can supply on a
 * navigation: the ops session cookie minted by `GET /ops/enter`.
 *
 * Order matters and is deliberate: a presented header is answered by the
 * header guard, so a wrong header still 401s rather than falling through to a
 * cookie. There is no way to widen the header check from here.
 *
 * The cookie also carries the page's own same-origin fetches, because an
 * HttpOnly cookie is (correctly) unreadable by the page's JavaScript — the
 * document holds no credential at all now, the browser does.
 */
@Injectable()
export class OpsAccessGuard implements CanActivate {
  private readonly headerGuard = new OpsTokenGuard();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (request.headers['x-ops-token'] !== undefined) {
      return this.headerGuard.canActivate(context);
    }

    // Absent env => the dashboard is OFF, not merely unauthorised. Same
    // distinction the header guard makes, and for the same reason: the
    // surface must not reveal it exists on a fresh env.
    const configuredToken = process.env.OPS_DASH_TOKEN;
    if (!configuredToken) {
      throw new NotFoundException();
    }

    const cookie = readCookie(request.headers.cookie, OPS_SESSION_COOKIE);
    if (!isValidOpsSessionCookie(cookie, configuredToken)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
