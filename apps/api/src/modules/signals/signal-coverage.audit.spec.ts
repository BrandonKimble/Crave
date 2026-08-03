import 'reflect-metadata';
import {
  Controller,
  Delete,
  Get,
  Injectable,
  Post,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SignalCoverageAudit } from './signal-coverage.audit';
import { NoSignal, RecordsSignal } from './records-signal.decorator';
import { AuthenticationEffect } from '../entitlements/authentication-effect';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

/**
 * BOTH DIRECTIONS (F203 / D20b). An audit that can only pass is the disease
 * this repo's methodology names; an audit that fires on everything is noise.
 * These prove it refuses an undeclared user act, accepts either declaration,
 * and stays silent on the three things that are NOT user acts.
 */

@Injectable()
@AuthenticationEffect('required')
class FakeAuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Injectable()
@AuthenticationEffect('none')
class FakeOperatorGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

async function auditOf(...controllers: unknown[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    controllers: controllers as never,
    providers: [SignalCoverageAudit],
  }).compile();
  // Deliberately NOT init()'d: init RUNS onApplicationBootstrap, and half of
  // these cases exist to prove that it throws. The spec calls it explicitly.
  return moduleRef.get(SignalCoverageAudit);
}

describe('SignalCoverageAudit — it refuses an undeclared user act', () => {
  @Controller('undeclared')
  @UseGuards(FakeAuthGuard)
  class UndeclaredController {
    @Post('act')
    doTheAct(): void {}
  }

  it('names the route and the fix rather than logging', async () => {
    const audit = await auditOf(UndeclaredController);

    expect(audit.undeclaredActRoutes()).toEqual([
      'UndeclaredController.doTheAct',
    ]);
    expect(() => audit.onApplicationBootstrap()).toThrow(
      /UndeclaredController\.doTheAct/,
    );
    expect(() => audit.onApplicationBootstrap()).toThrow(
      /@RecordsSignal\('<kind>'\).*@NoSignal/s,
    );
  });
});

describe('SignalCoverageAudit — it accepts either declaration', () => {
  @Controller('declared')
  @UseGuards(FakeAuthGuard)
  class DeclaredController {
    @Post('vote')
    @RecordsSignal('poll_vote')
    vote(): void {}

    @Delete('unvote')
    @NoSignal('append-only ledger: a retraction never unwrites the act')
    unvote(): void {}
  }

  it('boots, and records WHICH declaration each route made', async () => {
    const audit = await auditOf(DeclaredController);

    expect(audit.undeclaredActRoutes()).toEqual([]);
    expect(() => audit.onApplicationBootstrap()).not.toThrow();
    expect(audit.declarations()).toEqual([
      {
        route: 'DeclaredController.unvote',
        declaration:
          'none:append-only ledger: a retraction never unwrites the act',
      },
      { route: 'DeclaredController.vote', declaration: 'records:poll_vote' },
    ]);
  });

  it('an EMPTY reason is not a declaration — the reason is the point', async () => {
    @Controller('empty')
    @UseGuards(FakeAuthGuard)
    class EmptyReasonController {
      @Post('act')
      @NoSignal('   ')
      act(): void {}
    }

    const audit = await auditOf(EmptyReasonController);
    expect(audit.undeclaredActRoutes()).toEqual(['EmptyReasonController.act']);
  });
});

describe('SignalCoverageAudit — what is NOT a user act', () => {
  @Controller('reads')
  @UseGuards(FakeAuthGuard)
  class ReadController {
    @Get('list')
    list(): void {}
  }

  @Controller('public')
  @AllowUnentitled()
  @UseGuards(FakeAuthGuard)
  class PublicController {
    @Post('hook')
    hook(): void {}
  }

  @Controller('operator')
  @UseGuards(FakeOperatorGuard)
  class OperatorController {
    @Post('ack')
    ack(): void {}
  }

  it('a read is not an act; a public route is not a USER act; an operator is not a user', async () => {
    const audit = await auditOf(
      ReadController,
      PublicController,
      OperatorController,
    );

    expect(audit.undeclaredActRoutes()).toEqual([]);
    // ...and none of them is even ASKED. If any were, the declarations list
    // would carry it.
    expect(audit.declarations()).toEqual([]);
  });

  it('refuses to be vacuously green when route detection breaks', async () => {
    // Controllers present, zero user-act routes found: on a real API that
    // means the metadata keys moved and the audit is checking nothing.
    const audit = await auditOf(ReadController);
    expect(() => audit.onApplicationBootstrap()).toThrow(
      /found ZERO user-act routes.*do not delete this check/s,
    );
  });
});
