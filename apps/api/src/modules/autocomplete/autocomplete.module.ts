import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { SearchModule } from '../search/search.module';
import { AutocompleteService } from './autocomplete.service';
import { AutocompleteController } from './autocomplete.controller';

@Module({
  imports: [SharedModule, EntityResolverModule, SearchModule],
  controllers: [AutocompleteController],
  providers: [AutocompleteService],
  exports: [AutocompleteService],
})
export class AutocompleteModule {}
