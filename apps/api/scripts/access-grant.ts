import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { EntitlementsModule } from '../src/modules/entitlements/entitlements.module';
import { EntitlementService } from '../src/modules/entitlements/entitlement.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Admin CLI for the access-grant ledger (plans/payments-ideal-shape.md).
 *
 *   # friends & family / press comps
 *   yarn ts-node scripts/access-grant.ts comp mom@example.com --lifetime --note "family"
 *   yarn ts-node scripts/access-grant.ts comp writer@press.com --days 365 --note "press 2026"
 *
 *   # inspect / revoke
 *   yarn ts-node scripts/access-grant.ts list mom@example.com
 *   yarn ts-node scripts/access-grant.ts revoke <grantId> --reason "partnership ended"
 */
async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = rest.indexOf(`--${name}`);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const has = (name: string): boolean => rest.includes(`--${name}`);

  // Boot ONLY the entitlements module (+ config) — this CLI needs nothing
  // else, starts in ~1s, and is immune to unrelated app-module churn.
  @Module({
    imports: [
      ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
      EntitlementsModule,
    ],
  })
  class AccessGrantCliModule {}
  const app = await NestFactory.createApplicationContext(AccessGrantCliModule, {
    logger: ['error', 'warn'],
  });
  const out = (message: string) => process.stdout.write(`${message}\n`);
  try {
    const entitlements = app.get(EntitlementService);
    const prisma = app.get(PrismaService);

    const resolveUser = async (email: string) => {
      const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { userId: true, email: true },
      });
      if (!user) throw new Error(`No user with email ${email}`);
      return user;
    };

    switch (command) {
      case 'comp': {
        const user = await resolveUser(target);
        const lifetime = has('lifetime');
        const days = flag('days') ? Number(flag('days')) : undefined;
        if (!lifetime && !days) {
          throw new Error('comp requires --lifetime or --days N');
        }
        const note = flag('note') ?? 'comp';
        // comp is an ABSOLUTE source: a timed comp carries a concrete expiry
        // (day-grant derivation is for earned rewards, not admin comps).
        const { grantId } = await entitlements.grant({
          userId: user.userId,
          source: 'comp',
          lifetime,
          ...(lifetime
            ? {}
            : {
                expiresAt: new Date(Date.now() + days! * 24 * 60 * 60 * 1000),
              }),
          sourceRef: note,
        });
        out(
          `✅ comp granted to ${user.email}: ${lifetime ? 'LIFETIME' : `${days} days`} (grant ${grantId}, note: ${note})`,
        );
        break;
      }
      case 'list': {
        const user = await resolveUser(target);
        const grants = await prisma.accessGrant.findMany({
          where: { userId: user.userId },
          orderBy: { createdAt: 'desc' },
        });
        const summary = await entitlements.summarize(user.userId);
        out(
          `${user.email}: access=${summary.active ? 'ACTIVE' : 'inactive'} via ${summary.source ?? '-'} until ${summary.expiresAt?.toISOString() ?? (summary.active ? 'LIFETIME' : '-')}`,
        );
        for (const grant of grants) {
          out(
            `  [${grant.grantId}] ${grant.source} ${grant.expiresAt ? `until ${grant.expiresAt.toISOString()}` : 'LIFETIME'}${grant.revokedAt ? ` REVOKED (${grant.revokedReason})` : ''} ref=${grant.sourceRef ?? '-'}`,
          );
        }
        break;
      }
      case 'revoke': {
        const reason = flag('reason');
        if (!reason) throw new Error('revoke requires --reason');
        await entitlements.revoke(target, reason);
        out(`✅ grant ${target} revoked (${reason})`);
        break;
      }
      default:
        throw new Error(
          `Unknown command "${command ?? ''}" — use comp | list | revoke`,
        );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
