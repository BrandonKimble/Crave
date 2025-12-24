import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { GoogleGeocodingModule } from '../external-integrations/google-geocoding/google-geocoding.module';
import { CoverageKeyResolverService } from './coverage-key-resolver.service';
import { CoverageRegistryService } from './coverage-registry.service';
import { CoverageKeyController } from './coverage-key.controller';

@Module({
  imports: [PrismaModule, SharedModule, GoogleGeocodingModule],
  controllers: [CoverageKeyController],
  providers: [CoverageKeyResolverService, CoverageRegistryService],
  exports: [CoverageKeyResolverService, CoverageRegistryService],
})
export class CoverageKeyModule {}
