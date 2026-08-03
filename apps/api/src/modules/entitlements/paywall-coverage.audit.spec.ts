import { Controller, Get, Injectable, CanActivate } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { DiscoveryModule, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PaywallCoverageAudit } from './paywall-coverage.audit';
import { AllowUnentitled } from './entitlement-enforcement.interceptor';
import { BearsRequestUser } from './user-bearing-guard';

@Injectable()
@BearsRequestUser()
class AuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

/** Authenticates an OPERATOR, not a user — the ops-dashboard shape exactly. */
@Injectable()
class OperatorGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Controller('authed')
@UseGuards(AuthGuard)
class AuthedController {
  @Get() list(): string {
    return 'ok';
  }
}

@Controller('public')
@AllowUnentitled()
class PublicController {
  @Get() list(): string {
    return 'ok';
  }
}

@Controller('ops')
@UseGuards(OperatorGuard)
class OpsController {
  @Get() list(): string {
    return 'ok';
  }
  // Not a route — a public helper must not be reported.
  helper(): string {
    return 'x';
  }
}

@Controller('mixed')
class MixedController {
  @Get('open') @AllowUnentitled() open(): string {
    return 'ok';
  }
  @Get('closed') closed(): string {
    return 'ok';
  }
}

async function auditOf(
  controllers: Parameters<typeof Test.createTestingModule>[0]['controllers'],
) {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    controllers,
    providers: [PaywallCoverageAudit, AuthGuard, OperatorGuard],
  }).compile();
  // NOT init()'d: the audit runs ON BOOTSTRAP and throws, so initializing
  // here would blow up before the assertion. That it throws from inside
  // Nest's own bootstrap is proven separately below.
  return moduleRef.get(PaywallCoverageAudit);
}

describe('paywall coverage audit', () => {
  it('a route behind a user-bearing guard is covered', async () => {
    const audit = await auditOf([AuthedController]);
    expect(audit.uncoveredRoutes()).toEqual([]);
  });

  it('a route that declares itself public is covered', async () => {
    const audit = await auditOf([PublicController]);
    expect(audit.uncoveredRoutes()).toEqual([]);
  });

  it('RED — an operator-authenticated route sets no user and is reported', async () => {
    // The exact defect: OpsTokenGuard authenticates an operator, so the ops
    // dashboard reaches the paywall with no request.user. Flipping enforce
    // would 403 the incident console.
    const audit = await auditOf([OpsController]);
    expect(audit.uncoveredRoutes()).toEqual(['OpsController.list']);
  });

  it('RED — exemption is per-HANDLER, not inherited by its siblings', async () => {
    const audit = await auditOf([MixedController]);
    expect(audit.uncoveredRoutes()).toEqual(['MixedController.closed']);
  });

  it('a gap FAILS BOOT — Nest itself refuses to start', async () => {
    // The whole point: not a warning logged during startup, which is a
    // warning nobody reads until the incident this prevents.
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OpsController],
      providers: [PaywallCoverageAudit, AuthGuard, OperatorGuard],
    }).compile();
    await expect(moduleRef.init()).rejects.toThrow(/Paywall coverage gap/);
  });

  it('RED — detection that finds ZERO routes fails boot instead of passing', async () => {
    // The failure the Jest scanner it replaced guarded against explicitly and
    // this audit first forgot: if Nest renames its route metadata key, every
    // handler stops looking like a route, `uncovered` is empty, and boot
    // sails through having checked nothing. Simulated by a Reflector whose
    // route-path lookup always misses.
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [AuthedController, OpsController],
      providers: [PaywallCoverageAudit, AuthGuard, OperatorGuard],
    })
      .overrideProvider(Reflector)
      .useValue({ get: () => undefined })
      .compile();
    await expect(moduleRef.init()).rejects.toThrow(/found ZERO routes/);
  });

  it('zero CONTROLLERS is silence, not an alarm — scripts boot a context with none', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [PaywallCoverageAudit],
    }).compile();
    await expect(moduleRef.init()).resolves.toBeDefined();
  });

  it('a fully covered app boots', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [AuthedController, PublicController],
      providers: [PaywallCoverageAudit, AuthGuard, OperatorGuard],
    }).compile();
    await expect(moduleRef.init()).resolves.toBeDefined();
  });
});
