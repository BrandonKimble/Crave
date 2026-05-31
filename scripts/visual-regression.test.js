'use strict';
/**
 * Proves the visual-regression diff engine actually detects (and ignores) what it
 * should — so the gate is trustworthy. Run: `node --test scripts/visual-regression.test.js`.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');

const { compareDecoded, runVisualRegression } = require('./visual-regression');

// Solid-color PNG, then optionally paint a rectangle a different color.
const makePng = (width, height, [r, g, b], rect) => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inRect =
        rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      png.data[offset] = inRect ? rect.color[0] : r;
      png.data[offset + 1] = inRect ? rect.color[1] : g;
      png.data[offset + 2] = inRect ? rect.color[2] : b;
      png.data[offset + 3] = 255;
    }
  }
  return png;
};

// Disable the default top mask for the core-diff tests so it doesn't hide our rects.
const NO_MASK = { topMaskRatio: 0 };

test('identical images report zero mismatch', () => {
  const a = makePng(40, 40, [10, 120, 200]);
  const b = makePng(40, 40, [10, 120, 200]);
  const result = compareDecoded(a, b, NO_MASK);
  assert.strictEqual(result.dimsMatch, true);
  assert.strictEqual(result.mismatchRatio, 0);
});

test('a changed region is detected as mismatch', () => {
  const a = makePng(40, 40, [10, 120, 200]);
  const b = makePng(40, 40, [10, 120, 200], { x: 5, y: 5, w: 10, h: 10, color: [255, 0, 0] });
  const result = compareDecoded(a, b, NO_MASK);
  assert.ok(result.mismatchRatio > 0, 'expected a non-zero mismatch');
  // ~100 differing px out of 1600.
  assert.ok(result.diffPixels >= 90 && result.diffPixels <= 110, `diffPixels=${result.diffPixels}`);
});

test('a difference inside a mask is ignored (masked region cannot fail)', () => {
  // Difference sits entirely in the top 20% — masked out → zero mismatch.
  const a = makePng(40, 40, [10, 120, 200]);
  const b = makePng(40, 40, [10, 120, 200], { x: 0, y: 0, w: 40, h: 5, color: [255, 0, 0] });
  const result = compareDecoded(a, b, { topMaskRatio: 0.2 });
  assert.strictEqual(result.mismatchRatio, 0);
});

test('dimension mismatch fails loudly (never silently passes)', () => {
  const a = makePng(40, 40, [0, 0, 0]);
  const b = makePng(40, 41, [0, 0, 0]);
  const result = compareDecoded(a, b, NO_MASK);
  assert.strictEqual(result.dimsMatch, false);
  assert.strictEqual(result.mismatchRatio, 1);
});

test('missing baseline is a hard failure, not a pass', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const capturedDir = path.join(dir, 'captured');
  const baselineDir = path.join(dir, 'baseline');
  fs.mkdirSync(capturedDir);
  fs.writeFileSync(
    path.join(capturedDir, 'initial.png'),
    PNG.sync.write(makePng(10, 10, [1, 2, 3]))
  );
  const { passed, results } = runVisualRegression({ capturedDir, baselineDir, update: false });
  assert.strictEqual(passed, false);
  assert.match(results[0].reason, /no baseline/);
});

test('empty capture dir fails loudly (cannot verify)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const capturedDir = path.join(dir, 'captured');
  fs.mkdirSync(capturedDir);
  const { passed, results } = runVisualRegression({
    capturedDir,
    baselineDir: path.join(dir, 'baseline'),
  });
  assert.strictEqual(passed, false);
  assert.match(results[0].reason, /no screenshots/);
});

test('--update seeds a baseline, then an identical capture passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-'));
  const capturedDir = path.join(dir, 'captured');
  const baselineDir = path.join(dir, 'baseline');
  fs.mkdirSync(capturedDir);
  fs.writeFileSync(path.join(capturedDir, 'pan.png'), PNG.sync.write(makePng(20, 20, [9, 9, 9])));
  const seeded = runVisualRegression({ capturedDir, baselineDir, update: true });
  assert.strictEqual(seeded.passed, true);
  assert.strictEqual(seeded.results[0].status, 'baseline');
  const verified = runVisualRegression({ capturedDir, baselineDir, update: false });
  assert.strictEqual(verified.passed, true);
  assert.strictEqual(verified.results[0].status, 'pass');
});
