import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Core security service providing security utilities and configurations
 * Implements PRD section 9.2.1 security essentials
 */
@Injectable()
export class SecurityService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Sanitize input string to prevent XSS attacks
   */
  sanitizeInput(input: string): string {
    if (typeof input !== 'string') return input;

    return (
      input
        // Remove script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove javascript: protocol
        .replace(/javascript:/gi, '')
        // Remove on* event handlers
        .replace(/\s*on\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*on\w+\s*=\s*'[^']*'/gi, '')
        // HTML encode dangerous characters
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
    );
  }

  /**
   * Validate if input contains potentially malicious patterns
   */
  containsMaliciousPattern(input: string): boolean {
    if (typeof input !== 'string') return false;

    const maliciousPatterns = [
      // SQL injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|;|\/\*|\*\/)/,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /('|"|`).*(OR|AND|UNION|SELECT).*/i,

      // XSS patterns
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /\s*on\w+\s*=\s*["'][^"']*["']/gi,

      // Path traversal
      /\.\.[/\\]/,

      // Command injection
      /[;&|`$(){}[\]]/,
    ];

    return maliciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Get CORS configuration based on environment
   */
  getCorsConfiguration() {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const allowedOrigins = this.configService.get<string>(
      'ALLOWED_ORIGINS',
      '',
    );

    return {
      origin:
        isProd && allowedOrigins
          ? allowedOrigins.split(',').map((origin) => origin.trim())
          : true, // Allow all origins in development
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Correlation-ID',
      ],
      credentials: false, // Disable credentials for security
      maxAge: 86400, // Cache preflight for 24 hours
    };
  }

  /**
   * Get rate limiting configuration for endpoint type
   */
  getRateLimitConfig(endpointType: 'default' | 'strict' = 'default') {
    const configs = {
      default: {
        ttl: this.configService.get<number>('THROTTLE_TTL', 60) * 1000,
        limit: this.configService.get<number>('THROTTLE_LIMIT', 100),
      },
      strict: {
        ttl: this.configService.get<number>('THROTTLE_STRICT_TTL', 60) * 1000,
        limit: this.configService.get<number>('THROTTLE_STRICT_LIMIT', 10),
      },
    };

    return configs[endpointType];
  }

  /**
   * Validate request origin for CSRF protection
   */
  isValidOrigin(origin: string, referer?: string): boolean {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (!isProd) return true; // Allow all in development

    const allowedOrigins = this.configService.get<string>(
      'ALLOWED_ORIGINS',
      '',
    );
    if (!allowedOrigins) return false;

    const allowed = allowedOrigins.split(',').map((o) => o.trim());

    // Check origin header
    if (origin && allowed.includes(origin)) return true;

    // Fallback to referer header
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        return allowed.includes(refererOrigin);
      } catch {
        return false;
      }
    }

    return false;
  }
}
