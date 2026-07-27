import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { CurrentUser } from '../../shared';
import { UserListsService } from './user-lists.service';
import { CreateUserListDto } from './dto/create-user-list.dto';
import { UpdateUserListDto } from './dto/update-user-list.dto';
import { AddUserListItemDto } from './dto/add-user-list-item.dto';
import { UpdateUserListPositionDto } from './dto/update-user-list-position.dto';
import { UpdateUserListItemDto } from './dto/update-user-list-item.dto';
import { ShareUserListDto } from './dto/share-user-list.dto';
import { ListUserListsDto } from './dto/list-user-lists.dto';
import { BatchMembershipsDto } from './dto/batch-memberships.dto';
import { UserListResultsDto } from './dto/user-list-results.dto';
import { JoinUserListCollaboratorsDto } from './dto/join-user-list-collaborators.dto';
import { ReorderUserListItemsDto } from './dto/reorder-user-list-items.dto';

@Controller('lists')
@UseGuards(ClerkAuthGuard)
export class UserListsController {
  constructor(private readonly userListsService: UserListsService) {}

  @Get()
  listLists(@CurrentUser() user: User, @Query() query: ListUserListsDto) {
    return this.userListsService.listForUser(user.userId, query);
  }

  // Red-team W2 (page-registry §8.4): the viewer's lists containing an entity
  // (restaurant or dish connection), incl. each item's saved note — feeds the
  // restaurant Overview "your saved note" block.
  @Get('entities/:entityId/memberships')
  listEntityMemberships(
    @CurrentUser() user: User,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.userListsService.listMembershipsForEntity(
      user.userId,
      entityId,
    );
  }

  // ONE batched saved-anywhere read for a screenful of cards (plus/saved
  // pill state). Static path — declared before the ':listId' param routes.
  @Post('memberships')
  listMembershipsBatch(
    @CurrentUser() user: User,
    @Body() dto: BatchMembershipsDto,
  ) {
    return this.userListsService.listMembershipsBatch(user.userId, dto);
  }

  @Post()
  createList(@CurrentUser() user: User, @Body() dto: CreateUserListDto) {
    return this.userListsService.createList(user.userId, dto);
  }

  // ── The heart verb (kind law 2026-07-26) ──────────────────────────────────
  // Static 'lists/favorites/...' routes MUST be declared before the
  // 'lists/:listId/...' param routes (registration order is match order; the
  // UUID pipe would 400 'favorites'). Ensure-then-add/remove: the favorites-
  // kind list is lazily created on first heart. Bodies are the normal
  // add-item selector (restaurantId XOR connectionId [+ locationId, note]).
  @Post('favorites/items')
  addFavoriteItem(@CurrentUser() user: User, @Body() dto: AddUserListItemDto) {
    return this.userListsService.addFavoriteItem(user.userId, dto);
  }

  // Unheart by TARGET (same selector body — the client doesn't know itemIds).
  @Delete('favorites/items')
  @HttpCode(204)
  removeFavoriteItem(
    @CurrentUser() user: User,
    @Body() dto: AddUserListItemDto,
  ) {
    return this.userListsService.removeFavoriteItemByTarget(user.userId, dto);
  }

  @Get(':listId')
  getList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    // RT-18: shared reads present the slug (query param on the GET).
    @Query('shareSlug') shareSlug?: string,
  ) {
    return this.userListsService.getListForUser(user.userId, listId, shareSlug);
  }

  // No ParseUUIDPipe: also accepts the virtual All ids
  // ('all:restaurants' / 'all:dishes'); the service validates concrete ids.
  @Post(':listId/results')
  getListResults(
    @CurrentUser() user: User,
    @Param('listId') listId: string,
    @Body() dto: UserListResultsDto,
  ) {
    return this.userListsService.getListResults(user.userId, listId, dto);
  }

  // City-chip vocabulary (§8.16 "sliced by city"): the distinct catalog
  // cities present in the list. POST for parity with /results (carries the
  // same access dto: shareSlug / targetUserId); accepts virtual All ids.
  @Post(':listId/cities')
  listCitiesForList(
    @CurrentUser() user: User,
    @Param('listId') listId: string,
    @Body() dto: UserListResultsDto,
  ) {
    return this.userListsService.listCitiesForList(user.userId, listId, dto);
  }

  @Get(':listId/collaborators')
  getCollaborators(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Query('shareSlug') shareSlug?: string,
  ) {
    return this.userListsService.getCollaborators(
      user.userId,
      listId,
      shareSlug,
    );
  }

  @Post(':listId/collaborators/join')
  joinCollaborators(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: JoinUserListCollaboratorsDto,
  ) {
    return this.userListsService.joinCollaborators(
      user.userId,
      listId,
      dto.shareSlug,
    );
  }

  @Delete(':listId/collaborators/:userId')
  @HttpCode(204)
  removeCollaborator(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.userListsService.removeCollaborator(
      user.userId,
      listId,
      targetUserId,
    );
  }

  @Patch(':listId/items/order')
  reorderListItems(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: ReorderUserListItemsDto,
  ) {
    return this.userListsService.reorderItems(
      user.userId,
      listId,
      dto.orderedItemIds,
    );
  }

  @Patch(':listId')
  updateList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateUserListDto,
  ) {
    return this.userListsService.updateList(user.userId, listId, dto);
  }

  @Patch(':listId/position')
  updateListPosition(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateUserListPositionDto,
  ) {
    return this.userListsService.updateListPosition(
      user.userId,
      listId,
      dto.position,
    );
  }

  @Post(':listId/items')
  addListItem(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: AddUserListItemDto,
  ) {
    return this.userListsService.addItem(user.userId, listId, dto);
  }

  @Patch(':listId/items/:itemId')
  updateListItem(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateUserListItemDto,
  ) {
    return this.userListsService.updateItem(user.userId, listId, itemId, dto);
  }

  @Delete(':listId/items/:itemId')
  @HttpCode(204)
  removeListItem(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.userListsService.removeItem(user.userId, listId, itemId);
  }

  @Post(':listId/share')
  enableShare(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: ShareUserListDto,
  ) {
    return this.userListsService.enableShare(user.userId, listId, dto);
  }

  @Delete(':listId/share')
  @HttpCode(204)
  disableShare(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.userListsService.disableShare(user.userId, listId);
  }

  @Delete(':listId')
  @HttpCode(204)
  removeList(
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
  ) {
    return this.userListsService.deleteList(user.userId, listId);
  }
}
