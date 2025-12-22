import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CoverageKeyResolverService } from './coverage-key-resolver.service';

@Module({
  imports: [PrismaModule],
  providers: [CoverageKeyResolverService],
  exports: [CoverageKeyResolverService],
})
export class CoverageKeyModule {}
