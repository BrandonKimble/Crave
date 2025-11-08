import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/clerk-sdk-node';

export interface ClerkJwtClaims {
  sub?: string;
  sid?: string;
  email?: string;
  email_address?: string;
  email_addresses?: Array<{ email_address?: string }>;
  [key: string]: unknown;
}

@Injectable()
export class ClerkAuthService {
  private readonly secretKey?: string;
  private readonly audience: string[] | undefined;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('clerk.secretKey') || undefined;
    const rawAudience = this.configService.get<string>('clerk.jwtAudience');
    this.audience = rawAudience
      ?.split(',')
      .map((entry) => entry.trim())
      .filter((value) => value.length > 0);
  }

  extractBearerToken(header?: string): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token;
  }

  async verifyToken(token?: string): Promise<ClerkJwtClaims> {
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }
    if (!this.secretKey) {
      throw new UnauthorizedException('Clerk secret key is not configured');
    }

    try {
      const verified = await verifyToken(token, {
        secretKey: this.secretKey,
        audience:
          this.audience && this.audience.length > 0 ? this.audience : undefined,
      });
      return verified as ClerkJwtClaims;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new UnauthorizedException(`Invalid Clerk token: ${reason}`);
    }
  }
}
