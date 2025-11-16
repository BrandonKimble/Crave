import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PollsService } from './polls.service';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { CreatePollOptionDto } from './dto/create-poll-option.dto';
import { CastPollVoteDto } from './dto/cast-poll-vote.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';

@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Get()
  listPolls(@Query() query: ListPollsQueryDto) {
    return this.pollsService.listPolls(query);
  }

  @Get(':pollId')
  getPoll(@Param('pollId') pollId: string) {
    return this.pollsService.getPoll(pollId);
  }

  @Post(':pollId/options')
  @UseGuards(ClerkAuthGuard)
  addOption(
    @Param('pollId') pollId: string,
    @Body() dto: CreatePollOptionDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.addOption(pollId, dto, user.userId);
  }

  @Post(':pollId/votes')
  @UseGuards(ClerkAuthGuard)
  castVote(
    @Param('pollId') pollId: string,
    @Body() dto: CastPollVoteDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.castVote(pollId, dto, user.userId);
  }
}
