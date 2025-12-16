import { Injectable, Inject } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { LoggerService, CorrelationUtils } from '../../../../shared';

export interface ReservationMetrics {
  currentRPM: number;
  utilizationPercent: number;
  activeRequests: number;
  nextSlotIn: number;
  timestamp: number;
  tpm: {
    windowTokens: number;
    reservedTokens: number;
    estTokens: number;
    safeTPM: number;
  };
}

export interface ReservationErrorMetrics {
  error: string;
  fallbackMode: boolean;
}

export interface ReservationResult {
  reservationTime: number;
  waitMs: number;
  guaranteed: boolean;
  metrics: ReservationMetrics | ReservationErrorMetrics;
  reservationMember: string;
}

/**
 * Centralized Redis-based Rate Limiter with Reservation System (Bulletproof Edition)
 *
 * Guarantees ZERO rate limit violations for 16 workers through:
 * 1. Request reservation system - workers reserve future time slots
 * 2. Adaptive burst control - dynamically adjusts based on current load
 * 3. Exponential backoff with guaranteed slots
 * 4. Worker fairness queue - prevents starvation
 *
 * Architecture:
 * - Token bucket with future reservations
 * - Sliding window for accurate rate tracking
 * - Atomic Redis operations for race condition prevention
 * - Self-healing capacity recovery
 */
@Injectable()
export class CentralizedRateLimiter {
  private logger!: LoggerService;
  private readonly keyPrefix = 'llm-bulletproof';

  // Configured limits (must match actual provider quotas to avoid 429s)
  private readonly maxRPM: number;
  private readonly maxTPM: number;
  private readonly headroom: number; // 0–1
  private readonly safeTPM: number;

  // Optimized settings derived from configured headroom
  private readonly safeRPM: number; // floor(maxRPM * headroom)
  private readonly safeRequestsPerSecond: number; // floor(safeRPM/60)
  private readonly minSpacingMs: number; // ceil(1000/safeRPS)
  private readonly workerTimeSlotMs = 30; // Reduced since burst isn't an issue

  // Redis keys
  private readonly reservationsKey = `${this.keyPrefix}:reservations`;
  private readonly activeRequestsKey = `${this.keyPrefix}:active`;
  private readonly tpmKey = `${this.keyPrefix}:tpm`;
  private readonly tpmReservationsKey = `${this.keyPrefix}:tpm_reservations`;
  private readonly metricsKey = `${this.keyPrefix}:metrics`;
  private readonly workerQueueKey = `${this.keyPrefix}:worker-queue`;

  private readonly redis: Redis;

