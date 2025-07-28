import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { SecurityService } from '../security.service';

/**
 * Middleware to sanitize request inputs and prevent XSS attacks
 * Implements PRD section 9.2.1 input validation and sanitization
 */
@Injectable()
export class SanitizationMiddleware implements NestMiddleware {
  constructor(private readonly securityService: SecurityService) {}

  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = this.sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = this.sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = this.sanitizeObject(req.params);
    }

    next();
  }

  /**
   * Recursively sanitize object properties
   */
  private sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.securityService.sanitizeInput(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>,
      )) {
        // Sanitize both key and value
        const sanitizedKey = this.securityService.sanitizeInput(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }
}
