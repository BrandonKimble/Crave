import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigService } from '@nestjs/config';

/**
 * Middleware to add additional security headers
 * Complements @fastify/helmet for enhanced security per PRD section 9.2.1
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly isProd: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
  }

  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    // Add custom security headers
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Add correlation ID to response for tracing
    const correlationId = req.headers['x-correlation-id'] as string;
    if (correlationId) {
      res.header('X-Correlation-ID', correlationId);
    }

    // Remove server header to hide technology stack
    res.header('Server', '');

    // Add cache control for security-sensitive endpoints
    if (this.isSecuritySensitiveEndpoint(req.url)) {
      res.header(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private',
      );
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
    }

    // Add HSTS header in production
    if (this.isProd && req.headers['x-forwarded-proto'] === 'https') {
      res.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    next();
  }

  /**
   * Check if endpoint handles security-sensitive data
   */
  private isSecuritySensitiveEndpoint(url: string): boolean {
    const sensitivePatterns = [
      '/api/auth',
      '/api/admin',
      '/api/users',
      '/api/health', // Don't cache health checks
    ];

    return sensitivePatterns.some((pattern) => url.startsWith(pattern));
  }
}
