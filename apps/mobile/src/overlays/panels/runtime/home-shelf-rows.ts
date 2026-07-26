import type { HomeFeedCity, HomeFeedResponse, HomeShelf } from '../../../services/home';

/**
 * THE home shelf row model (home-surface-charter) — the PURE composition the
 * vertical FlashList renders. Separately housed so the section composition and
 * `getItemType` vocabulary are hermetic-jest provable, and so the prop bag the
 * body hook builds is cleanly separable from the scene wrapper (the TrackSheet
 * kit consumes exactly the FlashList prop-bag shape later).
 *
 * Row kinds:
 *  - 'shelf'      — a curated shelf section: title row + horizontal card row.
 *  - 'cityPicker' — the resolvedCity-null fallback: "Pick a city" shelf built
 *                   from the server's liveCities (honest vocabulary, no fake
 *                   content).
 */
export type HomeShelfRow =
  | { kind: 'shelf'; shelfKey: string; title: string; shelf: HomeShelf }
  | { kind: 'cityPicker'; shelfKey: 'city_picker'; title: string; cities: HomeFeedCity[] };

export const HOME_SHELF_ROW_TYPE_SHELF = 'shelf';
export const HOME_SHELF_ROW_TYPE_CITY_PICKER = 'cityPicker';

export const buildHomeShelfRows = (feed: HomeFeedResponse | null): HomeShelfRow[] => {
  if (feed == null) {
    return [];
  }
  if (feed.resolvedCity == null) {
    // No containing live city — honest fallback: the pick-a-city shelf (only
    // when there are live cities to offer; otherwise the empty state renders).
    return feed.liveCities.length > 0
      ? [
          {
            kind: 'cityPicker',
            shelfKey: 'city_picker',
            title: 'Pick a city',
            cities: feed.liveCities,
          },
        ]
      : [];
  }
  return feed.shelves
    .filter((shelf) => shelf.lists.length > 0)
    .map((shelf) => ({
      kind: 'shelf' as const,
      shelfKey: shelf.shelfKey,
      title: shelf.title,
      shelf,
    }));
};

export const homeShelfRowKeyExtractor = (row: HomeShelfRow): string => row.shelfKey;

/**
 * The card SUB-LINE (owner spec — Spotify pattern): rendered BELOW the cutout
 * well, on the row's white material. Middle-dot separated FACTS only — the item
 * count ("12 spots" / "1 dish") plus the server-provided subtitle when present.
 * No invented details, ever.
 */
export const composeHomeShelfCardSubline = ({
  listType,
  itemCount,
  subtitle,
}: {
  listType: string;
  itemCount: number;
  subtitle: string | null;
}): string => {
  const noun =
    listType === 'dish'
      ? itemCount === 1
        ? 'dish'
        : 'dishes'
      : itemCount === 1
        ? 'spot'
        : 'spots';
  const parts = [`${itemCount} ${noun}`];
  if (subtitle) {
    parts.push(subtitle);
  }
  return parts.join(' · ');
};

/** getItemType — 'shelf' rows are distinguished from the city-picker row. */
export const homeShelfRowItemType = (row: HomeShelfRow): string => row.kind;
