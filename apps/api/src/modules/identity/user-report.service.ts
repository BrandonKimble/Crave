import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** §9b profileActions user-report reasons (validated at the controller DTO). */
export const USER_REPORT_REASONS = [
  'spam',
  'harassment',
  'impersonation',
  'other',
] as const;

export type UserReportReason = (typeof USER_REPORT_REASONS)[number];

/**
 * User reporting (page-registry §9b profileActions — the Apple 1.2 UGC
 * requirement, alongside block). v1 RECORDS ONLY: no automated consequence;
 * moderation is human for now and reads user_reports directly. Dedupe = the
 * unique (reporter, reported) pair — a repeat report is a quiet no-op (the
 * first reason stands).
 */
@Injectable()
export class UserReportService {
  constructor(private readonly prisma: PrismaService) {}

  async reportUser(
    reporterUserId: string,
    reportedUserId: string,
    reason: UserReportReason,
  ) {
    if (reporterUserId === reportedUserId) {
      throw new BadRequestException('Cannot report yourself');
    }
    const reported = await this.prisma.user.findUnique({
      where: { userId: reportedUserId },
      select: { userId: true, deletedAt: true },
    });
    if (!reported || reported.deletedAt) {
      throw new NotFoundException('User not found');
    }
    try {
      await this.prisma.userReport.create({
        data: { reporterUserId, reportedUserId, reason },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { reported: true }; // already reported by this user
      }
      throw error;
    }
    return { reported: true };
  }
}
