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

/** W3 messaging endpoints (plans/w3-messaging-design.md §3.2). Sits behind
 *  the paywall like the rest of the social product. */
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

  @Post('share')
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
  sendMessage(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user.userId, conversationId, dto);
  }

  @Put('conversations/:id/read')
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
  acceptRequest(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messaging.acceptRequest(user.userId, conversationId);
  }
}
