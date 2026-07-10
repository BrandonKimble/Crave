import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import { EntitlementService } from './entitlement.service';

/**
 * The ONE-CALL hooks future features use to pay out earned access
 * (plans/payments-ideal-shape.md step 3). Day amounts are env-tunable;
 * lifetime caps are enforced (clamped, never errored) inside
 * EntitlementService.grant. Idempotency rides sourceRef: the same photoId /
 * invitee can never pay twice.
 *
 * DORMANT BY DEFAULT (hard-paywall decision 2026-07-09): under the launch
 * model everyone in the app already pays, so "earn free days" is not trial
 * currency — ledger day-grants only matter to someone whose subscription
 * lapses (win-back cushion). Day amounts default to 0; set
 * REWARD_PHOTO_DAYS / REWARD_REFERRAL_DAYS > 0 to activate (the freemium
 * pivot, or an explicit win-back campaign).
 */
@Injectable()
export class RewardGrantService {
  private readonly logger: LoggerService;
  private readonly photoDays = Number(process.env.REWARD_PHOTO_DAYS ?? 0);
  private readonly referralDays = Number(process.env.REWARD_REFERRAL_DAYS ?? 0);

  constructor(
    private readonly entitlements: EntitlementService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RewardGrantService');
  }

  /** Called by the (future) image pipeline when a user's photo is accepted. */
  async grantPhotoReward(params: {
    userId: string;
    photoId: string;
  }): Promise<void> {
    if (this.photoDays <= 0) return;
    if (await this.alreadyRewarded(params.userId, `photo:${params.photoId}`)) {
      return;
    }
    await this.entitlements.grant({
      userId: params.userId,
      source: 'reward_photo',
      days: this.photoDays,
      sourceRef: `photo:${params.photoId}`,
    });
  }

  /** Double-sided referral: both inviter and invitee get days. Called by the
   *  (future) invite flow once the invitee completes signup. */
  async grantReferralReward(params: {
    inviterUserId: string;
    inviteeUserId: string;
  }): Promise<void> {
    if (this.referralDays <= 0) return;
    const ref = `referral:${params.inviteeUserId}`;
    if (!(await this.alreadyRewarded(params.inviterUserId, ref))) {
      await this.entitlements.grant({
        userId: params.inviterUserId,
        source: 'reward_referral',
        days: this.referralDays,
        sourceRef: ref,
        metadata: { role: 'inviter' },
      });
    }
    if (!(await this.alreadyRewarded(params.inviteeUserId, ref))) {
      await this.entitlements.grant({
        userId: params.inviteeUserId,
        source: 'reward_referral',
        days: this.referralDays,
        sourceRef: ref,
        metadata: { role: 'invitee' },
      });
    }
  }

  private async alreadyRewarded(
    userId: string,
    sourceRef: string,
  ): Promise<boolean> {
    const existing = await this.entitlements.findGrantByRef(userId, sourceRef);
    if (existing) {
      this.logger.debug('Reward already paid for sourceRef', {
        userId,
        sourceRef,
      });
      return true;
    }
    return false;
  }
}
