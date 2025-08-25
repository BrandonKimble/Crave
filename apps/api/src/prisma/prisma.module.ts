import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../shared/shared.module';
import { PrismaService } from './prisma.service';
import { DatabaseValidationService } from '../config/database-validation.service';

@Module({
  imports: [ConfigModule, SharedModule],
  providers: [PrismaService, DatabaseValidationService],
  exports: [PrismaService],
})
export class PrismaModule {}
