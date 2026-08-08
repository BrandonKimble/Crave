import {
  STRIP_BAND_BOTTOM_SPACER_HEIGHT,
  TOGGLE_STRIP_BAND_HEIGHT,
} from '../../toggles/toggle-strip-metrics';
import {
  CARD_LINE_GAP,
  CARD_VERTICAL_PADDING,
  CARD_VERTICAL_PADDING_BALANCE,
  RANK_BADGE_WIDTH,
  RESULT_DETAILS_INDENT,
} from '../../screens/Search/constants/search';
import { PHOTO_STRIP_TILE_GAP, PHOTO_STRIP_TILE_RADIUS } from '../photos/photo-strip-metrics';
import { CONTROL_RADIUS } from '../../screens/Search/constants/ui';
import {
  RESULT_CARD_GALLERY_HEIGHT,
  RESULT_CARD_GALLERY_TILE_ASPECT,
} from '../cards/ResultCard/result-card-slot-styles';
import type { MaskedHole } from '../MaskedHoleOverlay';

/**
 * Declarative HOLE PRESETS for `CutoutSkeletonSurface` — the production cutout-shimmer
 * loading skeletons. Each preset returns an absolute-positioned `MaskedHole[]`
 * (x/y/width/height/borderRadius) describing the skeleton shapes PUNCHED OUT of the white
 * sheet plate so the shimmering frosted map shows through them.
 *
 * Each preset closely mirrors (approximate first-pass port, tuned in co-design) the geometry of the
 * matching gray-box skeleton it
 * replaces (CommentSkeleton / DishSkeleton / RestaurantSkeleton / FavoriteTileSkeleton /
 * HistorySkeleton) so the cutout shapes line up with the real content for a clean
 * skeleton→content swap. These ports are the STARTING point — co-design = nudging these hole
 * rects (this file) + the shared shimmer knobs (cutout-skeleton-config.ts); the FOUNDATION
 * (frost-through, domino, functional header) stays put.
 *
 * Coordinate space: the surface fills the sheet body; holes are positioned with a horizontal
 * inset (CONTENT_HORIZONTAL_PADDING) so they sit where the real content sits, and rows stack
 * by each rowType's STRIDE.
 */

export type CutoutSkeletonRowType =
  | 'comment'
  | 'dish'
  | 'history'
  | 'photoStrip'
  | 'restaurant'
  | 'rows'
  | 'tile';

/** Clamp a fractional width to the available content width, never below 0. */
const frac = (available: number, fraction: number): number =>
  Math.max(0, Math.min(available, available * fraction));

// ─── comment (mirrors CommentSkeleton / PollCommentRow) ────────────────────────────────────
const COMMENT_ROW_PADDING_TOP = 12;
const COMMENT_AVATAR_SIZE = 28;
const COMMENT_AVATAR_RADIUS = 14;
const COMMENT_CONTENT_GAP = 10;
const COMMENT_CONTENT_X = COMMENT_AVATAR_SIZE + COMMENT_CONTENT_GAP; // 38
const META_HEIGHT = 11;
const META_MARGIN_BOTTOM = 3;
const BODY_HEIGHT = 13;
const BODY_LINE_GAP = 4;
const ACTION_HEIGHT = 12;
const ACTION_MARGIN_TOP = 8;

type RowOptions = {
  /** Top-left origin of the row in the surface's coordinate space. */
  originX: number;
  originY: number;
  /** Total content width available for the row (surface width minus insets). */
  rowWidth: number;
};

