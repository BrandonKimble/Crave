import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AutocompleteService } from './autocomplete.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
} from './dto/autocomplete.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { NoSignal } from '../signals/records-signal.decorator';
import { RequestLocale, type SupportedLocale } from '../../shared/locale';

@Controller('autocomplete')
@UseGuards(ClerkAuthGuard)
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Post('entities')
  // POST for the request BODY, not because it mutates: this is a read.
  // The act the ledger cares about is the SELECTION, recorded at the search
  // chokepoint as 'autocomplete_selection' — keystrokes are not acts.
  @NoSignal(
    'read-only suggestion lookup; the act is the selection, recorded by SearchService',
  )
  @RateLimitTier('autocomplete')
  autocompleteEntities(
    @Body() dto: AutocompleteRequestDto,
    @CurrentUser() user: User,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<AutocompleteResponseDto> {
    return this.autocompleteService.autocompleteEntities(dto, user, locale);
  }
}
