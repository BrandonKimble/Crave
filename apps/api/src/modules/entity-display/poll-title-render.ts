/**
 * D1 — RENDER A TEMPLATED POLL TITLE.
 *
 * Only rows marked `title_source = 'template'` reach this function. A
 * user-authored title is USER PROSE: it is shown exactly as written, in the
 * language it was written in (`title_locale`), and is a translate-on-read
 * surface at most. Rendering someone's words from a template would be putting
 * sentences in their mouth.
 *
 * The parameters come from the topic's own target columns, so — like the
 * curated recipes — no params column is invented.
 */
import { renderMessage, type RecipeMessageKey } from './recipe-messages';

/** The two writers that coin templated poll titles, and their wordings. */
export type PollTitleWriter = 'weekly_ritual' | 'user_created';

export interface PollTitleContext {
  /** best_dish / *_attribute: the CONCEPT label, already localized. */
  conceptLabel?: string | null;
  /** what_to_order: the restaurant's name. A proper noun; never localized. */
  restaurantName?: string | null;
  /** best_restaurants: the place name. Also a proper noun. */
  placeName?: string | null;
}

const RITUAL_KEYS: Readonly<Record<string, RecipeMessageKey>> = {
  best_restaurants: 'poll.best_restaurants.title',
  best_dish: 'poll.best_dish.title',
  what_to_order: 'poll.what_to_order.title',
};

const CREATED_KEYS: Readonly<Record<string, RecipeMessageKey>> = {
  best_dish: 'poll.created.best_dish',
  what_to_order: 'poll.created.what_to_order',
  best_dish_attribute: 'poll.created.best_dish_attribute',
  best_restaurant_attribute: 'poll.created.best_restaurant_attribute',
};

/**
 * Returns null when the shape is not renderable (unknown topic type, or the
 * parameter it needs is missing) — the caller keeps the stored title. A poll
 * with a mangled question is worse than a poll with an English one.
 */
export function renderPollTitle(
  writer: PollTitleWriter,
  topicType: string,
  locale: string,
  ctx: PollTitleContext,
): string | null {
  const key = (writer === 'weekly_ritual' ? RITUAL_KEYS : CREATED_KEYS)[
    topicType
  ];
  if (!key) {
    return null;
  }
  if (topicType === 'best_restaurants') {
    return ctx.placeName
      ? renderMessage(key, locale, { place: ctx.placeName })
      : null;
  }
  const label =
    topicType === 'what_to_order' ? ctx.restaurantName : ctx.conceptLabel;
  return label ? renderMessage(key, locale, { label }) : null;
}
