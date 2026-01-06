import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '@liaoliaots/nestjs-redis';
import type { Redis } from 'ioredis';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly startTime: number;
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.startTime = Date.now();
    this.redis = this.redisService.getClient();
  }

  async check(): Promise<HealthCheckResult> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allHealthy = database.status === 'healthy' && redis.status === 'healthy';
    const allUnhealthy = database.status === 'unhealthy' && redis.status === 'unhealthy';

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (allHealthy) {
      overallStatus = 'healthy';
    } else if (allUnhealthy) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database,
        redis,
      },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Use executeRaw for simple health check query
      await this.prisma.$executeRawUnsafe('SELECT 1');
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  /**
   * Simple liveness check - just returns true if the service is running
   * Used by container orchestrators for basic liveness probes
   */
  isAlive(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
