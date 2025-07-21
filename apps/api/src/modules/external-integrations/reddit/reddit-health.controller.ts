import { Controller, Get } from '@nestjs/common';
import { RedditService } from './reddit.service';

@Controller('health/reddit')
export class RedditHealthController {
  constructor(private readonly redditService: RedditService) {}

  @Get()
  async getHealthStatus() {
    return await this.redditService.performHealthCheck();
  }

  @Get('metrics')
  getMetrics() {
    return {
      performance: this.redditService.getPerformanceMetrics(),
      connection: this.redditService.getConnectionMetrics(),
    };
  }

  @Get('stability')
  async testStability() {
    return await this.redditService.testConnectionStability();
  }

  @Get('endpoints')
  async testEndpoints() {
    return await this.redditService.testApiEndpoints();
  }
}
