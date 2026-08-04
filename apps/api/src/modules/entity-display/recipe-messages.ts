/**
 * N6 — THE RECIPE MESSAGE CATALOGUE.
 *
 * A curated list's title is not a sentence we stored; it is a RECIPE plus its
 * parameters, and the sentence is produced at READ time in the reader's
 * language. `curated_lists.title/subtitle` stay in the table as a FALLBACK
 * (an unknown recipe key, a legacy row) and are never dropped — de-
 * materializing English sentences must not create a way for a list to have no
 * title at all.
 *
 * ICU MessageFormat 1 shape (R5-8's client-side choice, mirrored server-side):
 * placeholders are `{named}`. Nothing here needs plurals or gender YET, so
 * this catalogue is a plain template table rather than a full ICU runtime —
 * the moment one message needs `{count, plural, ...}` this file grows an ICU
 * formatter and the call sites do not change. That is the ordinary
 * "no speculative abstraction" trade: one interpolation function today,
 * pluggable when a real message demands it.
 *
 * TRANSLATION NOTE (why these are not machine-translated at read time): these
 * are OUR sentences about OUR product — a fixed, tiny, high-traffic set. They
 * are authored here per locale exactly once. The only thing that varies per
 * row is the CONCEPT NOUN inside them, which comes from entity_labels.
 */
import { DEFAULT_LOCALE } from '../../shared/locale';

export type RecipeMessageKey =
  | 'cuisine_best.title'
  | 'cuisine_best.subtitle'
  | 'dish_best.title'
  | 'dish_best.subtitle'
  | 'trending.title'
  | 'trending.subtitle'
  | 'hidden_gems.title'
  | 'hidden_gems.subtitle'
  | 'date_night.title'
  | 'family_group.title'
  | 'business_lunch.title'
  | 'your_weekly_tasting.title'
  | 'your_weekly_tasting.subtitle'
  // Shelf headers — the same read surface, the same locale, the same rule.
  | 'shelf.made_for_you'
  | 'shelf.best_of'
  | 'shelf.trending'
  | 'shelf.hidden_gems'
  | 'shelf.moments'
  | 'shelf.near_you'
  // D1 — the three templated poll title shapes.
  | 'poll.best_restaurants.title'
  | 'poll.best_restaurants.description'
  | 'poll.best_dish.title'
  | 'poll.best_dish.description'
  | 'poll.what_to_order.title'
  | 'poll.what_to_order.description'
  // D1 — the USER-CREATION templates (PollsService.buildPollQuestion). Same
  // marker, different wording from the ritual's; both are templates, so both
  // render, and keeping them as separate keys is the honest record of the
  // fact that two writers coined two shapes.
  | 'poll.created.best_dish'
  | 'poll.created.what_to_order'
  | 'poll.created.best_dish_attribute'
  | 'poll.created.best_restaurant_attribute';

type Catalogue = Readonly<Record<RecipeMessageKey, string>>;

/**
 * EN is the source of truth for MEANING and reproduces today's stored strings
 * verbatim — the render-from-recipe move must be invisible to an English
 * reader, and a diff against a stored title is the proof.
 */
const EN: Catalogue = {
  'cuisine_best.title': 'Best {label} in {city}',
  'cuisine_best.subtitle': 'The top-scored {label} spots in {city}',
  'dish_best.title': 'Best {label} in {city} — {month}',
  'dish_best.subtitle': 'Where {city} eats its {labelLower} this month',
  'trending.title': 'Trending in {city}',
  'trending.subtitle': 'Rising fastest right now',
  'hidden_gems.title': 'Hidden gems of {city}',
  'hidden_gems.subtitle': 'Loved hard, talked about little',
  'date_night.title': 'Date night in {city}',
  'family_group.title': 'Family & groups in {city}',
  'business_lunch.title': 'Business lunch in {city}',
  'your_weekly_tasting.title': 'Your weekly tasting',
  'your_weekly_tasting.subtitle':
    'New-to-you dishes in {city}, from cuisines you love',
  'shelf.made_for_you': 'Made for you',
  'shelf.best_of': 'Best of {city}',
  'shelf.trending': 'Trending',
  'shelf.hidden_gems': 'Hidden gems',
  'shelf.moments': 'For the moment',
  'shelf.near_you': 'Best near you in {place}',
  'poll.best_restaurants.title': 'Best restaurants in {place}',
  'poll.best_restaurants.description': 'Help rank the best spots in {place}.',
  'poll.best_dish.title': "What's the best {label} right now?",
  'poll.best_dish.description': 'Which spot has the best {label}?',
  'poll.what_to_order.title': 'What should we order at {label}?',
  'poll.what_to_order.description':
    'Help everyone decide what to order at {label}.',
  'poll.created.best_dish': 'Best {label}',
  'poll.created.what_to_order': 'What to order at {label}?',
  'poll.created.best_dish_attribute': 'Best {label} dish',
  'poll.created.best_restaurant_attribute': 'Best {label} restaurants',
};

