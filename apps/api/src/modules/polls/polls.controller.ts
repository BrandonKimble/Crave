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
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../identity/auth/optional-clerk-auth.guard';
import { CurrentUser } from '../../shared';

@Controller('polls')
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  listPolls(
    @Query() query: ListPollsQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.pollsService.listPolls(query, user ?? null);
  }

  @Post('query')
  @UseGuards(OptionalClerkAuthGuard)
  queryPolls(@Body() body: QueryPollsDto, @CurrentUser() user?: User | null) {
    return this.pollsService.queryPolls(body, user ?? null);
  }

  @Post()
  @UseGuards(ClerkAuthGuard)
  createPoll(@Body() dto: CreatePollDto, @CurrentUser() user: User) {
    return this.pollsService.createPoll(dto, user.userId);
  }

  @Get(':pollId')
  @UseGuards(OptionalClerkAuthGuard)
  getPoll(@Param('pollId') pollId: string, @CurrentUser() user?: User | null) {
    return this.pollsService.getPoll(pollId, user ?? null);
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
