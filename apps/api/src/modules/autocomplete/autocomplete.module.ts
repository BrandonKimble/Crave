import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { SearchModule } from '../search/search.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AutocompleteService } from './autocomplete.service';
import { AutocompleteController } from './autocomplete.controller';
import { EntitySearchService } from './entity-search.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [
    SharedModule,
    EntityResolverModule,
    SearchModule,
    PrismaModule,
    IdentityModule,
  ],
  controllers: [AutocompleteController],
  providers: [AutocompleteService, EntitySearchService],
  exports: [AutocompleteService, EntitySearchService],
})
export class AutocompleteModule {}
