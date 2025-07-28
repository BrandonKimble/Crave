import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SecurityService } from '../security.service';
import { RateLimitException } from '../../../../shared/exceptions';

/**
 * Security validation guard for request content validation
 * Implements PRD section 9.2.1 request validation (rate limiting handled by ThrottlerGuard)
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(private readonly securityService: SecurityService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Validate request origin for CSRF protection
    this.validateRequestOrigin(request);

    // Check for malicious patterns in request
    this.validateRequestContent(request);

    return true;
  }

  private validateRequestOrigin(request: FastifyRequest): void {
    // Skip origin validation for GET requests (safe methods)
    if (request.method === 'GET' || request.method === 'HEAD') {
      return;
    }

    const origin = request.headers.origin as string;
    const referer = request.headers.referer as string;

    if (!this.securityService.isValidOrigin(origin, referer)) {
      throw new RateLimitException(undefined, {
        reason: 'Invalid origin',
        origin,
        referer,
      });
    }
  }

  private validateRequestContent(request: FastifyRequest): void {
    // Check URL for malicious patterns
    if (this.securityService.containsMaliciousPattern(request.url)) {
      throw new RateLimitException(undefined, {
        reason: 'Malicious URL pattern detected',
        url: request.url,
      });
    }

    // Check query parameters
    if (request.query && typeof request.query === 'object') {
      for (const [key, value] of Object.entries(request.query)) {
        const strValue = Array.isArray(value) ? value.join(' ') : String(value);
        if (this.securityService.containsMaliciousPattern(strValue)) {
          throw new RateLimitException(undefined, {
            reason: 'Malicious query parameter detected',
            parameter: key,
          });
        }
      }
    }

    // Check headers for injection attempts
    const dangerousHeaders = ['user-agent', 'referer', 'x-forwarded-for'];
    for (const header of dangerousHeaders) {
      const value = request.headers[header] as string;
      if (value && this.securityService.containsMaliciousPattern(value)) {
        throw new RateLimitException(undefined, {
          reason: 'Malicious header detected',
          header,
        });
      }
    }
  }
}
