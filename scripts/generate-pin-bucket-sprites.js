#!/usr/bin/env node
/**
 * Generates pre-composited, per-score-bucket pin sprites for the single-symbol
 * pin model (replaces the multi-layer slot stack). Each sprite bakes the exact
 * art the live renderer composites at runtime — shadow + border (pin.png) + the
 * pin-fill alpha mask tinted to the bucket color — at the SAME geometry the app
 * uses (PIN_FILL_TOP_OFFSET / PIN_FILL_LEFT_OFFSET), so the baked pin is pixel-
 * identical to today's, including the fill being centered in the base BODY and
 * shifted up off the tip.
 *
 * Output: one PNG per (bucket x density) under src/assets/pins/, plus a manifest.
 * Rank number is NOT baked — it stays a live text-field glyph on the same symbol.
 *
 * Run: node scripts/generate-pin-bucket-sprites.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'apps/mobile/src/assets');
const OUT = path.join(ASSETS, 'pins');

// --- Geometry (mirrors apps/mobile/src/screens/Search/constants/search.ts) ---
// Logical base/fill sizes the app's offset math is defined in.
const PIN_BASE_WIDTH = 96;
const PIN_BASE_HEIGHT = 96;
const PIN_FILL_WIDTH = 80;
const PIN_FILL_HEIGHT = 72;
const PIN_FILL_VERTICAL_BIAS = -4; // shift fill UP so it sits in the base body, off the tip
const PIN_FILL_HORIZONTAL_BIAS = 0;
// Fill offsets in LOGICAL base units (identical formula to search.ts):
const FILL_TOP_OFFSET_LOGICAL = (PIN_BASE_HEIGHT - PIN_FILL_HEIGHT) / 2 + PIN_FILL_VERTICAL_BIAS; // = 8
const FILL_LEFT_OFFSET_LOGICAL = (PIN_BASE_WIDTH - PIN_FILL_WIDTH) / 2 + PIN_FILL_HORIZONTAL_BIAS; // = 8

// The pin renders at PIN_MARKER_RENDER_SIZE points, NOT the 96-logical base box.
// PIN_BASE_SCALE = PIN_MARKER_RENDER_SIZE / PIN_BASE_HEIGHT. So the sprite's
// intrinsic POINT size = PIN_MARKER_RENDER_SIZE; at @Nx it must be that many
// pixels × N, composited by DOWNSCALING from the high-res source art (crisp).
// icon-size stays 1 so Mapbox never upscales.
const PIN_MARKER_RENDER_SIZE = 28; // pt (search.ts: PIN_MARKER_SIZE * PIN_MARKER_SCALE)
const PT_PER_LOGICAL = PIN_MARKER_RENDER_SIZE / PIN_BASE_HEIGHT; // PIN_BASE_SCALE

// Shadow placement (from STYLE_PINS_SHADOW_*): the live shadow is drawn under the
// base, bottom-anchored, with a small vertical nudge. We bake it the same way.
const PIN_MARKER_SIZE = 28; // render size in pt; only used for shadow translate ratio
const SHADOW_TRANSLATE_Y_LOGICAL =
  1.25 + 18 * (PIN_BASE_HEIGHT / 98) * (PIN_BASE_HEIGHT / PIN_MARKER_SIZE) * 0; // baked at base resolution; shadow art already includes soft offset
// NOTE: shadow art (pin-shadow.png) is a soft blob already sized for the base; we
// center it horizontally under the base and align near the bottom. Kept minimal —
// the dominant shadow look comes from the sprite itself.

// --- Buckets: EIGHT 5-point buckets across the 60-100 display range. ---
// CANONICAL COLORS: these tuples MUST stay identical to SCORE_BUCKET_COLOR_TUPLES
// in apps/mobile/src/utils/quality-color.ts (single source of truth). A runtime
// assertion in that module's spec / a manual check keeps them in sync. Bucket
// index 0 = lowest (60-64, orange-red) … 7 = best (95+, vivid green).
const BUCKETS = [
  { name: 'b0', lo: 60, hi: 64, color: [239, 83, 68] },
  { name: 'b1', lo: 65, hi: 69, color: [245, 124, 56] },
  { name: 'b2', lo: 70, hi: 74, color: [247, 158, 52] },
  { name: 'b3', lo: 75, hi: 79, color: [242, 196, 70] },
  { name: 'b4', lo: 80, hi: 84, color: [203, 199, 74] },
  { name: 'b5', lo: 85, hi: 89, color: [146, 198, 84] },
  { name: 'b6', lo: 90, hi: 94, color: [78, 188, 110] },
  { name: 'b7', lo: 95, hi: 100, color: [40, 178, 123] },
];
function bucketColor(b) {
  return b.color;
}

// Only @3x is generated. Modern iPhones are all @3x; Metro/rnmapbox loads the @3x
// variant on those devices, so 1x/2x were never used AND their independent per-
// density rounding made the fill alignment visibly off. One density = one source
// of truth for alignment, crisp (downscaled from 480px art), no dead variants.
const DENSITIES = [3];

async function composeBucket(bucket, density) {
  // Output canvas = pin RENDER size (points) × density, in pixels. Composited by
  // downscaling the 480px source art → crisp. icon-size:1 in the style.
  const px = (logical) => Math.round(logical * PT_PER_LOGICAL * density);
  const W = px(PIN_BASE_WIDTH);
  const H = px(PIN_BASE_HEIGHT);
  const fillW = px(PIN_FILL_WIDTH);
  const fillH = px(PIN_FILL_HEIGHT);
  const fillLeft = px(FILL_LEFT_OFFSET_LOGICAL);
  const fillTop = px(FILL_TOP_OFFSET_LOGICAL);
  const [r, g, b] = bucketColor(bucket);

  // 1) Border/base art (pin.png is full-color RGBA already cut with the tip).
  const baseBuf = await sharp(path.join(ASSETS, 'pin.png'))
    .resize(W, H, { fit: 'fill' })
    .ensureAlpha()
    .toBuffer();

  // 2) Fill: use pin-fill.png's ALPHA as the shape mask, paint it the bucket color.
  //    (Mapbox treats pin-fill as SDF = alpha mask tinted by color; we replicate.)
  const fillResized = await sharp(path.join(ASSETS, 'pin-fill.png'))
    .resize(fillW, fillH, { fit: 'fill' })
    .ensureAlpha()
    .toBuffer();
  const { data: fillRaw, info: fillInfo } = await sharp(fillResized)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const chan = fillInfo.channels;
  const tinted = Buffer.alloc(fillInfo.width * fillInfo.height * 4);
  for (let i = 0, j = 0; i < fillRaw.length; i += chan, j += 4) {
    const alpha = fillRaw[i + (chan - 1)]; // last channel = alpha
    tinted[j] = r;
    tinted[j + 1] = g;
    tinted[j + 2] = b;
    tinted[j + 3] = alpha;
  }
  const fillPng = await sharp(tinted, {
    raw: { width: fillInfo.width, height: fillInfo.height, channels: 4 },
  })
    .png()
    .toBuffer();

  // 3) Composite border then tinted fill (fill on top, at the off-center-up offset).
  const composed = await sharp(baseBuf)
    .composite([{ input: fillPng, left: fillLeft, top: fillTop }])
    .png()
    .toBuffer();

  return { composed, W, H, fillTop, fillH, fillLeft, fillW, px };
}

// Bake the badge NUMBER (rank like "12" or score like "8.7") onto the pin, centered
// on the fill. The number is part of the ICON image, so symbol-z-order:'viewport-y'
// orders pin+number as ONE unit — no cross-pass text bleed onto stacked pins.
async function composeBadge(bucket, text, density) {
  const { composed, W, H, fillTop, fillH, fillLeft, fillW } = await composeBucket(bucket, density);
  // Center the number on the round fill region.
  const fillCenterX = fillLeft + fillW / 2;
  const fillCenterY = fillTop + fillH / 2;
  // Size the number to fill most of the round fill: ~76% of fill height for 1-2
  // digits, shrinking for longer strings ("8.7", "10") so they still fit width.
  const len = text.length;
  const heightFactor = len >= 4 ? 0.5 : len === 3 ? 0.62 : 0.78;
  const fontPx = Math.round(fillH * heightFactor);
  // White, heavy weight, centered on the fill. SVG text is crisp at any scale.
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${fillCenterX}" y="${fillCenterY}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="DIN Alternate, Arial, Helvetica, sans-serif" font-weight="800" ` +
      `font-size="${fontPx}" fill="#ffffff">${text}</text></svg>`
  );
  return sharp(composed)
    .composite([{ input: svg, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

// Max numbered rank a pin shows. Over a large search area hundreds–thousands of
// pins can be in view, so ranks 1..99 are baked and anything beyond shows a single
// shared "99+" overflow sprite per bucket (keeps the digit width legible at pin size).
const MAX_PIN_RANK = 99;
const RANK_OVERFLOW_TEXT = '99+';
const RANK_OVERFLOW_SUFFIX = 'overflow';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const SCALE = 3;
  const manifest = {
    scale: SCALE,
    generatedFrom: 'pin.png + pin-fill.png',
    buckets: [],
    // badge image ids: rank-<bucket>-<rank> and score-<bucket>-<score10>
    rankMaxRank: MAX_PIN_RANK,
    rankBadges: [],
    scoreBadges: [],
    // ACTIVE (selected/pressed) rank badges: the SAME numbered pin baked in the active color (one color,
    // not per-bucket), so a tapped pin recolors to active while KEEPING its rank number. The pin layer
    // swaps to `pin-rank-active-<rank>` on nativeHighlighted (search-map.tsx). ~MAX+1 sprites total.
    activeRankBadges: [],
  };
  // Active-color "bucket" (PRIMARY_COLOR #ff3368, matches dot-highlighted in generate-dot-sprites.js).
  const ACTIVE_BUCKET = { name: 'active', color: [255, 51, 104] };

  for (const bucket of BUCKETS) {
    const color = bucketColor(bucket);
    manifest.buckets.push({ name: bucket.name, lo: bucket.lo, hi: bucket.hi, color });

    // Plain bucket pin (no number) — used as a fallback / when no badge applies.
    const plain = await composeBucket(bucket, SCALE);
    fs.writeFileSync(path.join(OUT, `pin-${bucket.name}.png`), plain.composed);

    // RANK badges (in-viewport pins): any bucket can pair with any rank 1..MAX.
    for (let rank = 1; rank <= MAX_PIN_RANK; rank++) {
      const buf = await composeBadge(bucket, String(rank), SCALE);
      const id = `rank-${bucket.name}-${rank}`;
      fs.writeFileSync(path.join(OUT, `pin-${id}.png`), buf);
      manifest.rankBadges.push(id);
    }
    // Shared "99+" overflow badge for ranks beyond MAX_PIN_RANK.
    {
      const buf = await composeBadge(bucket, RANK_OVERFLOW_TEXT, SCALE);
      const id = `rank-${bucket.name}-${RANK_OVERFLOW_SUFFIX}`;
      fs.writeFileSync(path.join(OUT, `pin-${id}.png`), buf);
      manifest.rankBadges.push(id);
    }

    // SCORE badges (out-of-viewport pins): a bucket only ever shows scores WITHIN
    // its own display range, so we only bake those (e.g. b7 = 9.5..10.0). Score is
    // displayed out of 10 with one decimal: e.g. 87 -> "8.7", 100 -> "10".
    for (let s = bucket.lo; s <= bucket.hi; s++) {
      const text = s >= 100 ? '10' : (s / 10).toFixed(1); // "8.7", "10"
      const buf = await composeBadge(bucket, text, SCALE);
      const id = `score-${bucket.name}-${s}`;
      fs.writeFileSync(path.join(OUT, `pin-${id}.png`), buf);
      manifest.scoreBadges.push(id);
    }
    console.log(
      `bucket ${bucket.name}: rank 1-${MAX_PIN_RANK} + "${RANK_OVERFLOW_TEXT}" + score ${bucket.lo}-${bucket.hi}`
    );
  }

  // ACTIVE-color rank badges (one color across all ranks — the selected/pressed pin).
  for (let rank = 1; rank <= MAX_PIN_RANK; rank++) {
    const buf = await composeBadge(ACTIVE_BUCKET, String(rank), SCALE);
    const id = `rank-active-${rank}`;
    fs.writeFileSync(path.join(OUT, `pin-${id}.png`), buf);
    manifest.activeRankBadges.push(id);
  }
  {
    const buf = await composeBadge(ACTIVE_BUCKET, RANK_OVERFLOW_TEXT, SCALE);
    const id = `rank-active-${RANK_OVERFLOW_SUFFIX}`;
    fs.writeFileSync(path.join(OUT, `pin-${id}.png`), buf);
    manifest.activeRankBadges.push(id);
  }
  console.log(`active: rank 1-${MAX_PIN_RANK} + "${RANK_OVERFLOW_TEXT}" in active color`);

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Generate a TS module that statically imports every badge sprite and maps the
  // Mapbox image id → require()'d source. Static imports are required so Metro
  // bundles the assets; this file is the single registration surface for <Images>.
  const allIds = [
    ...manifest.buckets.map((b) => `pin-${b.name}`),
    ...manifest.rankBadges.map((id) => `pin-${id}`),
    ...manifest.scoreBadges.map((id) => `pin-${id}`),
    ...manifest.activeRankBadges.map((id) => `pin-${id}`),
  ];
  const varName = (fileId) => fileId.replace(/[^a-zA-Z0-9]/g, '_');
  const lines = [
    '// AUTO-GENERATED by scripts/generate-pin-bucket-sprites.js — do not edit.',
    '// Maps Mapbox image id (e.g. "pin-rank-b7-1") → bundled asset source.',
    "import type { ImageSourcePropType } from 'react-native';",
    '',
    ...allIds.map((fileId) => `import ${varName(fileId)} from '../assets/pins/${fileId}.png';`),
    '',
    `export const PIN_BADGE_SPRITE_SCALE = ${SCALE};`,
    '',
    'export const PIN_BADGE_IMAGES: Record<string, ImageSourcePropType> = {',
    ...allIds.map((fileId) => `  '${fileId}': ${varName(fileId)},`),
    '};',
    '',
  ];
  const genDir = path.join(__dirname, '..', 'apps/mobile/src/generated');
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(path.join(genDir, 'pin-badge-images.ts'), lines.join('\n'));

  console.log(
    `done: ${manifest.buckets.length} buckets, ${manifest.rankBadges.length} rank + ${manifest.scoreBadges.length} score badges; wrote generated/pin-badge-images.ts (${allIds.length} images)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
