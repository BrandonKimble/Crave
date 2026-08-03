import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Req } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { serializeOpsSessionCookie } from './ops-session-cookie';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

/**
 * THE ONE-TIME DOOR (F200). `GET /ops/enter?token=…` validates the secret,
 * sets the HttpOnly + Secure + SameSite=Strict session cookie, and 302s to
 * `/ops` WITHOUT the query string — so the secret appears in exactly one
 * logged URL, once per visit, instead of riding on every request or being
 * refused outright.
 *
 * NOT under OpsAccessGuard, and it must not be: this route IS the
 * authentication, and it authenticates by the one mechanism a browser
 * navigation can carry a secret with. It performs the same constant-time
 * comparison and makes the same absent-env-is-404 distinction, so nothing is
 * weaker here than at the guard — the difference is only where the credential
 * is read from, and the redirect immediately removes it from the URL bar,
 * history, and any bookmark the owner makes of the landing page.
 */
@AllowUnentitled()
@Controller('ops')
export class OpsBootstrapController {
  @Get('enter')
  enter(
    @Query('token') token: string | undefined,
    @Req() request: FastifyRequest,
    @Res() res: FastifyReply,
  ): void {
    const configuredToken = process.env.OPS_DASH_TOKEN;
    if (!configuredToken) {
      throw new NotFoundException();
    }
    if (!token || !constantTimeEquals(token, configuredToken)) {
      throw new UnauthorizedException();
    }

    // The console's mount path, whatever global prefix the app carries:
    // `/api/v1/ops/enter` -> `/api/v1/ops`.
    const path = (request.url ?? '').split('?')[0];
    const mountPath = path.replace(/\/enter\/?$/, '') || '/ops';

    res
      .header(
        'Set-Cookie',
        serializeOpsSessionCookie(configuredToken, mountPath),
      )
      // Belt and braces: the bootstrap response itself must never be cached
      // or referred onward.
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .redirect(mountPath, 302);
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
