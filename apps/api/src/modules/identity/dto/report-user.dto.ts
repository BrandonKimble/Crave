import { IsIn } from 'class-validator';
import {
  USER_REPORT_REASONS,
  type UserReportReason,
} from '../user-report.service';

export class ReportUserDto {
  @IsIn(USER_REPORT_REASONS)
  reason!: UserReportReason;
}
