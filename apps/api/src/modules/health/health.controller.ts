import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service';

/**
 * Health check endpoints for monitoring and container orchestration.
 *
 * These endpoints are NOT protected by auth guards and have no rate limiting
 * to ensure monitoring systems can always reach them.
 *
 * Endpoints:
 * - GET /health - Full health check with component status
 * - GET /health/live - Simple liveness probe
 * - GET /health/ready - Readiness probe (checks dependencies)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Full health check endpoint
   * Returns detailed status of all components (database, redis)
   *
   * Response codes:
   * - 200: All components healthy
   * - 503: One or more components unhealthy
   */
  @Get()
  async check(@Res() reply: FastifyReply): Promise<void> {
    const result = await this.healthService.check();

    const statusCode =
      result.status === 'healthy'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    await reply.status(statusCode).send(result);
  }

  /**
   * Liveness probe - is the service running?
   * Used by Railway/Kubernetes to detect if container is alive
   *
   * Always returns 200 if the service is running
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok' } {
    return this.healthService.isAlive();
  }

  /**
   * Readiness probe - is the service ready to accept traffic?
   * Checks if database and redis are connected
   *
   * Response codes:
   * - 200: Ready to accept traffic
   * - 503: Not ready (dependencies unavailable)
   */
  @Get('ready')
  async ready(@Res() reply: FastifyReply): Promise<void> {
    const result = await this.healthService.check();

    // Only return 200 if fully healthy
    const statusCode =
      result.status === 'healthy'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    await reply.status(statusCode).send({
      status: result.status === 'healthy' ? 'ready' : 'not_ready',
      checks: result.checks,
    });
  }
}