const buildCommentHoles = ({ originX, originY, rowWidth }: RowOptions): MaskedHole[] => {
  const contentX = originX + COMMENT_CONTENT_X;
  const contentWidth = Math.max(0, rowWidth - COMMENT_CONTENT_X);
  let cursorY = originY + COMMENT_ROW_PADDING_TOP;
  const holes: MaskedHole[] = [];

  // Avatar circle.
  holes.push({
    x: originX,
    y: cursorY,
    width: COMMENT_AVATAR_SIZE,
    height: COMMENT_AVATAR_SIZE,
    borderRadius: COMMENT_AVATAR_RADIUS,
  });
  // Meta row: name bar + time bar (clamped so a narrow device never punches past the right edge).
  const nameWidth = Math.min(96, contentWidth);
  const timeX = contentX + nameWidth + 8;
  const timeWidth = Math.max(0, Math.min(48, originX + rowWidth - timeX));
  holes.push({ x: contentX, y: cursorY, width: nameWidth, height: META_HEIGHT, borderRadius: 4 });
  holes.push({ x: timeX, y: cursorY, width: timeWidth, height: META_HEIGHT, borderRadius: 4 });
  cursorY += META_HEIGHT + META_MARGIN_BOTTOM;
  // Body line 1 (full content width).
  cursorY += BODY_LINE_GAP;
  holes.push({
    x: contentX,
    y: cursorY,
    width: contentWidth,
    height: BODY_HEIGHT,
    borderRadius: 5,
  });
  cursorY += BODY_HEIGHT;
  // Body line 2 (72% of content width).
  cursorY += BODY_LINE_GAP;
  holes.push({
    x: contentX,
    y: cursorY,
    width: frac(contentWidth, 0.72),
    height: BODY_HEIGHT,
    borderRadius: 5,
  });
  cursorY += BODY_HEIGHT;
  // Action chip.
  cursorY += ACTION_MARGIN_TOP;
  holes.push({ x: contentX, y: cursorY, width: 36, height: ACTION_HEIGHT, borderRadius: 6 });

  return holes;
};

const COMMENT_ROW_STRIDE =
  COMMENT_ROW_PADDING_TOP +
  META_HEIGHT +
  META_MARGIN_BOTTOM +
  BODY_LINE_GAP +
  BODY_HEIGHT +
  BODY_LINE_GAP +
  BODY_HEIGHT +
  ACTION_MARGIN_TOP +
  ACTION_HEIGHT +
  COMMENT_ROW_PADDING_TOP;

// ─── restaurant / dish (mirror RestaurantSkeleton / DishSkeleton result cards) ──────────────
// [rank 32×30] [title]
//              [score line]
//              [body line(s)]
// [Save][Share][Call][Dishes]   ← the pill row (CardActionPillRow)
//
// F882 — THIS DIAGRAM USED TO SHOW A CARD THAT NO LONGER EXISTS. It punched two
// 20×20 action holes into a right-hand "[♥ / share column]" while the shipped
// card has NO heart (owner-ratified 2026-07-26: the heart icon is dead on cards)
// and its actions live BELOW the body as a pill row. So the skeleton drew chrome
// the card lacks and omitted the row it has — the exact swap-jump this file's
// own header says it prevents.
const RESULT_PADDING_TOP = CARD_VERTICAL_PADDING - CARD_VERTICAL_PADDING_BALANCE; // 10
const RESULT_PADDING_BOTTOM = CARD_VERTICAL_PADDING + CARD_VERTICAL_PADDING_BALANCE; // 14
const RANK_HEIGHT = 30;
const TITLE_HEIGHT = 16;
const SCORE_HEIGHT = 13;
const BODY_LINE_HEIGHT = 12;
// The pill row under the card body (CardActionPillRow): pills are
// paddingVertical 8 around a caption line, gap 8 between them, marginTop 10 on
// the row. The skeleton draws the first pills and lets the rest bleed off the
// right edge, exactly like the scrollable strip does.
const PILL_ROW_MARGIN_TOP = 10;
const PILL_HEIGHT = 32;
const PILL_GAP = 8;
const PILL_RADIUS = 16;
const PILL_WIDTHS = [78, 82, 74, 84];

