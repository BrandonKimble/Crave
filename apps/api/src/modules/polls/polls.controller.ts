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
import {
  CreateCommentDto,
  EditCommentDto,
  ListCommentsQueryDto,
} from './dto/create-comment.dto';
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { EndorsePollSubjectDto } from './dto/endorse-poll-subject.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../identity/auth/optional-clerk-auth.guard';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
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
    return this.pollsService.listPolls(query, user?.userId ?? null);
  }

  @Post('query')
  @UseGuards(OptionalClerkAuthGuard)
  queryPolls(@Body() body: QueryPollsDto, @CurrentUser() user?: User | null) {
    return this.pollsService.queryPolls(body, user?.userId ?? null);
  }

  @Post()
  @RateLimitTier('sensitive')
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
  getPoll(@Param('pollId') pollId: string) {
    return this.pollsService.getPoll(pollId);
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
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  postComment(
    @Param('pollId') pollId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.postComment(pollId, dto, user.userId);
  }

  @Patch('comments/:commentId')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  editComment(
    @Param('commentId') commentId: string,
    @Body() dto: EditCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.editComment(commentId, dto, user.userId);
  }

  @Delete('comments/:commentId')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.deleteComment(commentId, user.userId);
  }

  // A like toggle triggers a full leaderboard rebuild, so it's both a spam and a
  // DB-load vector — throttle it like the other poll writes.
  @Post('comments/:commentId/likes')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  toggleCommentLike(
    @Param('commentId') commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.toggleCommentLike(commentId, user.userId);
  }

  @Get(':pollId/leaderboard')
  @UseGuards(OptionalClerkAuthGuard)
  getLeaderboard(
    @Param('pollId') pollId: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.pollsService.getPollLeaderboard(pollId, user?.userId ?? null);
  }

  @Post(':pollId/endorsements')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  togglePollEndorsement(
    @Param('pollId') pollId: string,
    @Body() dto: EndorsePollSubjectDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.togglePollEndorsement(
      pollId,
      dto.subjectId,
      user.userId,
      dto.subjectType,
    );
  }
}
