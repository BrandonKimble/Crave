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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { PollsService } from './polls.service';
import { PlaceMentionsService } from './restaurant-mentions.service';
import { PlaceMentionsQueryDto } from './dto/restaurant-mentions.dto';
import { ListUserPollsDto } from './dto/list-user-polls.dto';
import {
  CreateCommentDto,
  EditCommentDto,
  ListCommentsQueryDto,
  ReportCommentDto,
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
import { RequestLocale, type SupportedLocale } from '../../shared/locale';
import type { AuthenticatedRequest } from '../../shared';
import { UserDevicesService } from '../identity/user-devices.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { NoSignal, RecordsSignal } from '../signals/records-signal.decorator';

@Controller('polls')
export class PollsController {
  constructor(
    private readonly pollsService: PollsService,
    private readonly placeMentionsService: PlaceMentionsService,
    private readonly blocks: UserBlockService,
  ) {}

  // The legacy market-keyed GET / feed is DEAD (§22 item 5): the feed is the
  // viewport-scoped POST /polls/query below (places-in-view + cursor).
  // AUTHENTICATED (2026-08-01): this is the heaviest read in the app — it
  // clips and serializes every catalog ground touching the viewport. Left
  // anonymous it was a free, IP-tracked way to spend our Postgres. The
  // share-link reads below stay anonymous deliberately: opening a shared
  // poll must not require an account.
  @Post('query')
  // POST for the viewport BODY; it reads the feed and changes nothing. The
  // browse act it serves IS recorded — as 'viewport_dwell', by the client's
  // settle tick at POST /signals/viewport-dwell, which is the seam that
  // knows attention SETTLED rather than merely scrolled past.
  @NoSignal(
    'viewport feed read; the browse act is recorded as viewport_dwell at its own settle seam',
  )
  @RateLimitTier('heavyGeoRead')
  @UseGuards(ClerkAuthGuard)
  queryPolls(
    @Body() body: QueryPollsDto,
    @RequestLocale() locale: SupportedLocale,
    @CurrentUser() user?: User | null,
  ) {
    return this.pollsService.queryPolls(body, user?.userId ?? null, locale);
  }

  @Post()
  @RecordsSignal('poll_created')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  createPoll(@Body() dto: CreatePollDto, @CurrentUser() user: User) {
    return this.pollsService.createPoll(dto, user.userId);
  }

  // Stage-1 creation dedup — fast text-similarity check before any LLM resolution.
  // AUTHENTICATED: this exists only to serve the creation flow, which is
  // authenticated anyway — there was never a reason for it to be open.
  @Post('check-duplicate')
  // A pre-flight similarity check inside the creation flow. The act is the
  // creation, recorded by POST /polls; recording here would count an
  // abandoned draft as demand.
  @NoSignal(
    'pre-flight duplicate check; the act is the creation, recorded by POST /polls',
  )
  @RateLimitTier('heavyGeoRead')
  @UseGuards(ClerkAuthGuard)
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
  // PUBLIC BY DECLARATION, not by the absence of a token (2026-08-02): the
  // paywall now blocks an anonymous caller on any surface that has not said
  // it is public. These four reads are the share-link surface — opening a
  // shared poll must not require an account, let alone a subscription.
  @AllowUnentitled()
  @Get('restaurants/:restaurantId/mentions')
  @UseGuards(OptionalClerkAuthGuard)
  getPlaceMentions(
    @Param('placeId', new ParseUUIDPipe()) placeId: string,
    @Query() query: PlaceMentionsQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.placeMentionsService.getPlaceMentions(placeId, {
      sort: query.sort,
      search: query.search,
      tagEntityIds: query.tags,
      // Blocking: an authed viewer never sees blocked peers' mention cards/replies.
      viewerUserId: user?.userId,
    });
  }

  @AllowUnentitled()
  @Get(':pollId')
  @UseGuards(OptionalClerkAuthGuard)
  getPoll(
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @RequestLocale() locale: SupportedLocale,
  ) {
    // F6 (wave-3 red team): the share link — the most viral surface — was
    // the one poll read NOT localized, while asserting Content-Language.
    return this.pollsService.getPoll(pollId, locale);
  }

  @AllowUnentitled()
  @Get(':pollId/comments')
  @UseGuards(OptionalClerkAuthGuard)
  listComments(
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
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
  @RecordsSignal('poll_comment')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  postComment(
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.postComment(pollId, dto, user.userId);
  }

  @Patch('comments/:commentId')
  // Editing revises an act already in the ledger. The ledger is append-only
  // and never rekeyed (§3), and one comment must weigh 1 however many times
  // its text is corrected.
  @NoSignal(
    'revises an act already recorded; a second row would double-count one comment',
  )
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  editComment(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() dto: EditCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.editComment(commentId, dto, user.userId);
  }

  @Delete('comments/:commentId')
  // The ledger is APPEND-ONLY by law: a retraction never deletes the act
  // that happened. Enforcement on confirmed abuse is the documented
  // three-seam procedure, wholesale — not a compensating signal row.
  @NoSignal('append-only ledger: a deletion never unwrites the act it retracts')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  deleteComment(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.deleteComment(commentId, user.userId);
  }

  /** §9b reportContent (Apple 1.2 UGC): report a comment. Records only —
   *  human moderation reads the table; dedupe is a quiet no-op. */
  @Post('comments/:commentId/report')
  // A moderation report is a claim ABOUT content, not demand FOR a place.
  // It has its own table, which human moderation reads.
  @NoSignal(
    'moderation report: a claim about content, not a demand act; recorded in its own table',
  )
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  reportComment(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() dto: ReportCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.reportComment(commentId, user.userId, dto.reason);
  }

  // A like toggle triggers a full leaderboard rebuild, so it's both a spam and a
  // DB-load vector — throttle it like the other poll writes.
  @Post('comments/:commentId/likes')
  // Deliberately NOT a ledger kind: a comment like expresses agreement with
  // a person, not demand for a subject, and the nine declared kinds do not
  // include one. Adding a kind is an owner decision, not a call-site one.
  @NoSignal(
    'comment like is agreement with a person, not demand for a subject; no declared kind covers it',
  )
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  toggleCommentLike(
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @CurrentUser() user: User,
  ) {
    return this.pollsService.toggleCommentLike(commentId, user.userId);
  }

  @AllowUnentitled()
  @Get(':pollId/leaderboard')
  @UseGuards(OptionalClerkAuthGuard)
  getLeaderboard(
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.pollsService.getPollLeaderboard(pollId, user?.userId ?? null);
  }

  @Post(':pollId/endorsements')
  @RecordsSignal('poll_vote')
  @RateLimitTier('sensitive')
  @UseGuards(ClerkAuthGuard)
  togglePollEndorsement(
    @Param('pollId', new ParseUUIDPipe()) pollId: string,
    @Body() dto: EndorsePollSubjectDto,
    @CurrentUser() user: User,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.pollsService.togglePollEndorsement(
      pollId,
      dto.subjectId,
      user.userId,
      dto.subjectType,
      // Vote-time audit context (plans/vote-integrity-ladder.md): the ip is
      // HMAC'd in the service (raw ip never stored); the device key is the
      // keychain install id, validated to the same shape as the guard seam.
      {
        ip: request.ip ?? null,
        deviceKey: UserDevicesService.extractDeviceKey(
          request.headers?.['x-device-key'],
        ),
      },
    );
  }
}