/** One result-card row. `bodyLineFractions` lists the non-score body lines as width fractions. */
const buildResultCardHoles = (
  { originX, originY, rowWidth }: RowOptions,
  bodyLineFractions: number[],
  scoreWidth: number
): MaskedHole[] => {
  const holes: MaskedHole[] = [];
  const titleY = originY + RESULT_PADDING_TOP;
  // F882: the title spans the FULL row — there is no right-hand actions column
  // on the shipped card any more, so reserving 32pt for one left a permanent
  // dead gutter the real title crossed on swap.
  const titleAvailable = rowWidth;
  const bodyX = originX + RESULT_DETAILS_INDENT;
  const bodyWidth = Math.max(0, titleAvailable - RESULT_DETAILS_INDENT);

  // Rank badge + title.
  holes.push({
    x: originX,
    y: titleY,
    width: RANK_BADGE_WIDTH,
    height: RANK_HEIGHT,
    borderRadius: 15,
  });
  holes.push({
    x: originX + RANK_BADGE_WIDTH + CARD_LINE_GAP,
    y: titleY + (RANK_HEIGHT - TITLE_HEIGHT) / 2,
    width: frac(titleAvailable, 0.58),
    height: TITLE_HEIGHT,
    borderRadius: 5,
  });

  // Body stack (score line, then the body lines), indented under the title.
  let bodyY = titleY + RANK_HEIGHT + CARD_LINE_GAP;
  holes.push({
    x: bodyX,
    y: bodyY,
    width: Math.min(scoreWidth, bodyWidth),
    height: SCORE_HEIGHT,
    borderRadius: 5,
  });
  bodyY += SCORE_HEIGHT + CARD_LINE_GAP;
  bodyLineFractions.forEach((fraction, index) => {
    holes.push({
      x: bodyX,
      y: bodyY,
      width: frac(bodyWidth, fraction),
      height: BODY_LINE_HEIGHT,
      borderRadius: 5,
    });
    if (index < bodyLineFractions.length - 1) {
      bodyY += BODY_LINE_HEIGHT + CARD_LINE_GAP;
    }
  });

  // The pill row, below the body — the shipped card's actual action affordance.
  let pillX = originX;
  const pillY = bodyY + BODY_LINE_HEIGHT + PILL_ROW_MARGIN_TOP;
  for (const pillWidth of PILL_WIDTHS) {
    if (pillX >= originX + rowWidth) {
      break;
    }
    holes.push({
      x: pillX,
      y: pillY,
      width: Math.min(pillWidth, originX + rowWidth - pillX),
      height: PILL_HEIGHT,
      borderRadius: PILL_RADIUS,
    });
    pillX += pillWidth + PILL_GAP;
  }

  return holes;
};

// Restaurant: score + top-food + status (3 body rows total). Dish: score + meta (2 rows).
const RESTAURANT_BODY_FRACTIONS = [0.9, 0.74];
const DISH_BODY_FRACTIONS = [0.8];
// Score-line widths mirror the original *Skeleton boxes (Restaurant 120, Dish 108).
const RESTAURANT_SCORE_WIDTH = 120;
const DISH_SCORE_WIDTH = 108;
const resultRowStride = (bodyLineCount: number): number =>
  RESULT_PADDING_TOP +
  RANK_HEIGHT +
  CARD_LINE_GAP +
  SCORE_HEIGHT +
  bodyLineCount * (BODY_LINE_HEIGHT + CARD_LINE_GAP) +
  // …plus the pill row the card actually has (F882).
  PILL_ROW_MARGIN_TOP +
  PILL_HEIGHT +
  RESULT_PADDING_BOTTOM;
const RESTAURANT_ROW_STRIDE = resultRowStride(RESTAURANT_BODY_FRACTIONS.length);
const DISH_ROW_STRIDE = resultRowStride(DISH_BODY_FRACTIONS.length);

// ─── tile (mirrors FavoriteTileSkeleton — a 2-up grid row) ──────────────────────────────────
const TILE_GRID_GAP = 12;
const TILE_PADDING = 12;
const TILE_MIN_HEIGHT = 140;
const TILE_LINE_HEIGHT = 12;
const TILE_LINE_GAP = 8;
const TILE_FOOTER_HEIGHT = 16;
const TILE_FOOTER_MARGIN_TOP = 8;

const buildTileRowHoles = ({ originX, originY, rowWidth }: RowOptions): MaskedHole[] => {
  const holes: MaskedHole[] = [];
  const cellWidth = Math.max(0, (rowWidth - TILE_GRID_GAP) / 2);
  const contentWidth = Math.max(0, cellWidth - TILE_PADDING * 2);
  const lineFractions = [0.9, 0.78, 0.66];

  for (let cell = 0; cell < 2; cell += 1) {
    const cellX = originX + cell * (cellWidth + TILE_GRID_GAP);
    const contentX = cellX + TILE_PADDING;
    let lineY = originY + TILE_PADDING;
    lineFractions.forEach((fraction) => {
      holes.push({
        x: contentX,
        y: lineY,
        width: frac(contentWidth, fraction),
        height: TILE_LINE_HEIGHT,
        borderRadius: 5,
      });
      lineY += TILE_LINE_HEIGHT + TILE_LINE_GAP;
    });
    // Footer title line below the tile.
    holes.push({
      x: cellX,
      y: originY + TILE_MIN_HEIGHT + TILE_FOOTER_MARGIN_TOP,
      width: frac(cellWidth, 0.6),
      height: TILE_FOOTER_HEIGHT,
      borderRadius: 5,
    });
  }
  return holes;
};

