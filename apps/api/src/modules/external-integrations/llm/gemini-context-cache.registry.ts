import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';

/**
 * THE lifecycle owner for Gemini context caches.
 *
 * A context cache is a paid, TTL-bearing vendor resource: creation bills the
 * full input token count and storage bills per token-HOUR for as long as the
 * cache lives. Before this registry its only identity was a private field on
 * a per-process singleton, which produced every problem we measured:
 * - api, worker, and EVERY script boot minted their own copy of the same
 *   prompt (62 storage rows / ~$27 of abandoned rentals in one day);
 * - nothing ever called caches.delete, so replaced caches billed to their
 *   full TTL;
 * - the interactive cache re-minted every ~5h under load instead of having
 *   its TTL extended (extension costs no creation tokens).
 *
 * The registry makes the cache a shared, durable, content-addressed
 * resource: identity is (model, sha256(prompt)), stored in Postgres, so one
 * cache serves every process. Lookup-before-mint, extend-instead-of-remint,
 * and retire-with-refcount all follow from that one identity change.
 *
 * Vendor operations are passed in per call (`CacheVendorOps`) rather than
 * owned here: LlmService owns the single GoogleGenAI client, and taking the
 * ops as an argument keeps this service pure orchestration — unit-testable
 * without a vendor client, and impossible to drift into a second client.
 */

export interface CacheVendorOps {
  create(params: {
    model: string;
    systemInstruction: string;
    ttlSeconds: number;
  }): Promise<{ name: string; tokenCount: number }>;
  /** Extend a cache's lifetime to ttlSeconds from now. */
  updateTtl(name: string, ttlSeconds: number): Promise<void>;
  delete(name: string): Promise<void>;
}

export interface AcquireParams {
  model: string;
  systemInstruction: string;
  ttlSeconds: number;
  /** Reuse only when at least this much lifetime remains (e.g. the batch
   *  cache needs 25h so an in-flight 24h-SLA job can never outlive it). */
  minRemainingMs: number;
  /** §24 usage-ledger caller tag for the creation/storage rows. */
  caller: string;
  /** Skip the lookup and mint fresh — used when the current cache is known
   *  bad (vendor 404 / model mismatch). The superseded row is retired. */
  forceRemint?: boolean;
}

export interface AcquiredCache {
  name: string;
  tokenCount: number;
  expiresAtMs: number;
  /** true = served from the registry (no vendor create was paid). */
  reused: boolean;
}

