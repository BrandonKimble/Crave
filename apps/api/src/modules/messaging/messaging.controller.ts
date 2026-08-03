import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { MessagingService } from './messaging.service';
import {
  AdvanceReadCursorDto,
  CreateConversationDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
  ShareFanOutDto,
} from './dto/messaging.dto';
import { NoSignal } from '../signals/records-signal.decorator';

/** W3 messaging endpoints (plans/w3-messaging-design.md §3.2). Sits behind
 *  the paywall like the rest of the social product. */
// NO ACT IN THIS CONTROLLER REACHES THE LEDGER, AND THAT IS A DECISION
// (F203 / D20b). Direct messaging is person-to-person, not person-to-place:
// none of the nine declared signal kinds describes it, and demand mass must
// not be moveable by two accounts talking to each other. Sharing a PLACE in a
// message is the closest call — the recipient's OPEN of that share is the act
// that matters, and it is recorded where it lands (entity_view / search).
@Controller('messaging')
@UseGuards(ClerkAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('conversations')
  listConversations(
    @CurrentUser() user: User,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.messaging.listConversations(user.userId, query);
  }

  @Post('conversations')
  @NoSignal('opens a person-to-person thread; not demand for any place')
  createConversation(
    @CurrentUser() user: User,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.getOrCreateConversation(user.userId, dto.otherUserId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: User) {
    return this.messaging.unreadCount(user.userId);
  }

  /** Ranked "Send to" candidates for the universal share modal (follow graph
   *  both ways, blocked pairs excluded, ClosenessService order). */
  @Get('share-targets')
  shareTargets(@CurrentUser() user: User) {
    return this.messaging.shareTargets(user.userId);
  }

  @Post('share')
  // The SEND is not the demand; the recipient's open is, and it records
  // where it lands.
  @NoSignal(
    "share fan-out; the recipient's open is the act, recorded at its own surface",
  )
  share(@CurrentUser() user: User, @Body() dto: ShareFanOutDto) {
    return this.messaging.shareFanOut(user.userId, dto);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messaging.getConversation(user.userId, conversationId);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messaging.listMessages(user.userId, conversationId, query);
  }

  @Post('conversations/:id/messages')
  @NoSignal('person-to-person message; no declared kind describes it')
  sendMessage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user.userId, conversationId, dto);
  }

  @Put('conversations/:id/read')
  @NoSignal(
    'read-cursor bookkeeping; reading a message is not demand for a place',
  )
  advanceReadCursor(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: AdvanceReadCursorDto,
  ) {
    return this.messaging.advanceReadCursor(
      user.userId,
      conversationId,
      dto.lastReadMessageAt,
    );
  }

  @Post('conversations/:id/accept')
  @NoSignal('message-request acceptance: a social permission, not a demand act')
  acceptRequest(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messaging.acceptRequest(user.userId, conversationId);
  }
}
