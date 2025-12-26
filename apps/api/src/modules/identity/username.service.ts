import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { LoggerService } from '../../shared';

export type UsernameAvailabilityReason =
  | 'available'
  | 'taken'
  | 'reserved'
  | 'invalid_format'
  | 'too_short'
  | 'too_long'
  | 'blocked_word'
  | 'profanity'
  | 'cooldown';

export interface UsernameAvailabilityResult {
  normalized: string;
  available: boolean;
  reason: UsernameAvailabilityReason;
  suggestions: string[];
}

const USERNAME_REGEX = /^[a-z][a-z0-9]*([._]?[a-z0-9]+)*$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_COOLDOWN_DAYS = 30;

const RESERVED_EXACT = new Set([
  'admin',
  'support',
  'help',
  'root',
  'system',
  'staff',
  'moderator',
  'crave',
  'cravesearch',
  'crave-search',
  'api',
  'status',
  'security',
  'billing',
  'login',
  'signup',
  'profile',
  'settings',
  'favorites',
  'lists',
  'polls',
  'search',
  'about',
  'terms',
  'privacy',
  'jobs',
]);

const RESERVED_CONTAINS = ['official', 'real', 'team', 'verified', 'staff'];

@Injectable()
export class UsernameService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly moderationService: ModerationService,
  ) {
    this.logger = loggerService.setContext('UsernameService');
  }

  async checkAvailability(
    rawUsername: string,
    currentUserId?: string,
  ): Promise<UsernameAvailabilityResult> {
    const normalized = this.normalize(rawUsername);
    const formatResult = this.validateFormat(normalized);
    if (formatResult) {
      return {
        normalized,
        available: false,
        reason: formatResult,
        suggestions: this.suggestUsernames(normalized),
      };
    }

    if (currentUserId) {
      const user = await this.prisma.user.findUnique({
        where: { userId: currentUserId },
        select: { usernameUpdatedAt: true },
      });
      if (user?.usernameUpdatedAt) {
        const daysSince =
          (Date.now() - user.usernameUpdatedAt.getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSince < USERNAME_COOLDOWN_DAYS) {
          return {
            normalized,
            available: false,
            reason: 'cooldown',
            suggestions: this.suggestUsernames(normalized),
          };
        }
      }
    }

    if (this.isBlocked(normalized)) {
      return {
        normalized,
        available: false,
        reason: 'blocked_word',
        suggestions: this.suggestUsernames(normalized),
      };
    }

    const reserved = await this.prisma.reservedUsername.findUnique({
      where: { username: normalized },
      select: { username: true },
    });
    if (reserved) {
      return {
        normalized,
        available: false,
        reason: 'reserved',
        suggestions: this.suggestUsernames(normalized),
      };
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        username: normalized,
        ...(currentUserId ? { NOT: { userId: currentUserId } } : {}),
      },
      select: { userId: true },
    });
    if (existing) {
      return {
        normalized,
        available: false,
        reason: 'taken',
        suggestions: this.suggestUsernames(normalized),
      };
    }

    const prior = await this.prisma.usernameHistory.findFirst({
      where: {
        username: normalized,
        ...(currentUserId ? { NOT: { userId: currentUserId } } : {}),
      },
      select: { username: true },
    });
    if (prior) {
      return {
        normalized,
        available: false,
        reason: 'taken',
        suggestions: this.suggestUsernames(normalized),
      };
    }

    const moderationDecision =
      normalized.length > 0
        ? await this.moderationService.moderateText(normalized)
        : { allowed: true };
    if (!moderationDecision.allowed) {
      return {
        normalized,
        available: false,
        reason: 'profanity',
        suggestions: this.suggestUsernames(normalized),
      };
    }

    return {
      normalized,
      available: true,
      reason: 'available',
      suggestions: [],
    };
  }

  async claimUsername(userId: string, rawUsername: string) {
    const availability = await this.checkAvailability(rawUsername, userId);
    if (!availability.available) {
      throw new BadRequestException(
        `Username unavailable: ${availability.reason}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { usernameUpdatedAt: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.usernameUpdatedAt) {
      const daysSince =
        (Date.now() - user.usernameUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < USERNAME_COOLDOWN_DAYS) {
        throw new BadRequestException(
          `Username can be changed every ${USERNAME_COOLDOWN_DAYS} days`,
        );
      }
    }

    const normalized = availability.normalized;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId },
        data: {
          username: normalized,
          usernameStatus: 'active',
          usernameUpdatedAt: new Date(),
        },
      });
      await tx.usernameHistory.upsert({
        where: {
          userId_username: { userId, username: normalized },
        },
        update: {},
        create: {
          userId,
          username: normalized,
        },
      });
    });

    this.logger.debug('Username claimed', { userId, username: normalized });
    return { username: normalized };
  }

  suggestUsernames(rawUsername: string): string[] {
    const normalized = this.normalize(rawUsername);
    const base = normalized.replace(/[._]+$/g, '');
    const candidates = [
      `${base}1`,
      `${base}2`,
      `${base}3`,
      `${base}_app`,
      `${base}_food`,
      `${base}.co`,
      `${base}_${new Date().getFullYear()}`,
    ];

    return candidates
      .map((candidate) => candidate.toLowerCase())
      .filter((candidate) => candidate.length >= USERNAME_MIN_LENGTH)
      .filter((candidate) => candidate.length <= USERNAME_MAX_LENGTH)
      .filter((candidate) => USERNAME_REGEX.test(candidate))
      .slice(0, 5);
  }

  private normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '');
  }

  private validateFormat(
    normalized: string,
  ): UsernameAvailabilityReason | null {
    if (normalized.length < USERNAME_MIN_LENGTH) {
      return 'too_short';
    }
    if (normalized.length > USERNAME_MAX_LENGTH) {
      return 'too_long';
    }
    if (!USERNAME_REGEX.test(normalized)) {
      return 'invalid_format';
    }
    if (/^\d+$/.test(normalized)) {
      return 'invalid_format';
    }
    return null;
  }

  private isBlocked(normalized: string): boolean {
    if (RESERVED_EXACT.has(normalized)) {
      return true;
    }
    return RESERVED_CONTAINS.some((fragment) => normalized.includes(fragment));
  }
}
