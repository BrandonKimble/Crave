import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AutocompleteService } from './autocomplete.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
} from './dto/autocomplete.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';

@Controller('autocomplete')
@UseGuards(ClerkAuthGuard)
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Post('entities')
  autocompleteEntities(
    @Body() dto: AutocompleteRequestDto,
    @CurrentUser() user: User,
  ): Promise<AutocompleteResponseDto> {
    return this.autocompleteService.autocompleteEntities(dto, user);
  }
}
