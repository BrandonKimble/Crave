import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { UserListAccessPolicy } from './user-list-access.policy';

/**
 * THE LIST ACCESS LAW, as its own module.
 *
 * Why it is not just a provider inside UserListsModule (rederived
 * 2026-08-03): the law has consumers OUTSIDE the user-lists feature — the
 * messaging share-preview needs it, and needing it is exactly why that surface
 * grew a second, divergent copy of the rule (it granted a preview on
 * `shareEnabled` alone, to anyone holding a listId, while this policy says the
 * slug is the capability). The alternatives were both wrong: exporting it from
 * UserListsModule drags Search + Photos + Signals into every consumer's graph,
 * and re-providing it locally mints a second instance of an authority that
 * exists to be singular.
 *
 * A shared law gets its own home. Consumers import the law, not the feature.
 */
@Module({
  imports: [PrismaModule, IdentityModule],
  providers: [UserListAccessPolicy],
  exports: [UserListAccessPolicy],
})
export class UserListAccessModule {}
