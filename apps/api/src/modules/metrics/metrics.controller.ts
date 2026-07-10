import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetricsSnapshot();
  }
}
