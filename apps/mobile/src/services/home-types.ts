/**
 * HOME feed types (home-surface-charter) — pure type module (hermetic-jest
 * safe; no api import). The typed client lives in ./home.
 */
export type HomeFeedCity = {
  placeId: string;
  name: string;
};

export type HomeShelfList = {
  listId: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  listType: string;
  itemCount: number;
  previewNames: string[];
};

export type HomeShelf = {
  shelfKey: string;
  title: string;
  lists: HomeShelfList[];
};

export type HomeFeedResponse = {
  resolvedCity: HomeFeedCity | null;
  shelves: HomeShelf[];
  liveCities: HomeFeedCity[];
};
