import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PollsService } from './polls.service';
import { RestaurantMentionsService } from './restaurant-mentions.service';
import { RestaurantMentionsQueryDto } from './dto/restaurant-mentions.dto';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { ListUserPollsDto } from './dto/list-user-polls.dto';
import {
  CreateCommentDto,
  EditCommentDto,
  ListCommentsQueryDto,
} from './dto/create-comment.dto';
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CheckPollDuplicateDto } from './dto/check-poll-duplicate.dto';
import { EndorsePollSubjectDto } from './dto/endorse-poll-subject.dto';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { UserBlockService } from '../identity/user-block.service';
import { OptionalClerkAuthGuard } from '../identity/auth/optional-clerk-auth.guard';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import { CurrentUser } from '../../shared';

@Controller('polls')
export class PollsController {
  constructor(
    private readonly pollsService: PollsService,
    private readonly restaurantMentionsService: RestaurantMentionsService,
    private readonly blocks: UserBlockService,
  ) {}

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

  // Stage-1 creation dedup — fast text-similarity check before any LLM resolution.
  @Post('check-duplicate')
  @UseGuards(OptionalClerkAuthGuard)
  checkDuplicate(@Body() dto: CheckPollDuplicateDto) {
    return this.pollsService.checkDuplicate(dto);
  }

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  listMyPolls(@Query() query: ListUserPollsDto, @CurrentUser() user: User) {
    return this.pollsService.listPollsForUser(user.userId, query);
  }

  /** User-profile sections (page-registry §7.3 Polls/Comments): the SAME
   *  activity-parameterized read as /polls/me, aimed at another user. Authed
   *  (profile sections live behind the wall); a blocked pair sees nothing
   *  (§8.6 enforcement seam). */
  @Get('users/:userId')
  @UseGuards(ClerkAuthGuard)
  async listUserPolls(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query() query: ListUserPollsDto,
    @CurrentUser() user: User,
  ) {
    if (await this.blocks.isBlockedPair(user.userId, userId)) {
      return { activity: query.activity ?? 'created', polls: [] };
    }
    return this.pollsService.listPollsForUser(userId, query);
  }

  /** §7.3 Comments section: the user's own comment rows (Reddit-style),
   *  approved + non-deleted only, newest first, with poll context. */
  @Get('users/:userId/comments')
  @UseGuards(ClerkAuthGuard)
  async listUserComments(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: User,
  ) {
    if (await this.blocks.isBlockedPair(user.userId, userId)) {
      return [];
    }
    return this.pollsService.listCommentsByUser(userId);
  }

  // W3 (page-registry §8.4): the restaurant Discussions aggregation — mention
  // tags + thread-merged mention cards. MUST stay above `@Get(':pollId')`.
  @Get('restaurants/:restaurantId/mentions')
  @UseGuards(OptionalClerkAuthGuard)
  getRestaurantMentions(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query() query: RestaurantMentionsQueryDto,
  ) {
    return this.restaurantMentionsService.getRestaurantMentions(restaurantId, {
      sort: query.sort,
      search: query.search,
      tagEntityIds: query.tags,
    });
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
