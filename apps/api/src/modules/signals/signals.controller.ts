import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { PlacesReconcilerService } from '../places/places-reconciler.service';
import { RecordViewportDwellDto } from './dto/record-viewport-dwell.dto';
import { SignalsService } from './signals.service';

/**
 * The signals observation seam for acts the server cannot see through any
 * existing endpoint (wave-5 F3). Today that is exactly ONE act:
 * viewport_dwell — browse-only settled attention (§3/§4: browsing IS
 * demand; the §22 deferral law forbids deferring OBSERVATIONS). Every other
 * act kind records at its own chokepoint (search submit, poll vote, …) —
 * this controller must never grow a generic "record any signal" endpoint
 * (the ledger's meaning lives in server-side chokepoints, not client claims).
 *
 * Mobile wiring lands with the home-place-registration leg (ledger
 * follow-up); until then the endpoint stands ready and unwired.
 */
@Controller('signals')
@UseGuards(ClerkAuthGuard)
export class SignalsController {
  constructor(
    private readonly signals: SignalsService,
    private readonly placesReconciler: PlacesReconcilerService,
  ) {}

  @Post('viewport-dwell')
  @RateLimitTier('default')
  @HttpCode(HttpStatus.ACCEPTED)
  recordViewportDwell(
    @Body() dto: RecordViewportDwellDto,
    @CurrentUser() user: User,
  ): { accepted: true } {
    // Fire-and-forget by law (§3: a write failure never fails the user
    // action) — the 202 acknowledges receipt, not persistence.
    const geo = this.signals.bboxFromBounds(dto.bounds);
    this.signals.record({
      kind: 'viewport_dwell',
      userId: user.userId,
      subject: null,
      geo,
      meta: { dwellMs: dto.dwellMs },
    });
    if (geo) {
      // The settled viewport is the naming reconciler's TRUE seam (header
      // subject-store design): a dwell is a SETTLE, and settles are
      // observations — the other settle mouth is the search submit
      // (SearchService keeps its own noteViewport call). noteViewport is
      // sync-return and never throws (reconcile failures are caught and
      // logged inside the service), so the 202 is never at risk. Slice
      // READS (GET /places/in-view) deliberately never reach this seam.
      this.placesReconciler.noteViewport(geo);
    }
    return { accepted: true };
  }
}
