import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * BILLED DOLLARS, NOT LEDGER DOLLARS.
 *
 * WHAT WAS WRONG (red team 2026-08-02). `cost-reconcile.sh --publish` measures
 * our ledger against the BigQuery billing export and writes the billed÷ledger
 * ratio per service into `spend_unit_costs` as
 * `reconciliation.<service>/multiplier`. That ratio was applied in exactly one
 * place: grossing an ESTIMATE so the manifest an owner approves reads in
 * billed dollars.
 *
 * Every place that decides WHEN TO STOP used raw ledger dollars:
 *   - the monthly spend pools (the Tier-3 catastrophe backstop),
 *   - campaign envelopes,
 *   - the nightly backstop derivation (3x trailing measured spend).
 *
 * So a campaign was MINTED in billed dollars and DRAINED in ledger dollars. At
 * the measured ~1.7x Gemini under-metering, an $82 envelope spent ~$139 billed
 * before it registered as breached, and the "3x" backstop was really ~5.1x
 * billed. The system already knew the true ratio; it applied it only on the
 * side that makes a number look big to a human, never on the side that stops
 * the spending.
 *
 * ONE SEAM. Everything that prices ledger rows into dollars goes through here,
 * so estimate, meter, envelope and backstop are the same currency by
 * construction rather than by four call sites agreeing.
 *
 * The multiplier is NEVER invented — absent means 1.0 (honestly ledger-priced,
 * the pre-reconciliation state), and only cost-reconcile writes it.
 */
@Injectable()
export class ReconciliationMultiplierService {
  /**
   * Cached because this is read on the metering hot path, once per usage
   * event. The value changes only when cost-reconcile publishes, which is a
   * manual/nightly act — a few minutes of staleness cannot matter to a monthly
   * ceiling, and a DB round-trip per event would.
   */
  private static readonly TTL_MS = 5 * 60_000;

  private readonly cache = new Map<string, { value: number; at: number }>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Gross ledger micros into billed micros for `service`.
   *
   * Synchronous and cache-only by design: the metering path is fire-and-forget
   * and must not await a query per event. A cold cache returns the ledger
   * value unchanged (multiplier 1) and triggers a refresh, so the worst case
   * is that the first few events of a process are metered at the old, LOWER
   * figure — under-grossing briefly, never over-grossing.
   */
  gross(service: string, ledgerMicros: number): number {
    const multiplier = this.multiplierFor(service);
    return multiplier === 1 ? ledgerMicros : ledgerMicros * multiplier;
  }

  /** The cached ratio for `service`; 1 when never reconciled. */
  multiplierFor(service: string): number {
    const hit = this.cache.get(service);
    const now = Date.now();
    if (hit && now - hit.at < ReconciliationMultiplierService.TTL_MS) {
      return hit.value;
    }
    void this.refresh(service);
    return hit?.value ?? 1;
  }

  /** Warm the cache before the first metered event of a process. */
  async prime(services: string[] = ['gemini', 'google_places']): Promise<void> {
    await Promise.all(services.map((service) => this.refresh(service)));
  }

  private async refresh(service: string): Promise<void> {
    if (!this.prisma) return;
    try {
      const row = await this.prisma.spendUnitCost.findUnique({
        where: {
          workClass_unit: {
            workClass: `reconciliation.${service}`,
            unit: 'multiplier',
          },
        },
      });
      const raw = row?.microUsdPerUnit;
      const value = typeof raw === 'number' ? raw : Number(raw);
      this.cache.set(service, {
        // A ratio below 1 would mean we over-meter; that is possible and
        // legitimate. Only a non-finite or non-positive value is refused.
        value: Number.isFinite(value) && value > 0 ? value : 1,
        at: Date.now(),
      });
    } catch {
      // A reconciliation lookup must never break metering. Leaving the cache
      // untouched means we keep using the last known ratio, or 1.
    }
  }
}
