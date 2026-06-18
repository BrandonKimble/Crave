import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PollsService } from './polls.service';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { ListUserPollsDto } from './dto/list-user-polls.dto';
import { CreatePollOptionDto } from './dto/create-poll-option.dto';
import { CastPollVoteDto } from './dto/cast-poll-vote.dto';
import {
  CreateCommentDto,
  EditCommentDto,
  ListCommentsQueryDto,
} from './dto/create-comment.dto';
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

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  listMyPolls(@Query() query: ListUserPollsDto, @CurrentUser() user: User) {
    return this.pollsService.listPollsForUser(user.userId, query);
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

  @Get(':pollId/comments')
  @UseGuards(OptionalClerkAuthGuard)
  listComments(
    @Param('pollId') pollId: string,
    @Query() query: ListCommentsQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.pollsService.listComments(
      pollId,
      user?.userId ?? null,
      query.sort,
    );
  }

  @Post(':pollId/comments')
  @UseGuards(ClerkAuthGuard)
  postComment(
    @Param('pollId') pollId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.postComment(pollId, dto, user.userId);
  }

  @Patch('comments/:commentId')
  @UseGuards(ClerkAuthGuard)
  editComment(
    @Param('commentId') commentId: string,
    @Body() dto: EditCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.editComment(commentId, dto, user.userId);
  }

  @Delete('comments/:commentId')
  @UseGuards(ClerkAuthGuard)
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.deleteComment(commentId, user.userId);
  }

  @Post('comments/:commentId/likes')
  @UseGuards(ClerkAuthGuard)
  toggleCommentLike(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.toggleCommentLike(commentId, user.userId);
  }

  @Get(':pollId/leaderboard')
  @UseGuards(OptionalClerkAuthGuard)
  getLeaderboard(@Param('pollId') pollId: string) {
    return this.pollsService.getPollLeaderboard(pollId);
  }
}
