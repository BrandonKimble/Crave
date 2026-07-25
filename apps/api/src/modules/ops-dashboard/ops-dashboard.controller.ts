import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { OpsTokenGuard } from './ops-token.guard';
import { OpsSummaryService } from './ops-summary.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { OPS_DASHBOARD_HTML } from './ops-dashboard.html';

/**
 * §18.4/§24.3 OWNER OPS DASHBOARD. Every route guarded by OpsTokenGuard
 * (absent OPS_DASH_TOKEN → 404s, so the surface is OFF, not merely
 * unauth'd; wrong/missing token → 401). This controller runs under the API
 * role only — see ops-dashboard.module.ts's isApiRuntime() gate.
 */
@Controller('ops')
@UseGuards(OpsTokenGuard)
export class OpsDashboardController {
  constructor(
    private readonly summaryService: OpsSummaryService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  @Get('api/summary')
  async getSummary() {
    return this.summaryService.summary();
  }

  @Post('api/alerts/:id/ack')
  async ackAlert(@Param('id') id: string) {
    await this.opsAlerts.acknowledge(id);
    return { acknowledged: true };
  }

  @Get()
  getDashboard(@Res() res: FastifyReply): void {
    res
      .header('Content-Type', 'text/html; charset=utf-8')
      // The page is a single self-contained file (inline CSS+JS, zero
      // external requests) behind the ops token — helmet's global
      // script-src 'self' would block its inline script, so this route
      // carries its own equally-strict-everywhere-else policy.
      .header(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      )
      .send(OPS_DASHBOARD_HTML);
  }
}