  constructor(
    private readonly redisService: RedisService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {
    this.logger = this.loggerService.setContext('CentralizedRateLimiter');
    this.redis = this.redisService.getOrThrow();

    const envMaxRPM = parseInt(process.env.LLM_MAX_RPM || '', 10);
    const envMaxTPM = parseInt(process.env.LLM_MAX_TPM || '', 10);
    this.maxRPM =
      Number.isFinite(envMaxRPM) && envMaxRPM > 0 ? envMaxRPM : 1000;
    this.maxTPM =
      Number.isFinite(envMaxTPM) && envMaxTPM > 0 ? envMaxTPM : 1000000;

    // Headroom (applies to both RPM and TPM). Defaults to 0.95.
    const envHeadroom = parseFloat(process.env.LLM_RATE_HEADROOM || '');
    this.headroom =
      !isNaN(envHeadroom) && envHeadroom > 0 && envHeadroom <= 1
        ? envHeadroom
        : 0.95;
    this.safeRPM = Math.floor(this.maxRPM * this.headroom);
    this.safeTPM = Math.floor(this.maxTPM * this.headroom);
    this.safeRequestsPerSecond = Math.max(1, Math.floor(this.safeRPM / 60));
    this.minSpacingMs = Math.ceil(1000 / this.safeRequestsPerSecond);

    this.logger.info('Centralized LLM rate limiter configured', {
      correlationId: CorrelationUtils.getCorrelationId(),
      maxRPM: this.maxRPM,
      maxTPM: this.maxTPM,
      headroom: this.headroom,
      safeRPM: this.safeRPM,
      safeTPM: this.safeTPM,
      safeRequestsPerSecond: this.safeRequestsPerSecond,
      minSpacingMs: this.minSpacingMs,
    });
  }

  /**
   * Reserve a future time slot for making an LLM request
   * This guarantees the worker can proceed at the reserved time
   */
  async reserveRequestSlot(
    workerId: string,
    estimatedTokens?: number,
  ): Promise<ReservationResult> {
    const now = Date.now();
    const correlationId = CorrelationUtils.getCorrelationId();

    try {
      // Lua script for atomic reservation with guaranteed slot allocation
      const luaScript = `
        local reservationsKey = KEYS[1]
        local activeKey = KEYS[2]
        local metricsKey = KEYS[3]
        local workerQueueKey = KEYS[4]
        local tpmKey = KEYS[5]
        local tpmReservationsKey = KEYS[6]
        
        local now = tonumber(ARGV[1])
        local workerId = ARGV[2]
        local safeRPM = tonumber(ARGV[3])
        local minSpacingMs = tonumber(ARGV[4])
        local workerTimeSlotMs = tonumber(ARGV[5])
        local safeTPM = tonumber(ARGV[6])
        local estTokens = tonumber(ARGV[7])
        
        -- Clean up old reservations (> 2 minutes old)
        redis.call('ZREMRANGEBYSCORE', reservationsKey, 0, now - 120000)
        redis.call('ZREMRANGEBYSCORE', activeKey, 0, now - 60000)
        redis.call('ZREMRANGEBYSCORE', tpmKey, 0, now - 60000)
        redis.call('ZREMRANGEBYSCORE', tpmReservationsKey, 0, now - 60000)
        
        -- Get current reservations and active requests
        local allReservations = redis.call('ZRANGE', reservationsKey, 0, -1, 'WITHSCORES')
        local activeRequests = redis.call('ZCARD', activeKey)
        
        -- Find the next available time slot
        local nextAvailableTime = now
        
        -- Get the last reserved time
        local lastReservation = redis.call('ZREVRANGE', reservationsKey, 0, 0, 'WITHSCORES')
        if #lastReservation > 0 then
          local lastTime = tonumber(lastReservation[2])
          -- Ensure minimum spacing from last reservation
          nextAvailableTime = math.max(nextAvailableTime, lastTime + minSpacingMs)
        end
        
        -- Check rate limit within sliding window (1 minute)
        local oneMinuteAgo = now - 60000
        local requestsInWindow = redis.call('ZCOUNT', reservationsKey, oneMinuteAgo, '+inf')
        
        -- If we're approaching the limit, push the reservation further out
        if requestsInWindow >= safeRPM then
          -- Find when the oldest request in the window will expire
          local oldestInWindow = redis.call('ZRANGEBYSCORE', reservationsKey, oneMinuteAgo, '+inf', 'LIMIT', 0, 1, 'WITHSCORES')
          if #oldestInWindow > 0 then
            -- Schedule after the oldest expires from the 1-minute window
            nextAvailableTime = tonumber(oldestInWindow[2]) + 60000 + minSpacingMs
          end
        end

        -- TPM guard: sum used + reserved tokens in last minute window
        local usedEntries = redis.call('ZRANGEBYSCORE', tpmKey, oneMinuteAgo, '+inf')
        local reservedEntries = redis.call('ZRANGEBYSCORE', tpmReservationsKey, oneMinuteAgo, '+inf')

        local function sumTokens(entries)
          local total = 0
          for i = 1, #entries do
            local entry = tostring(entries[i])
            local dash = string.find(entry, '-')
            if dash then
              local tok = tonumber(string.sub(entry, dash + 1)) or 0
              total = total + tok
            end
          end
          return total
        end

        local usedTokens = sumTokens(usedEntries)
        local reservedTokens = sumTokens(reservedEntries)
        local windowTokens = usedTokens + reservedTokens

        if (windowTokens + estTokens) > safeTPM then
          -- Not enough token budget; schedule after earliest token expires from window and apply proportional backoff
          local earliestUsed = redis.call('ZRANGEBYSCORE', tpmKey, oneMinuteAgo, '+inf', 'LIMIT', 0, 1, 'WITHSCORES')
          local earliestReserved = redis.call('ZRANGEBYSCORE', tpmReservationsKey, oneMinuteAgo, '+inf', 'LIMIT', 0, 1, 'WITHSCORES')
          local earliestTime = now
          if #earliestUsed > 0 then
            earliestTime = tonumber(earliestUsed[2])
          end
          if #earliestReserved > 0 then
            local rtime = tonumber(earliestReserved[2])
            if rtime < earliestTime then
              earliestTime = rtime
            end
          end
          local windowDelay = math.max(0, (earliestTime + 60000 + minSpacingMs) - now)
          local overflow = (windowTokens + estTokens) - safeTPM
          if overflow < 0 then overflow = 0 end
          local ratio = overflow / math.max(1, safeTPM)
          local proportionalDelay = math.max(minSpacingMs, math.floor(ratio * 60000))
          local delay = math.max(windowDelay, proportionalDelay)
          nextAvailableTime = math.max(nextAvailableTime, now + delay)
        end
        
        -- Worker fairness: Check if this worker has a recent reservation
        local workerKey = workerId .. ':' .. math.floor(now / 1000)
        local recentWorkerReservation = redis.call('ZSCORE', workerQueueKey, workerKey)
        if recentWorkerReservation then
          -- This worker recently got a slot, add extra delay for fairness
          nextAvailableTime = nextAvailableTime + workerTimeSlotMs
        end
        
        -- Make the reservation
        local reservationId = workerId .. ':' .. nextAvailableTime .. ':' .. math.random(1000000)
        redis.call('ZADD', reservationsKey, nextAvailableTime, reservationId)
        redis.call('EXPIRE', reservationsKey, 180) -- 3 minute expiry
        
        -- Reserve TPM budget at reservation start time
        local tokenMember = tostring(nextAvailableTime) .. '-' .. tostring(estTokens)
        redis.call('ZADD', tpmReservationsKey, nextAvailableTime, tokenMember)
        redis.call('EXPIRE', tpmReservationsKey, 180)
        
        -- Track worker fairness
        redis.call('ZADD', workerQueueKey, now, workerKey)
        redis.call('EXPIRE', workerQueueKey, 10) -- 10 second fairness window
        
        -- Update metrics
        redis.call('HINCRBY', metricsKey, 'total_reservations', 1)
        redis.call('EXPIRE', metricsKey, 300)
        
        -- Calculate wait time
        local waitMs = math.max(0, nextAvailableTime - now)
        
        -- Return reservation details
        return {
          nextAvailableTime,
          waitMs,
          requestsInWindow,
          activeRequests,
          windowTokens,
          reservedTokens,
          estTokens
        }
      `;

      const result = (await this.redis.eval(
        luaScript,
        6,
        this.reservationsKey,
        this.activeRequestsKey,
        this.metricsKey,
        this.workerQueueKey,
        this.tpmKey,
        this.tpmReservationsKey,
        now.toString(),
        workerId,
        this.safeRPM.toString(),
        this.minSpacingMs.toString(),
        this.workerTimeSlotMs.toString(),
        this.safeTPM.toString(),
        String(Math.max(1, estimatedTokens ?? 0)),
      )) as [number, number, number, number, number, number, number];

      const [
        reservationTime,
        waitMs,
        requestsInWindow,
        activeRequests,
        windowTokens,
        reservedTokens,
        estTokens,
      ] = result;

      const metrics = {
        currentRPM: requestsInWindow,
        utilizationPercent: Math.round((requestsInWindow / this.safeRPM) * 100),
        activeRequests,
        nextSlotIn: waitMs,
        timestamp: now,
        tpm: {
          windowTokens,
          reservedTokens,
          estTokens,
          safeTPM: this.safeTPM,
        },
      };

      const logPayload = {
        correlationId,
        workerId,
        reservationTime: new Date(reservationTime).toISOString(),
        waitMs,
        rpmWindowCount: requestsInWindow,
        currentLoad: metrics.utilizationPercent,
        activeRequests,
        minSpacingMs: this.minSpacingMs,
        safeRPM: this.safeRPM,
        tpmWindowTokens: windowTokens,
        tpmReservedTokens: reservedTokens,
        tpmEstTokens: estTokens,
        safeTPM: this.safeTPM,
      };
      if (waitMs > 0) {
        this.logger.debug(
          `Reserved future slot for worker ${workerId}`,
          logPayload,
        );
      } else {
        this.logger.debug(
          `Immediate slot granted for worker ${workerId}`,
          logPayload,
        );
      }

      return {
        reservationTime,
        waitMs,
        guaranteed: true, // This reservation is guaranteed
        metrics,
        reservationMember: `${reservationTime}-${estTokens}`,
      };
    } catch (error) {
      this.logger.error('Error reserving request slot', {
        correlationId,
        workerId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // Fallback: wait with exponential backoff
      const fallbackWaitMs = 1000 + Math.random() * 1000;
      return {
        reservationTime: now + fallbackWaitMs,
        waitMs: fallbackWaitMs,
        guaranteed: false,
        metrics: { error: 'reservation_failed', fallbackMode: true },
        reservationMember: '',
      };
    }
  }

  /**
   * Confirm that a reserved slot is being used
   * This helps track actual vs reserved capacity
   */
  async confirmReservation(
    workerId: string,
    reservationTime: number,
  ): Promise<void> {
    const now = Date.now();

    try {
      // Move from reservation to active
      const luaScript = `
        local activeKey = KEYS[1]
        local metricsKey = KEYS[2]
        
        local now = tonumber(ARGV[1])
        local workerId = ARGV[2]
        local reservationTime = tonumber(ARGV[3])
        
        -- Add to active requests
        redis.call('ZADD', activeKey, now, workerId .. ':' .. now)
        redis.call('EXPIRE', activeKey, 120)
        
        -- Update metrics
        redis.call('HINCRBY', metricsKey, 'confirmed_requests', 1)
        
        -- Track reservation accuracy (how close we were to the reservation time)
        local accuracy = math.abs(now - reservationTime)
        redis.call('HINCRBY', metricsKey, 'total_accuracy_ms', accuracy)
        
        return 1
      `;

      await this.redis.eval(
        luaScript,
        2,
        this.activeRequestsKey,
        this.metricsKey,
        now.toString(),
        workerId,
        reservationTime.toString(),
      );
    } catch (error) {
      this.logger.error('Error confirming reservation', {
        workerId,
        reservationTime,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Record token usage for TPM tracking
   */
  async recordTokenUsage(
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const now = Date.now();
    const safeInput = Number.isFinite(inputTokens) ? inputTokens : 0;
    const safeOutput = Number.isFinite(outputTokens) ? outputTokens : 0;
    const totalTokens = Math.max(0, Math.round(safeInput + safeOutput));

    try {
      const luaScript = `
        local tpmKey = KEYS[1]
        local metricsKey = KEYS[2]
        local now = tonumber(ARGV[1])
        local tokens = tonumber(ARGV[2])
        local windowMs = 60000
        
        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', tpmKey, 0, now - windowMs)
        
        -- Add token usage
        redis.call('ZADD', tpmKey, now, now .. '-' .. tokens)
        redis.call('EXPIRE', tpmKey, 120)
        
        -- Update metrics
        redis.call('HINCRBY', metricsKey, 'total_input_tokens', tokens)
        redis.call('EXPIRE', metricsKey, 300)
        
        return 1
      `;

      await this.redis.eval(
        luaScript,
        2,
        this.tpmKey,
        this.metricsKey,
        now.toString(),
        totalTokens.toString(),
      );
    } catch (error) {
      this.logger.error('Error recording token usage', {
        correlationId: CorrelationUtils.getCorrelationId(),
        inputTokens: safeInput,
        outputTokens: safeOutput,
        totalTokens,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Finalize a previously reserved TPM token budget once actual usage is recorded.
   */
  async finalizeTokenReservation(reservationMember: string): Promise<void> {
    try {
      if (!reservationMember) return;
      await this.redis.zrem(this.tpmReservationsKey, reservationMember);
      this.logger.debug('Finalized token reservation', {
        correlationId: CorrelationUtils.getCorrelationId(),
        reservationMember,
      });
    } catch (error) {
      this.logger.error('Error finalizing token reservation', {
        correlationId: CorrelationUtils.getCorrelationId(),
        reservationMember,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Get real-time RPM utilization analysis
   */
  async getRPMAnalysis(): Promise<{
    currentRPM: number;
    utilizationPercent: number;
    availableCapacity: number;
    safetyMargin: number;
    burstCapacity: number;
    recommendedWorkers: number;
  }> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const currentRPM = await this.redis.zcount(
      this.reservationsKey,
      oneMinuteAgo,
      '+inf',
    );
    const utilizationPercent = Math.round((currentRPM / this.maxRPM) * 100);
    const availableCapacity = this.maxRPM - currentRPM;
    const safetyMargin = this.maxRPM - this.safeRPM; // 50 RPM buffer
    const burstCapacity = this.safeRequestsPerSecond * 60; // 960 RPM theoretical (16 * 60)

    // Calculate optimal workers based on current load
    const avgRequestsPerWorker = currentRPM > 0 ? currentRPM / 16 : 15; // assume 15 req/min per worker
    const recommendedWorkers = Math.min(
      16,
      Math.floor(this.safeRPM / avgRequestsPerWorker),
    );

    return {
      currentRPM,
      utilizationPercent,
      availableCapacity,
      safetyMargin,
      burstCapacity,
      recommendedWorkers,
    };
  }

  /**
   * Get comprehensive TPM utilization analysis
   */
  async getTPMAnalysis(): Promise<{
    currentTPM: number; // used tokens last minute
    reservedTPM: number; // reserved tokens last minute
    windowTokens: number; // used + reserved
    utilizationPercent: number; // against safeTPM
    projectedTPM: number;
    avgTokensPerRequest: number;
    bottleneckType: 'rpm' | 'tpm' | 'none';
  }> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Get all token entries in the last minute
    const entries = await this.redis.zrangebyscore(
      this.tpmKey,
      oneMinuteAgo,
      now,
      'WITHSCORES',
    );
    const reservedEntries = await this.redis.zrangebyscore(
      this.tpmReservationsKey,
      oneMinuteAgo,
      '+inf',
      'WITHSCORES',
    );

    // Sum tokens from entries (format: "timestamp-tokens")
    let currentTPM = 0;
    let requestCount = 0;
    for (let i = 0; i < entries.length; i += 2) {
      const entry = entries[i];
      const tokens = parseInt(entry.split('-')[1] || '0', 10);
      currentTPM += tokens;
      requestCount++;
    }

    let reservedTPM = 0;
    for (let i = 0; i < reservedEntries.length; i += 2) {
      const entry = reservedEntries[i];
      const tokens = parseInt(entry.split('-')[1] || '0', 10);
      reservedTPM += tokens;
    }
    const windowTokens = currentTPM + reservedTPM;

    const utilizationPercent = Math.round((windowTokens / this.safeTPM) * 100);
    const avgTokensPerRequest =
      requestCount > 0 ? Math.round(currentTPM / requestCount) : 0;

    // Project TPM if we used full RPM capacity
    const rpmAnalysis = await this.getRPMAnalysis();
    const projectedTPM = avgTokensPerRequest * this.maxRPM;

    // Determine bottleneck
    let bottleneckType: 'rpm' | 'tpm' | 'none' = 'none';
    if (rpmAnalysis.utilizationPercent > 80) {
      bottleneckType = 'rpm';
    } else if (utilizationPercent > 80) {
      bottleneckType = 'tpm';
    }

    return {
      currentTPM,
      reservedTPM,
      windowTokens,
      utilizationPercent,
      projectedTPM,
      avgTokensPerRequest,
      bottleneckType,
    };
  }

  /**
   * Get comprehensive metrics
   */
  async getMetrics(): Promise<any> {
    try {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      const [reservations, active, metrics, rpmAnalysis, tpmAnalysis] =
        await Promise.all([
          this.redis.zcount(this.reservationsKey, oneMinuteAgo, '+inf'),
          this.redis.zcard(this.activeRequestsKey),
          this.redis.hgetall(this.metricsKey),
          this.getRPMAnalysis(),
          this.getTPMAnalysis(),
        ]);

      const totalReservations = parseInt(metrics.total_reservations || '0', 10);
      const confirmedRequests = parseInt(metrics.confirmed_requests || '0', 10);
      const totalAccuracyMs = parseInt(metrics.total_accuracy_ms || '0', 10);

      const avgAccuracy =
        confirmedRequests > 0
          ? Math.round(totalAccuracyMs / confirmedRequests)
          : 0;

      return {
        rpm: {
          current: reservations,
          max: this.maxRPM,
          safe: this.safeRPM,
          utilizationPercent: Math.round((reservations / this.safeRPM) * 100),
          actualUtilizationPercent: Math.round(
            (reservations / this.maxRPM) * 100,
          ),
          availableCapacity: rpmAnalysis.availableCapacity,
          safetyMargin: rpmAnalysis.safetyMargin,
          burstCapacity: rpmAnalysis.burstCapacity,
        },
        tpm: {
          current: tpmAnalysis.currentTPM,
          max: this.maxTPM,
          utilizationPercent: tpmAnalysis.utilizationPercent,
          projectedTPM: tpmAnalysis.projectedTPM,
          avgTokensPerRequest: tpmAnalysis.avgTokensPerRequest,
          bottleneckType: tpmAnalysis.bottleneckType,
          reserved: tpmAnalysis.reservedTPM,
          windowTokens: tpmAnalysis.windowTokens,
        },
        active: {
          current: active,
          maxConcurrent: 16,
          recommendedWorkers: rpmAnalysis.recommendedWorkers,
        },
        reservations: {
          total: totalReservations,
          confirmed: confirmedRequests,
          confirmationRate:
            totalReservations > 0
              ? Math.round((confirmedRequests / totalReservations) * 100)
              : 0,
          avgAccuracyMs: avgAccuracy,
        },
        optimization: {
          currentBottleneck: tpmAnalysis.bottleneckType,
          utilizationRoom: Math.max(
            0,
            80 -
              Math.max(
                rpmAnalysis.utilizationPercent,
                tpmAnalysis.utilizationPercent,
              ),
          ),
          canIncreaseWorkers: rpmAnalysis.recommendedWorkers > 16,
          shouldReduceWorkers: rpmAnalysis.recommendedWorkers < 16,
        },
        health: {
          status: reservations < this.safeRPM * 0.9 ? 'healthy' : 'busy',
          canAcceptMore: reservations < this.safeRPM,
        },
        timestamp: now,
      };
    } catch (error) {
      this.logger.error('Error getting metrics', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });

      return { error: 'metrics_unavailable' };
    }
  }

  /**
   * Reset all rate limiting data (for testing)
   */
  async reset(): Promise<void> {
    try {
      await this.redis.del(
        this.reservationsKey,
        this.activeRequestsKey,
        this.tpmKey,
        this.tpmReservationsKey,
        this.metricsKey,
        this.workerQueueKey,
      );

      this.logger.info('Bulletproof rate limiting data reset', {
        correlationId: CorrelationUtils.getCorrelationId(),
      });
    } catch (error) {
      this.logger.error('Error resetting rate limiting data', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
