import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../shared/shared.module';
import { PrismaService } from './prisma.service';
import { DatabaseValidationService } from '../config/database-validation.service';
import { DatabaseHealthController } from './database-health.controller';
import { DatabaseMetricsService } from './database-metrics.service';

@Module({
  imports: [ConfigModule, SharedModule],
  controllers: [DatabaseHealthController],
  providers: [PrismaService, DatabaseValidationService, DatabaseMetricsService],
  exports: [PrismaService, DatabaseMetricsService]
})
export class PrismaModule {}