@Injectable()
export class GeminiContextCacheRegistry {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageLedger: UsageLedgerService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('GeminiContextCacheRegistry');
  }

  static promptHash(model: string, systemInstruction: string): string {
    return createHash('sha256')
      .update(`${model}\n${systemInstruction}`)
      .digest('hex');
  }

  async acquire(
    params: AcquireParams,
    ops: CacheVendorOps,
  ): Promise<AcquiredCache> {
    const hash = GeminiContextCacheRegistry.promptHash(
      params.model,
      params.systemInstruction,
    );
    const now = Date.now();

    if (!params.forceRemint) {
      const row = await this.prisma.geminiContextCache.findFirst({
        where: { model: params.model, promptHash: hash, retiredAt: null },
        orderBy: { expiresAt: 'desc' },
      });
      if (row) {
        const remainingMs = row.expiresAt.getTime() - now;
        if (remainingMs > params.minRemainingMs) {
          return {
            name: row.name,
            tokenCount: row.tokenCount,
            expiresAtMs: row.expiresAt.getTime(),
            reused: true,
          };
        }
        // EXTEND instead of re-mint. An extension costs zero creation
        // tokens — only the additional storage hours — while a re-mint pays
        // the full prompt again AND abandons the old cache to bill out its
        // TTL. Only a still-live cache can be extended; an expired one falls
        // through to a fresh mint.
        if (remainingMs > 0) {
          try {
            await ops.updateTtl(row.name, params.ttlSeconds);
            const newExpiresAtMs = now + params.ttlSeconds * 1000;
            const additionalHours =
              (newExpiresAtMs - row.expiresAt.getTime()) / 3_600_000;
            if (additionalHours > 0) {
              this.usageLedger.record({
                service: 'gemini',
                operation: 'cachedContentStorage',
                model: params.model,
                mode: 'interactive',
                cachedTokens: row.tokenCount,
                durationHours: additionalHours,
                caller: params.caller,
              });
            }
            await this.prisma.geminiContextCache.update({
              where: { name: row.name },
              data: { expiresAt: new Date(newExpiresAtMs) },
            });
            return {
              name: row.name,
              tokenCount: row.tokenCount,
              expiresAtMs: newExpiresAtMs,
              reused: true,
            };
          } catch (error) {
            this.logger.warn('Cache TTL extension failed; minting fresh', {
              cacheName: row.name,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      }
    }

    // MINT UNDER AN ADVISORY LOCK, with a re-check inside it. Without this,
    // two processes booting together both see "no row", both pay a vendor
    // create, and each then retires the OTHER's cache — a wasted mint plus a
    // transient 404 for whichever process loses. Same discipline as entity
    // creation. The lock is transaction-scoped; the vendor create happens
    // inside it deliberately (double-mint is the failure being priced away,
    // and creates take ~1s at worst).
    const minted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gemini-cache:${params.model}:${hash}`}))`;
      if (!params.forceRemint) {
        const raced = await tx.geminiContextCache.findFirst({
          where: { model: params.model, promptHash: hash, retiredAt: null },
          orderBy: { expiresAt: 'desc' },
        });
        if (
          raced &&
          raced.expiresAt.getTime() - Date.now() > params.minRemainingMs
        ) {
          return {
            name: raced.name,
            tokenCount: raced.tokenCount,
            expiresAtMs: raced.expiresAt.getTime(),
            reused: true as const,
          };
        }
      }
      const created = await ops.create({
        model: params.model,
        systemInstruction: params.systemInstruction,
        ttlSeconds: params.ttlSeconds,
      });
      const expiresAtMs = Date.now() + params.ttlSeconds * 1000;
      await tx.geminiContextCache.create({
        data: {
          name: created.name,
          model: params.model,
          promptHash: hash,
          tokenCount: created.tokenCount,
          caller: params.caller,
          expiresAt: new Date(expiresAtMs),
        },
      });
      return {
        name: created.name,
        tokenCount: created.tokenCount,
        expiresAtMs,
        reused: false as const,
      };
    });
    if (minted.reused) {
      return minted;
    }
    const expiresAtMs = minted.expiresAtMs;

    // Two ledger rows, two products: the creation write (input tokens) and
    // the hold (token-hours for the TTL). Storage is booked up front for the
    // full TTL — over-metering if retired early, which is the deliberate
    // failure direction (spend that vanishes is the failure that matters).
    // `mode` stays 'interactive' on purpose: mode is a PRICING dimension
    // (50% batch discount) and there is no evidence the vendor discounts
    // cache ops; attribution rides `caller`.
    this.usageLedger.record({
      service: 'gemini',
      operation: 'createCachedContent',
      model: params.model,
      mode: 'interactive',
      inputTokens: minted.tokenCount,
      caller: params.caller,
    });
    this.usageLedger.record({
      service: 'gemini',
      operation: 'cachedContentStorage',
      model: params.model,
      mode: 'interactive',
      cachedTokens: minted.tokenCount,
      durationHours: params.ttlSeconds / 3600,
      caller: params.caller,
    });

    await this.retireSuperseded(params.model, hash, minted.name, ops);

    return {
      name: minted.name,
      tokenCount: minted.tokenCount,
      expiresAtMs,
      reused: false,
    };
  }

  /** Mark a cache bad NOW (vendor 404 / model mismatch) so no process —
   *  this one or a sibling — reuses it from the registry. */
  async invalidate(name: string): Promise<void> {
    await this.prisma.geminiContextCache
      .updateMany({
        where: { name, retiredAt: null },
        data: { retiredAt: new Date() },
      })
      .catch((error: unknown) => {
        this.logger.warn('Cache invalidation write failed', {
          cacheName: name,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
  }

  /**
   * Retire every active row for this (model, hash) except the keeper, and
   * DELETE the vendor object when it is safe. Safety = no non-terminal batch
   * job item references the cache name (items store their full request
   * config, so the reference is queryable). A still-referenced cache is
   * retired in the registry (never served again) but left alive at the
   * vendor for the in-flight job; the vendor TTL reaps it.
   */
  private async retireSuperseded(
    model: string,
    promptHash: string,
    keepName: string,
    ops: CacheVendorOps,
  ): Promise<void> {
    try {
      const superseded = await this.prisma.geminiContextCache.findMany({
        where: { model, promptHash, retiredAt: null, name: { not: keepName } },
        select: { name: true },
      });
      for (const row of superseded) {
        const referenced = await this.prisma.$queryRaw<
          Array<{ exists: boolean }>
        >`
          SELECT EXISTS (
            SELECT 1 FROM llm_batch_job_items i
            JOIN llm_batch_jobs j ON j.job_id = i.job_id
            WHERE j.status NOT IN ('ingested', 'failed')
              AND i.request->'config'->>'cachedContent' = ${row.name}
          ) AS exists
        `;
        if (!referenced[0]?.exists) {
          await ops.delete(row.name).catch((error: unknown) => {
            // Best-effort: the vendor TTL reaps it regardless; the registry
            // retirement below is what stops further reuse.
            this.logger.warn('Vendor cache delete failed (TTL will reap)', {
              cacheName: row.name,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            });
          });
        }
        await this.prisma.geminiContextCache.update({
          where: { name: row.name },
          data: { retiredAt: new Date() },
        });
      }
    } catch (error) {
      // Retirement is a cleanup pass — it must never fail an acquire.
      this.logger.warn('Superseded-cache retirement pass failed', {
        model,
        promptHash,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
