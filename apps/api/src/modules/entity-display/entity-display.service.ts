import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  lookupSupported,
} from '../../shared/locale';
import type {
  DisplayableEntity,
  LabelIndex,
  LocalizedName,
} from './entity-display.types';

/**
 * N10/A3 — THE ONE DISPLAY FUNCTION.
 *
 * Every user-facing surface that renders a concept's text routes through
 * `displayLabel`. That is the entire load-bearing claim of this file, and
 * `entity-display-lockdown.spec.ts` is its enforcement.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS: today `displayLabel` mostly returns
 * `entity.name`, so routing through it changes nothing visible. That is the
 * point. When M2's label sweep fills entity_labels for 8,272 concepts, the
 * edit is THIS FUNCTION — not archaeology across every DTO in the codebase
 * that ever touched `.name`. A3 demoted the stable slug to later precisely
 * because the indirection, not the slug, is the part that must exist before
 * the labels do.
 *
 * SHAPE: resolution is a BATCH (one query per read, keyed by locale) and
 * rendering is PURE. A per-entity async lookup would make a 25-row list 25
 * round trips, so the async half hands back a LabelIndex and the pure half
 * reads it.
 */
@Injectable()
export class EntityDisplayService {
  private readonly logger = new Logger(EntityDisplayService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load the display labels for `entityIds` in `locale`.
   *
   * RFC 4647 Lookup happens in TWO places and they are not redundant: the
   * request locale was already negotiated against SUPPORTED_LOCALES, but the
   * LABEL ROWS are a different supported set (a concept may have `es-MX` but
   * not `es`). So the fallback chain is computed against the locales that
   * actually exist for these entities.
   *
   * English is deliberately never queried: `name` IS the English label
   * (plan: "English labels are implicit until then"), so an `en` request
   * costs zero queries — the hottest path in the product stays exactly as
   * fast as it is today.
   */
  async loadLabels(
    entityIds: readonly string[],
    locale: string,
  ): Promise<LabelIndex> {
    const empty: LabelIndex = new Map<string, string>();
    if (!entityIds.length || this.isImplicitEnglish(locale)) {
      return empty;
    }
    const ids = [...new Set(entityIds)];
    try {
      const rows = await this.prisma.entityLabel.findMany({
        where: {
          entityId: { in: ids },
          status: 'active',
          // Prefix band: 'es' pulls 'es', 'es-MX', 'es-419' in one query, and
          // the per-entity fallback below picks the best of them. Two round
          // trips to discover a regional row would be one too many.
          locale: { startsWith: this.primarySubtag(locale) },
        },
        select: {
          entityId: true,
          locale: true,
          form: true,
          isDefault: true,
          rank: true,
        },
      });
      if (!rows.length) {
        return empty;
      }
      const byEntity = new Map<string, typeof rows>();
      for (const row of rows) {
        const bucket = byEntity.get(row.entityId);
        if (bucket) {
          bucket.push(row);
        } else {
          byEntity.set(row.entityId, [row]);
        }
      }
      const index = new Map<string, string>();
      for (const [entityId, candidates] of byEntity) {
        const available = [...new Set(candidates.map((row) => row.locale))];
        const matched = lookupSupported(locale, available);
        if (!matched) {
          continue;
        }
        // Ranked within the matched locale: is_default wins, then rank, then
        // the form itself so the choice is deterministic across requests (a
        // display string that flickers between reads is a bug report).
        const best = candidates
          .filter((row) => row.locale === matched)
          .sort(
            (a, b) =>
              Number(b.isDefault) - Number(a.isDefault) ||
              a.rank - b.rank ||
              a.form.localeCompare(b.form),
          )[0];
        if (best) {
          index.set(entityId, best.form);
        }
      }
      return index;
    } catch (error) {
      // A label lookup must NEVER take a read surface down: the English name
      // is always a correct answer, just not a localized one. Loud in logs,
      // silent to the user.
      this.logger.error(
        `label load failed for locale=${locale} (${ids.length} ids); falling back to canonical names`,
        error instanceof Error ? error.stack : String(error),
      );
      return empty;
    }
  }

  /**
   * THE DISPLAY FUNCTION. Pure, synchronous, total: it always returns a
   * string a human can read.
   *
   * The `labels` index is optional so that an English request — and every
   * caller that has not yet been given a locale — is a no-op call with the
   * same signature. There is no second code path for "the English case".
   */
  displayLabel(
    entity: DisplayableEntity,
    locale: string,
    labels?: LabelIndex,
  ): string {
    if (this.isImplicitEnglish(locale)) {
      return entity.name;
    }
    return labels?.get(entity.entityId) ?? entity.name;
  }

  /**
   * The DTO-shaped render: the localized string for the eye, plus the
   * canonical token the client must submit back. Read surfaces should prefer
   * this over `displayLabel` — emitting a localized name WITHOUT its submit
   * token is precisely the matching break round 4 identified.
   */
  localizedName(
    entity: DisplayableEntity,
    locale: string,
    labels?: LabelIndex,
  ): LocalizedName {
    return {
      name: this.displayLabel(entity, locale, labels),
      submitToken: entity.name,
    };
  }

  /**
   * Convenience for a single surface that has entities in hand: load + render
   * in one call. Still ONE query.
   */
  async localizeAll<T extends DisplayableEntity>(
    entities: readonly T[],
    locale: string,
  ): Promise<Map<string, LocalizedName>> {
    const labels = await this.loadLabels(
      entities.map((entity) => entity.entityId),
      locale,
    );
    return new Map(
      entities.map((entity) => [
        entity.entityId,
        this.localizedName(entity, locale, labels),
      ]),
    );
  }

  /**
   * Localize a flat list of `{entityId, name}` DTO rows IN ONE QUERY, adding
   * the submit token to each. The shape search's tag chips and any future
   * chip-like surface share — one function so a second surface cannot invent
   * a subtly different rule (e.g. forget the submit token).
   */
  async localizeRows<T extends { entityId: string; name: string }>(
    rows: readonly T[],
    locale: string,
  ): Promise<Array<T & { submitToken: string }>> {
    const labels = await this.loadLabels(
      rows.map((row) => row.entityId),
      locale,
    );
    return rows.map((row) => ({
      ...row,
      submitToken: row.name,
      name: this.displayLabel(row, locale, labels),
    }));
  }

  /**
   * English needs no rows: `core_entities.name` IS the English label. Stated
   * once, here, so no caller re-derives it (and so the day English STOPS
   * being implicit, one function changes).
   */
  private isImplicitEnglish(locale: string): boolean {
    return this.primarySubtag(locale) === DEFAULT_LOCALE;
  }

  private primarySubtag(locale: string): string {
    return (locale || DEFAULT_LOCALE).split('-')[0].toLowerCase();
  }

  /** The active locale set, for the sweep and the seeder. */
  static activeLocales(): readonly string[] {
    return SUPPORTED_LOCALES;
  }
}
