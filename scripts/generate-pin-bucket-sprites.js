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

  return composed;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { buckets: [], densities: DENSITIES, generatedFrom: 'pin.png + pin-fill.png' };
  // Single high-res (3x-density) file per bucket, named plainly (no @3x suffix).
  // Registered with scale:PIN_SPRITE_SCALE via <Images> so Mapbox treats it as a
  // high-DPI image — one file, one alignment source of truth, no 1x/2x variants.
  const SCALE = 3;
  for (const bucket of BUCKETS) {
    const color = bucketColor(bucket);
    manifest.buckets.push({ name: bucket.name, lo: bucket.lo, hi: bucket.hi, color });
    const buf = await composeBucket(bucket, SCALE);
    const file = path.join(OUT, `pin-${bucket.name}.png`);
    fs.writeFileSync(file, buf);
    console.log(
      `wrote ${path.relative(path.join(__dirname, '..'), file)}  rgb(${color.join(',')})`
    );
  }
  manifest.scale = SCALE;
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    'manifest:',
    JSON.stringify(manifest.buckets.map((b) => `${b.name}=rgb(${b.color})`))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
