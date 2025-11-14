import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PollsService } from './polls.service';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { CreatePollOptionDto } from './dto/create-poll-option.dto';
import { CastPollVoteDto } from './dto/cast-poll-vote.dto';

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
  addOption(@Param('pollId') pollId: string, @Body() dto: CreatePollOptionDto) {
    return this.pollsService.addOption(pollId, dto);
  }

  @Post(':pollId/votes')
  castVote(@Param('pollId') pollId: string, @Body() dto: CastPollVoteDto) {
    return this.pollsService.castVote(pollId, dto);
  }
}
