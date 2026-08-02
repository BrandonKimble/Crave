import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

/**
 * §18.4/§24.3 ops dashboard auth: a constant-time check of the x-ops-token
 * HEADER against process.env.OPS_DASH_TOKEN. Absent env → every ops route
 * 404s (the dashboard is OFF by construction, not merely unauth'd — the
 * surface must not even reveal it exists on a fresh env). Present env +
 * wrong/missing token → 401.
 *
 * SECURITY (final-final red team #7): the old ?token= branch put the
 * secret in the query string — which the logging interceptor, the
 * exception filter, Sentry context, browser history, and proxy logs ALL
 * record in cleartext. Header only, forever.
 */
@Injectable()
export class OpsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredToken = process.env.OPS_DASH_TOKEN;
    if (!configuredToken) {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const suppliedToken = request.headers['x-ops-token'] as string | undefined;
    if (!suppliedToken || !constantTimeEquals(suppliedToken, configuredToken)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Lengths differ -> NOT constant-time-safe to short-circuit on length
  // alone in theory, but timingSafeEqual REQUIRES equal-length buffers; a
  // length mismatch is itself constant w.r.t. the SUPPLIED token's content
  // (only its length leaks, which is not the secret), matching the pattern
  // already used elsewhere in this codebase (cloudinary.service.ts).
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
