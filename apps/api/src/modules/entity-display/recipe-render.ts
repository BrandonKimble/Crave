/**
 * N6 — RENDER FROM RECIPE.
 *
 * `curated_lists` stored English sentences. It also already stored
 * `recipe_key` (100% populated, credit to whoever put it there) — so the
 * sentence was always derivable and the stored copy was always a duplicate of
 * a fact the row already had. This module derives it.
 *
 * NO NEW COLUMN. The parameters a recipe needs are already on the row or one
 * join away, and inventing a `recipe_params jsonb` would have created a
 * SECOND source of truth for the same facts (the classic materialization bug
 * one level up):
 *   - the concept id      — the recipe key's own suffix (`cuisine_best:<id>`)
 *   - the city name       — the `city` relation (a proper noun; never
 *                           translated, only the sentence around it is)
 *   - the month           — `rotation_key` IS the month ('2026-07')
 *
 * The stored `title`/`subtitle` remain as the fallback for an unknown recipe
 * key. They are not dropped, not deprecated, and not authoritative.
 */
import {
  RECIPE_CUISINE_BEST_PREFIX,
  RECIPE_DISH_BEST_PREFIX,
  RECIPE_HIDDEN_GEMS,
  RECIPE_TRENDING,
  RECIPE_WEEKLY_TASTING,
} from '../home/curated-lists.constants';
import { localizedMonth, renderMessage } from './recipe-messages';

/**
 * CASING IS A LOCALE CONVENTION, not a string operation.
 *
 * English titles Title-Case the concept ("Best Tacos in Austin") — the
 * builder did this with a regex and the stored rows prove it, so the English
 * render must reproduce it verbatim or the de-materialization is a visible
 * change. Spanish does NOT title-case common nouns ("Lo mejor de tacos"), and
 * a label row is authored in its own correct case. So: title-case only the
 * implicit-English label, and trust every authored label as written.
 */
export function conceptCase(label: string, locale: string): string {
  if ((locale || 'en').split('-')[0].toLowerCase() !== 'en') {
    return label;
  }
  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface RenderedRecipe {
  title: string;
  subtitle: string | null;
}

export interface RecipeRenderContext {
  /** Proper noun. Never localized. */
  cityName: string;
  /**
   * The list's concept, ALREADY localized through EntityDisplayService — this
   * module never touches the database and never decides what a concept is
   * called. Absent for non-parametric recipes.
   */
  conceptLabel?: string | null;
  /** '2026-07' | '2026-W30' | '2026-07-26' — the recipe's own cadence key. */
  rotationKey?: string | null;
}

/**
 * The concept id a parametric recipe points at, or null. The ONE place the
 * `family:uuid` key format is parsed.
 */
export function recipeConceptId(recipeKey: string): string | null {
  for (const prefix of [RECIPE_CUISINE_BEST_PREFIX, RECIPE_DISH_BEST_PREFIX]) {
    if (recipeKey.startsWith(prefix)) {
      return recipeKey.slice(prefix.length) || null;
    }
  }
  return null;
}

/** '2026-07' → a UTC Date in that month. Null for non-monthly cadences. */
function monthFromRotationKey(
  rotationKey: string | null | undefined,
): Date | null {
  if (!rotationKey) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(rotationKey);
  if (!match) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

/**
 * Render a curated list's title/subtitle in `locale`.
 *
 * Returns null when the recipe key is unknown — the caller then falls back to
 * the stored strings. An unknown recipe is a real possibility (a recipe
 * retired in code while its rows still sit in the table), and rendering
 * "{label}" at a user would be worse than showing yesterday's English.
 */
export function renderRecipe(
  recipeKey: string,
  locale: string,
  ctx: RecipeRenderContext,
): RenderedRecipe | null {
  const city = ctx.cityName;
  const label = ctx.conceptLabel ?? null;

  if (recipeKey.startsWith(RECIPE_CUISINE_BEST_PREFIX)) {
    if (!label) {
      return null;
    }
    return {
      title: renderMessage('cuisine_best.title', locale, { label, city }),
      subtitle: renderMessage('cuisine_best.subtitle', locale, { label, city }),
    };
  }

  if (recipeKey.startsWith(RECIPE_DISH_BEST_PREFIX)) {
    if (!label) {
      return null;
    }
    const month = monthFromRotationKey(ctx.rotationKey);
    return {
      title: renderMessage('dish_best.title', locale, {
        label,
        city,
        month: month ? localizedMonth(month, locale) : (ctx.rotationKey ?? ''),
      }),
      subtitle: renderMessage('dish_best.subtitle', locale, {
        city,
        labelLower: label.toLocaleLowerCase(locale),
      }),
    };
  }

  switch (recipeKey) {
    case RECIPE_TRENDING:
      return {
        title: renderMessage('trending.title', locale, { city }),
        subtitle: renderMessage('trending.subtitle', locale),
      };
    case RECIPE_HIDDEN_GEMS:
      return {
        title: renderMessage('hidden_gems.title', locale, { city }),
        subtitle: renderMessage('hidden_gems.subtitle', locale),
      };
    case RECIPE_WEEKLY_TASTING:
      return {
        title: renderMessage('your_weekly_tasting.title', locale),
        subtitle: renderMessage('your_weekly_tasting.subtitle', locale, {
          city,
        }),
      };
    case 'date_night':
      return {
        title: renderMessage('date_night.title', locale, { city }),
        subtitle: null,
      };
    case 'family_group':
      return {
        title: renderMessage('family_group.title', locale, { city }),
        subtitle: null,
      };
    case 'business_lunch':
      return {
        title: renderMessage('business_lunch.title', locale, { city }),
        subtitle: null,
      };
    default:
      return null;
  }
}
