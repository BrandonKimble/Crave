export type MapQueryBudgetSnapshot = {
  fullCatalogScanCount: number;
  indexQueryDurationP95: number;
  readModelBuildSliceP95: number;
  mapDiffApplySliceP95: number;
  indexQuerySampleCount: number;
  readModelBuildSampleCount: number;
  mapDiffApplySampleCount: number;
  runtimeAttributionTotalsMs: Record<string, number>;
  runtimeAttributionSampleCountByContributor: Record<string, number>;
  runtimeAttributionTopContributors: Array<{
    contributor: string;
    totalMs: number;
    sampleCount: number;
    meanMs: number;
  }>;
};

export type RuntimeAttributionContributor =
  | 'list_read_model_build'
  | 'list_render_key_flip'
  | 'marker_feature_derivation'
  | 'map_label_bootstrap'
  | 'hydration_commit_apply'
  | 'hydration_finalize_key_commit'
  | 'hydration_finalize_rows_release';

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const sanitizeDuration = (durationMs: number): number | null => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  return durationMs;
};

export class MapQueryBudget {
  private fullCatalogScanCount = 0;
  private indexQueryDurationsMs: number[] = [];
  private readModelBuildSliceDurationsMs: number[] = [];
  private mapDiffApplySliceDurationsMs: number[] = [];
  private runtimeAttributionTotalsMs = new Map<string, number>();
  private runtimeAttributionSampleCountByContributor = new Map<string, number>();

  public resetRun(): void {
    this.fullCatalogScanCount = 0;
    this.indexQueryDurationsMs = [];
    this.readModelBuildSliceDurationsMs = [];
    this.mapDiffApplySliceDurationsMs = [];
    this.runtimeAttributionTotalsMs.clear();
    this.runtimeAttributionSampleCountByContributor.clear();
  }

  public recordFullCatalogScan(): void {
    this.fullCatalogScanCount += 1;
  }

  public recordIndexQueryDurationMs(durationMs: number): void {
    const value = sanitizeDuration(durationMs);
    if (value == null) {
      return;
    }
    this.indexQueryDurationsMs.push(value);
  }

  public recordReadModelBuildSliceDurationMs(durationMs: number): void {
    const value = sanitizeDuration(durationMs);
    if (value == null) {
      return;
    }
    this.readModelBuildSliceDurationsMs.push(value);
  }

  public recordMapDiffApplySliceDurationMs(durationMs: number): void {
    const value = sanitizeDuration(durationMs);
    if (value == null) {
      return;
    }
    this.mapDiffApplySliceDurationsMs.push(value);
  }

  public recordRuntimeAttributionDurationMs(
    contributor: RuntimeAttributionContributor | string,
    durationMs: number
  ): void {
    const normalizedContributor = contributor.trim();
    if (normalizedContributor.length === 0) {
      return;
    }
    const value = sanitizeDuration(durationMs);
    if (value == null) {
      return;
    }
    this.runtimeAttributionTotalsMs.set(
      normalizedContributor,
      (this.runtimeAttributionTotalsMs.get(normalizedContributor) ?? 0) + value
    );
    this.runtimeAttributionSampleCountByContributor.set(
      normalizedContributor,
      (this.runtimeAttributionSampleCountByContributor.get(normalizedContributor) ?? 0) + 1
    );
  }

  public snapshot(): MapQueryBudgetSnapshot {
    const runtimeAttributionTotalsMs = Object.fromEntries(
      Array.from(this.runtimeAttributionTotalsMs.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([contributor, totalMs]) => [contributor, totalMs])
    );
    const runtimeAttributionSampleCountByContributor = Object.fromEntries(
      Array.from(this.runtimeAttributionSampleCountByContributor.entries())
        .sort((left, right) => {
          const totalLeft = this.runtimeAttributionTotalsMs.get(left[0]) ?? 0;
          const totalRight = this.runtimeAttributionTotalsMs.get(right[0]) ?? 0;
          return totalRight - totalLeft;
        })
        .map(([contributor, sampleCount]) => [contributor, sampleCount])
    );
    const runtimeAttributionTopContributors = Array.from(this.runtimeAttributionTotalsMs.entries())
      .map(([contributor, totalMs]) => {
        const sampleCount = this.runtimeAttributionSampleCountByContributor.get(contributor) ?? 0;
        const meanMs = sampleCount > 0 ? totalMs / sampleCount : 0;
        return {
          contributor,
          totalMs,
          sampleCount,
          meanMs,
        };
      })
      .sort((left, right) => right.totalMs - left.totalMs)
      .slice(0, 5);

    return {
      fullCatalogScanCount: this.fullCatalogScanCount,
      indexQueryDurationP95: percentile(this.indexQueryDurationsMs, 95),
      readModelBuildSliceP95: percentile(this.readModelBuildSliceDurationsMs, 95),
      mapDiffApplySliceP95: percentile(this.mapDiffApplySliceDurationsMs, 95),
      indexQuerySampleCount: this.indexQueryDurationsMs.length,
      readModelBuildSampleCount: this.readModelBuildSliceDurationsMs.length,
      mapDiffApplySampleCount: this.mapDiffApplySliceDurationsMs.length,
      runtimeAttributionTotalsMs,
      runtimeAttributionSampleCountByContributor,
      runtimeAttributionTopContributors,
    };
  }
}

export const createMapQueryBudget = (): MapQueryBudget => new MapQueryBudget();
