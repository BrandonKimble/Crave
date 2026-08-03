import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';

/**
 * Debug Module — testing endpoints for verifying integrations like Sentry.
 *
 * PRODUCTION EXPOSURE IS ALREADY CLOSED. app.module.ts registers this module
 * only when `isDebugRoutesEnabled()` (shared/config/debug-routes.gate.ts),
 * a gate whose own spec proves it refuses `prod` outright.
 *
 * This header used to WARN that the module "should be conditionally loaded ...
 * NOT in production!" and then instruct the reader how to achieve it — a TODO
 * that had survived its own completion (audit 2026-08-02, F211). That trains
 * readers to distrust the warnings that are still real, and invites someone to
 * "fix" a hole that is already closed. The gate is the statement; this
 * describes it.
 */
@Module({
  controllers: [DebugController],
})
export class DebugModule {}
