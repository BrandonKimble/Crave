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
 * point. When M2's label sweep fills entity_surface for 8,272 concepts, the
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
   * ENGLISH IS NO LONGER SKIPPED (L2, 2026-08-11). It used to be: `name` IS
   * the English label, so an `en` request cost zero queries. That shortcut
   * was also a WALL — while it stood, no English label row could ever be
   * read, so nothing could ever be gained by writing one, so the vocabulary
   * sweep had no reason to be asked about English, so English had no
   * mechanism for learning the words its speakers actually use. Removing the
   * special case is what makes `en` a locale like any other, top to bottom;
   * the price is one indexed batch query on the hottest read path, the same
   * one every other locale already pays.
   *
   * NOTHING CHANGES FOR A CONCEPT WITH NO `en` ROW: the query returns nothing
   * and `displayLabel` floors to `entity.name`, exactly as before. The
   * canonical name is still the answer — it just stops being the ONLY
   * possible answer.
   */
  async loadLabels(
    entityIds: readonly string[],
    locale: string,
  ): Promise<LabelIndex> {
    const empty: LabelIndex = new Map<string, string>();
    if (!entityIds.length) {
      return empty;
    }
    const ids = [...new Set(entityIds)];
    try {
      const rows = await this.prisma.entitySurface.findMany({
        where: {
          entityId: { in: ids },
          status: 'active',
          // THE DISPLAY PREDICATE (surface merge, §11-2). One table holds
          // display and recall forms now; a role='recall' row is a corpus
          // surface nobody should ever be shown ("ctm" for tikka masala).
          role: { not: 'recall' },
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
   * The `labels` index is optional so that every caller that has not yet
   * been given a locale is a no-op call with the same signature. There is no
   * second code path for "the English case" — and as of L2 there is no
   * English case: the reading order below is ONE order for every locale,
   * `en` included. A caller that passes no index gets `entity.name`, which is
   * the same floor it always got.
   */
  displayLabel(
    entity: DisplayableEntity,
    locale: string,
    labels?: LabelIndex,
  ): string {
    const label = labels?.get(entity.entityId);
    // F8: totality — an empty/whitespace label row must never blank a
    // concept; the canonical name is always the floor.
    return label && label.trim() ? label : entity.name;
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

  // `isImplicitEnglish` lived here and said: "the day English STOPS being
  // implicit, one function changes". That day was 2026-08-11 (L2), and it was
  // one function — this one, deleted. English is a locale.

  private primarySubtag(locale: string): string {
    return (locale || DEFAULT_LOCALE).split('-')[0].toLowerCase();
  }

  /** The active locale set, for the sweep and the seeder. */
  static activeLocales(): readonly string[] {
    return SUPPORTED_LOCALES;
  }
}
