import { Controller, Get } from '@nestjs/common';
import { AllowUnentitled } from './modules/entitlements/entitlement-enforcement.interceptor';

/**
 * Exempt from the paywall: it has no auth guard, so under `enforce` the wall
 * would refuse it for having no user (red team 2026-08-02).
 */
@AllowUnentitled()
@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello World!';
  }
}