/**
 * ES authored here, not translated on read. Note what is NOT translated
 * inside them: `{city}`, `{place}` (proper nouns) and `{label}` (which
 * arrives already localized from entity_labels, or already source-faithful
 * for a dish — "Lo mejor de birria en Austin" is correct, "estofado" is not).
 */
const ES: Catalogue = {
  'cuisine_best.title': 'Lo mejor de {label} en {city}',
  'cuisine_best.subtitle': 'Los sitios de {label} mejor valorados en {city}',
  'dish_best.title': 'Lo mejor de {label} en {city} — {month}',
  'dish_best.subtitle': 'Dónde come {city} su {labelLower} este mes',
  'trending.title': 'En tendencia en {city}',
  'trending.subtitle': 'Lo que más sube ahora mismo',
  'hidden_gems.title': 'Joyas escondidas de {city}',
  'hidden_gems.subtitle': 'Muy queridos, poco comentados',
  'date_night.title': 'Cita romántica en {city}',
  'family_group.title': 'Familia y grupos en {city}',
  'business_lunch.title': 'Comida de negocios en {city}',
  'your_weekly_tasting.title': 'Tu degustación semanal',
  'your_weekly_tasting.subtitle':
    'Platos nuevos para ti en {city}, de las cocinas que te gustan',
  'shelf.made_for_you': 'Hecho para ti',
  'shelf.best_of': 'Lo mejor de {city}',
  'shelf.trending': 'En tendencia',
  'shelf.hidden_gems': 'Joyas escondidas',
  'shelf.moments': 'Para el momento',
  'shelf.near_you': 'Lo mejor cerca de ti en {place}',
  'poll.best_restaurants.title': 'Mejores restaurantes en {place}',
  'poll.best_restaurants.description':
    'Ayuda a clasificar los mejores sitios de {place}.',
  'poll.best_dish.title': '¿Cuál es el mejor {label} ahora mismo?',
  'poll.best_dish.description': '¿Qué sitio tiene el mejor {label}?',
  'poll.what_to_order.title': '¿Qué deberíamos pedir en {label}?',
  'poll.what_to_order.description':
    'Ayuda a todos a decidir qué pedir en {label}.',
  'poll.created.best_dish': 'Lo mejor de {label}',
  'poll.created.what_to_order': '¿Qué pedir en {label}?',
  'poll.created.best_dish_attribute': 'Mejor plato {label}',
  'poll.created.best_restaurant_attribute': 'Mejores restaurantes {label}',
};

const CATALOGUES: Readonly<Record<string, Catalogue>> = { en: EN, es: ES };

/** Month names per locale — Intl on the server, no month-name table. */
export function localizedMonth(date: Date, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  // English capitalises month names; Spanish does not. Intl already knows.
  return label;
}

/**
 * Render one message. Unknown placeholders are left INTACT rather than
 * blanked: a visible `{label}` in a screenshot is a bug report, an empty
 * string is a silent one.
 */
export function renderMessage(
  key: RecipeMessageKey,
  locale: string,
  params: Readonly<Record<string, string>> = {},
): string {
  const primary = (locale || DEFAULT_LOCALE).split('-')[0].toLowerCase();
  const catalogue = CATALOGUES[primary] ?? CATALOGUES[DEFAULT_LOCALE];
  const template = catalogue[key] ?? CATALOGUES[DEFAULT_LOCALE][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match,
  );
}

/** Exported for the catalogue-completeness spec. */
export const MESSAGE_CATALOGUES_FOR_TEST = CATALOGUES;
