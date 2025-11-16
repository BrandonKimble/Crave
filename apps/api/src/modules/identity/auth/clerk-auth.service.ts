import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/clerk-sdk-node';

export interface ClerkJwtClaims {
  sub?: string;
  sid?: string;
  aud?: string | string[];
  email?: string;
  email_address?: string;
  email_addresses?: Array<{ email_address?: string }>;
  [key: string]: unknown;
}

@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);
  private readonly secretKey?: string;
  private readonly audience: string[] | undefined;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('clerk.secretKey') || undefined;
    const rawAudience = this.configService.get<string>('clerk.jwtAudience');
    this.audience = this.parseAudience(rawAudience);

    if (rawAudience) {
      this.logger.log(
        `Configured Clerk JWT audience raw value: ${rawAudience} -> parsed: ${
          this.audience ? JSON.stringify(this.audience) : '[]'
        }`,
      );
    } else {
      this.logger.warn(
        'No Clerk JWT audience configured; skipping audience validation',
      );
    }
  }

  private parseAudience(value?: string): string[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const audiences: string[] = [];

    const consume = (input: unknown): void => {
      if (input === undefined || input === null) {
        return;
      }

      if (Array.isArray(input)) {
        input.forEach(consume);
        return;
      }

      let stringValue = '';
      if (typeof input === 'string') {
        stringValue = input;
      } else if (
        typeof input === 'number' ||
        typeof input === 'boolean' ||
        typeof input === 'bigint'
      ) {
        stringValue = String(input);
      } else if (typeof input === 'object') {
        try {
          stringValue = JSON.stringify(input);
        } catch {
          stringValue = '';
        }
      }
      stringValue = stringValue.trim();
      if (!stringValue) {
        return;
      }

      const hasWrappingQuotes =
        (stringValue.startsWith('"') && stringValue.endsWith('"')) ||
        (stringValue.startsWith("'") && stringValue.endsWith("'"));
      if (hasWrappingQuotes) {
        consume(stringValue.slice(1, -1));
        return;
      }

      if (stringValue.startsWith('[') && stringValue.endsWith(']')) {
        try {
          consume(JSON.parse(stringValue));
          return;
        } catch {
          // fall through and treat as plain string if JSON.parse fails
          stringValue = stringValue.replace(/^\[+|\]+$/g, '').trim();
        }
      }

      if (!stringValue) {
        return;
      }

      // If the value still contains comma separated entries, split again.
      if (stringValue.includes(',')) {
        stringValue
          .split(',')
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0)
          .forEach(consume);
        return;
      }

      audiences.push(stringValue);
    };

    consume(value);

    return audiences.length > 0 ? audiences : undefined;
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
      const verified = (await verifyToken(token, {
        secretKey: this.secretKey,
      })) as ClerkJwtClaims;

      if (this.audience && this.audience.length > 0) {
        const tokenAudiences = this.normalizeAudienceClaim(verified.aud);
        const hasMatch = tokenAudiences.some((claim) =>
          this.audience?.includes(claim),
        );
        if (!hasMatch) {
          throw new UnauthorizedException(
            `Invalid Clerk token: audience ${JSON.stringify(
              tokenAudiences,
            )} is not in ${JSON.stringify(this.audience)}`,
          );
        }
      }

      return verified;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new UnauthorizedException(`Invalid Clerk token: ${reason}`);
    }
  }

  private normalizeAudienceClaim(claim?: unknown): string[] {
    if (!claim) {
      return [];
    }
    if (Array.isArray(claim)) {
      return claim
        .map((value) =>
          typeof value === 'string' ? value.trim() : String(value),
        )
        .filter((value) => value.length > 0);
    }
    if (typeof claim === 'string') {
      return claim
        .split(',')
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
        .filter((value) => value.length > 0);
    }
    if (
      typeof claim === 'number' ||
      typeof claim === 'boolean' ||
      typeof claim === 'bigint'
    ) {
      return [String(claim)];
    }
    if (typeof claim === 'object') {
      try {
        return [JSON.stringify(claim)];
      } catch {
        return [];
      }
    }
    return [];
  }
}
