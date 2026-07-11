import { MessageKind, SharedEntityKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** W3 messaging DTOs (plans/w3-messaging-design.md §3.2). */

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(['inbox', 'requests'])
  filter?: 'inbox' | 'requests';

  /** Opaque cursor: `${lastMessageAtISO}|${conversationId}`. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateConversationDto {
  @IsUUID()
  otherUserId!: string;
}

export class ListMessagesQueryDto {
  /** Pages OLDER history: `${createdAtISO}|${messageId}` of the oldest loaded row. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;

  /** Fetches NEWER than this ISO timestamp (the poll). */
  @IsOptional()
  @IsISO8601()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SendMessageDto {
  @IsEnum(MessageKind)
  kind!: MessageKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsEnum(SharedEntityKind)
  sharedEntityKind?: SharedEntityKind;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sharedEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientDedupeId?: string;
}

export class AdvanceReadCursorDto {
  @IsISO8601()
  lastReadMessageAt!: string;
}

export class ShareFanOutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  recipientUserIds!: string[];

  @IsEnum(SharedEntityKind)
  sharedEntityKind!: SharedEntityKind;

  @IsString()
  @MaxLength(64)
  sharedEntityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}

/** ---- Response shapes (design §3.2) ---- */

export type SharePackagePreviewDto =
  | {
      unavailable: true;
      kind: SharedEntityKind;
      id: string;
    }
  | {
      unavailable: false;
      kind: SharedEntityKind;
      id: string;
      title: string;
      subtitle: string | null;
      imageUrl: string | null;
    };

export type MessageDto = {
  messageId: string;
  senderUserId: string;
  kind: MessageKind;
  body: string | null;
  sharedEntity: SharePackagePreviewDto | null;
  createdAt: string;
  clientDedupeId: string | null;
};

export type ConversationPeerDto = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type ConversationDto = {
  conversationId: string;
  otherUser: ConversationPeerDto;
  lastMessage: MessageDto | null;
  lastMessageAt: string;
  unreadCount: number;
  /** §1.1 derived rule, computed server-side ONLY. */
  isRequest: boolean;
  /** §2.3 derived (user_blocks EXISTS), computed server-side ONLY. */
  frozen: boolean;
};