// Real inter-row spacing stacks the gridList gap AND each tileWrapper's marginBottom (≈ 2× GRID_GAP),
// so count both — otherwise the skeleton rows pack tighter than the real grid and drift up on swap.
const TILE_ROW_STRIDE =
  TILE_MIN_HEIGHT + TILE_FOOTER_MARGIN_TOP + TILE_FOOTER_HEIGHT + 2 * TILE_GRID_GAP;

// ─── photoStrip (mirrors PhotoStrip — a row of ~3-4 landscape photo tiles) ──────────────────
// F882: the tile geometry is IMPORTED from the gallery it mirrors, never
// restated. The local copies had drifted to 72 high at 4:3 (96×72 tiles) while
// the shipped gallery renders 96 high at 1.1 (~106×96) — a visible resize on
// every skeleton→content swap, and the second failure mode this file exists to
// prevent. The file already imports live search constants; this extends that
// discipline to the card's own.
const PHOTO_STRIP_PADDING_TOP = 10;
const PHOTO_STRIP_TILE_HEIGHT = RESULT_CARD_GALLERY_HEIGHT;
const PHOTO_STRIP_TILE_ASPECT = RESULT_CARD_GALLERY_TILE_ASPECT;
const PHOTO_STRIP_PADDING_BOTTOM = 10;

const buildPhotoStripHoles = ({ originX, originY, rowWidth }: RowOptions): MaskedHole[] => {
  const holes: MaskedHole[] = [];
  const tileWidth = Math.round(PHOTO_STRIP_TILE_HEIGHT * PHOTO_STRIP_TILE_ASPECT);
  const y = originY + PHOTO_STRIP_PADDING_TOP;
  // Tiles until the strip runs off the right edge (clamped), like the real scroller mid-strip.
  let x = originX;
  while (x < originX + rowWidth) {
    holes.push({
      x,
      y,
      width: Math.min(tileWidth, originX + rowWidth - x),
      height: PHOTO_STRIP_TILE_HEIGHT,
      borderRadius: PHOTO_STRIP_TILE_RADIUS,
    });
    x += tileWidth + PHOTO_STRIP_TILE_GAP;
  }
  return holes;
};

const PHOTO_STRIP_ROW_STRIDE =
  PHOTO_STRIP_PADDING_TOP + PHOTO_STRIP_TILE_HEIGHT + PHOTO_STRIP_PADDING_BOTTOM;

// ─── history (mirrors HistorySkeleton — icon + one line) ────────────────────────────────────
const HISTORY_ROW_HEIGHT = 60;
const HISTORY_ICON_SIZE = 18;
const HISTORY_ICON_COLUMN = 22;
const HISTORY_ICON_MARGIN_RIGHT = 10;
const HISTORY_LINE_HEIGHT = 14;

const buildHistoryHoles = ({ originX, originY, rowWidth }: RowOptions): MaskedHole[] => {
  const lineX = originX + HISTORY_ICON_COLUMN + HISTORY_ICON_MARGIN_RIGHT;
  const lineAvailable = Math.max(0, rowWidth - HISTORY_ICON_COLUMN - HISTORY_ICON_MARGIN_RIGHT);
  return [
    {
      x: originX + (HISTORY_ICON_COLUMN - HISTORY_ICON_SIZE) / 2,
      y: originY + (HISTORY_ROW_HEIGHT - HISTORY_ICON_SIZE) / 2,
      width: HISTORY_ICON_SIZE,
      height: HISTORY_ICON_SIZE,
      borderRadius: HISTORY_ICON_SIZE / 2,
    },
    {
      x: lineX,
      y: originY + (HISTORY_ROW_HEIGHT - HISTORY_LINE_HEIGHT) / 2,
      width: frac(lineAvailable, 0.58),
      height: HISTORY_LINE_HEIGHT,
      borderRadius: 5,
    },
  ];
};

// ─── dispatch ───────────────────────────────────────────────────────────────────────────────
type RowBuilder = (options: RowOptions) => MaskedHole[];

