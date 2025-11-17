import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { AdminGuard } from '../identity/auth/admin.guard';
import { CurrentUser } from '../../shared';
import { PollsService } from './polls.service';
import { CreateManualPollDto } from './dto/create-manual-poll.dto';

@Controller('polls/admin')
@UseGuards(ClerkAuthGuard, AdminGuard)
export class PollsAdminController {
  constructor(private readonly pollsService: PollsService) {}

  @Post('manual')
  createManualPoll(
    @Body() dto: CreateManualPollDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.createManualPoll(dto, user.userId);
  }
}
