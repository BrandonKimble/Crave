import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SaveableEntityResolver } from './saveable-entity.resolver';

/**
 * The one "is this a live, saveable entity?" law (D36), in its OWN module for
 * the same reason UserListAccessModule exists: consumers (user-lists, photos,
 * history, messaging, home) import the LAW, not whichever feature module
 * happened to own it first.
 */
@Module({
  imports: [PrismaModule],
  providers: [SaveableEntityResolver],
  exports: [SaveableEntityResolver],
})
export class EntityAccessModule {}