const ROW_BUILDERS: Record<CutoutSkeletonRowType, { build: RowBuilder; stride: number }> = {
  comment: { build: buildCommentHoles, stride: COMMENT_ROW_STRIDE },
  restaurant: {
    build: (o) => buildResultCardHoles(o, RESTAURANT_BODY_FRACTIONS, RESTAURANT_SCORE_WIDTH),
    stride: RESTAURANT_ROW_STRIDE,
  },
  dish: {
    build: (o) => buildResultCardHoles(o, DISH_BODY_FRACTIONS, DISH_SCORE_WIDTH),
    stride: DISH_ROW_STRIDE,
  },
  photoStrip: { build: buildPhotoStripHoles, stride: PHOTO_STRIP_ROW_STRIDE },
  tile: { build: buildTileRowHoles, stride: TILE_ROW_STRIDE },
  history: { build: buildHistoryHoles, stride: HISTORY_ROW_HEIGHT },
  // OA10 vocabulary: 'rows' is the honest name for generic list-ROW skeleton
  // material (the rows|tiles pair). It aliases the history geometry today —
  // 'history' stays because a TRUE history surface exists (RecentHistoryView) —
  // but non-history row surfaces (saveList, and Lists in row view-mode) declare
  // 'rows', never 'history'.
  rows: { build: buildHistoryHoles, stride: HISTORY_ROW_HEIGHT },
};

// ─── filter-strip pills (owner design 2026-07-07: the INITIAL/reveal skeleton carries a
// few pill-shaped holes exactly where the toggle strip sits — static approximations of the
// strip's cutouts, since the real strip is hidden during initial loading; the interaction
// skeleton omits them because the live strip is visible above it) ───────────────────────
const STRIP_PILL_HEIGHT = TOGGLE_STRIP_BAND_HEIGHT; // the declared band height — never a re-listed number
const STRIP_PILL_RADIUS = CONTROL_RADIUS; // the shared control corner radius — never a re-listed number
const STRIP_PILL_GAP = 8;
const STRIP_PILL_WIDTHS = [104, 72, 88];
// The block's bottom gap = the ONE band-block seam (strip-band seam law §1).
const STRIP_BLOCK_BOTTOM_GAP = STRIP_BAND_BOTTOM_SPACER_HEIGHT;

/** The vertical space the strip-pill block occupies (rows stack below it). */
export const FILTER_STRIP_HOLES_BLOCK_HEIGHT = STRIP_PILL_HEIGHT + STRIP_BLOCK_BOTTOM_GAP;

export const buildFilterStripPillHoles = ({
  originX,
  originY,
}: Pick<RowOptions, 'originX' | 'originY'>): MaskedHole[] => {
  let cursorX = originX;
  return STRIP_PILL_WIDTHS.map((width) => {
    const hole = {
      x: cursorX,
      y: originY,
      width,
      height: STRIP_PILL_HEIGHT,
      borderRadius: STRIP_PILL_RADIUS,
    };
    cursorX += width + STRIP_PILL_GAP;
    return hole;
  });
};

export type BuildPresetHolesOptions = {
  rowType: CutoutSkeletonRowType;
  /** Width of the surface content area (surface width minus 2× inset). */
  rowWidth: number;
  /** How many rows to stack. */
  rowCount?: number;
  /** Left/top inset of the first row (surface coordinate space). */
  insetX?: number;
  insetY?: number;
};

/** Map a `rowType` + count to a stacked, absolute-positioned holes list. */
export const buildPresetHoles = ({
  rowType,
  rowWidth,
  rowCount = 6,
  insetX = 0,
  insetY = 0,
}: BuildPresetHolesOptions): MaskedHole[] => {
  const builder = ROW_BUILDERS[rowType];
  if (!builder) {
    return [];
  }
  const holes: MaskedHole[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    holes.push(
      ...builder.build({ originX: insetX, originY: insetY + i * builder.stride, rowWidth })
    );
  }
  return holes;
};

// A non-zero fallback so an out-of-union rowType (TS forbids it, but call sites compute rowType
// dynamically) can never collapse SceneLoadingSurface's minHeight to 0 — it fails LOUDLY in dev
// and degrades to a sensibly-sized plate in release instead of an invisible zero-height skeleton.
const FALLBACK_ROW_STRIDE = 80;

/** The vertical stride (px) of one row of the given type — for sizing/row-count math. */
export const presetRowStride = (rowType: CutoutSkeletonRowType): number => {
  const stride = ROW_BUILDERS[rowType]?.stride;
  if (stride == null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cutout-skeleton] no preset for rowType "${rowType}" — using a fallback stride.`
      );
    }
    return FALLBACK_ROW_STRIDE;
  }
  return stride;
};
