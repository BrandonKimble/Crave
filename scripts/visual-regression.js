#!/usr/bin/env node
/**
 * Visual regression for the map (and any captured screenshots).
 *
 * Complements the existing heuristic pixel checks in perf-scenario-visual-contracts.js
 * (which ask "is this region tinted brand-color?"). This tool answers a different
 * question: "did this canonical screen state change from its approved baseline?" —
 * the flicker / dots / z-order things that previously could only be eyeballed on a
 * device.
 *
 * Philosophy (the lesson from the rg false-fail): NEVER silently pass when we
 * cannot actually measure. A missing baseline, missing capture, or size mismatch
 * is a hard failure with an actionable message — not a green tick.
 *
 * Usage:
 *   node scripts/visual-regression.js --captured <dir> [--baseline <dir>]
 *        [--diff-out <dir>] [--update] [--pixel-threshold 0.1] [--max-mismatch 0.005]
 *
 *   --update        seed/refresh baselines from the captured screenshots
 *   --pixel-threshold  per-pixel color sensitivity passed to pixelmatch (0..1)
 *   --max-mismatch  max fraction of differing pixels allowed before failing
 *
 * Determinism note: map tiles/labels have inherent sub-pixel jitter, so the
 * default tolerances are lenient and the status bar (clock/battery) is masked.
 * Capture from a seeded scenario at a settled camera for stable baselines.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const DEFAULT_PIXEL_THRESHOLD = 0.1; // per-pixel sensitivity (pixelmatch)
const DEFAULT_MAX_MISMATCH = 0.005; // 0.5% of pixels may differ before failing
// Mask the top of the frame (status bar: clock, battery, signal) as a fraction
// of height — those change every run and would otherwise be false positives.
const DEFAULT_TOP_MASK_RATIO = 0.06;

/** Zero out (paint black) rectangular regions in-place so they are ignored by the diff. */
const applyMasks = (png, masks) => {
  for (const mask of masks) {
    const x0 = Math.max(0, Math.floor(mask.x));
    const y0 = Math.max(0, Math.floor(mask.y));
    const x1 = Math.min(png.width, Math.ceil(mask.x + mask.width));
    const y1 = Math.min(png.height, Math.ceil(mask.y + mask.height));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * png.width + x) * 4;
        png.data[offset] = 0;
        png.data[offset + 1] = 0;
        png.data[offset + 2] = 0;
        png.data[offset + 3] = 255;
      }
    }
  }
};

const resolveMasks = (png, topMaskRatio) =>
  topMaskRatio > 0
    ? [{ x: 0, y: 0, width: png.width, height: Math.round(png.height * topMaskRatio) }]
    : [];

/**
 * Compare two decoded PNGs. Pure function — the unit-testable core.
 * Returns { dimsMatch, mismatchRatio, diffPixels, diff } (diff is a PNG or null).
 */
const compareDecoded = (captured, baseline, options = {}) => {
  const pixelThreshold = options.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD;
  const topMaskRatio = options.topMaskRatio ?? DEFAULT_TOP_MASK_RATIO;
  if (captured.width !== baseline.width || captured.height !== baseline.height) {
    return {
      dimsMatch: false,
      mismatchRatio: 1,
      diffPixels: captured.width * captured.height,
      diff: null,
    };
  }
  // Mask both images identically so masked regions can never contribute a diff.
  const masks = resolveMasks(captured, topMaskRatio);
  applyMasks(captured, masks);
  applyMasks(baseline, masks);
  const { width, height } = captured;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(captured.data, baseline.data, diff.data, width, height, {
    threshold: pixelThreshold,
  });
  return {
    dimsMatch: true,
    mismatchRatio: diffPixels / (width * height),
    diffPixels,
    diff,
  };
};

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));

const listPngs = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith('.png'))
        .sort()
    : [];

/**
 * Run the full directory comparison. Returns { passed, results } and NEVER throws
 * for an ordinary missing-baseline/empty-capture — those become explicit failures.
 */
const runVisualRegression = (opts) => {
  const capturedDir = opts.capturedDir;
  const baselineDir = opts.baselineDir;
  const diffOutDir = opts.diffOutDir;
  const update = opts.update === true;
  const maxMismatch = opts.maxMismatch ?? DEFAULT_MAX_MISMATCH;
  const results = [];
  const captured = listPngs(capturedDir);

  if (captured.length === 0) {
    return {
      passed: false,
      results: [
        {
          name: '(none)',
          status: 'fail',
          reason: `no screenshots found in captured dir ${capturedDir} — cannot verify (did capture run?)`,
        },
      ],
    };
  }

  if (update) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }
  if (diffOutDir) {
    fs.mkdirSync(diffOutDir, { recursive: true });
  }

  for (const name of captured) {
    const capturedPath = path.join(capturedDir, name);
    const baselinePath = path.join(baselineDir, name);

    if (update) {
      fs.copyFileSync(capturedPath, baselinePath);
      results.push({ name, status: 'baseline', reason: 'baseline written/refreshed' });
      continue;
    }
    if (!fs.existsSync(baselinePath)) {
      results.push({
        name,
        status: 'fail',
        reason: `no baseline at ${baselinePath} — review the capture and re-run with --update to approve it`,
      });
      continue;
    }
    const result = compareDecoded(readPng(capturedPath), readPng(baselinePath), opts);
    if (!result.dimsMatch) {
      results.push({ name, status: 'fail', reason: 'dimension mismatch vs baseline' });
      continue;
    }
    if (result.mismatchRatio > maxMismatch) {
      if (diffOutDir) {
        fs.writeFileSync(path.join(diffOutDir, name), PNG.sync.write(result.diff));
      }
      results.push({
        name,
        status: 'fail',
        reason: `mismatch ${(result.mismatchRatio * 100).toFixed(3)}% > ${(maxMismatch * 100).toFixed(3)}% (${result.diffPixels}px)`,
      });
      continue;
    }
    results.push({
      name,
      status: 'pass',
      reason: `mismatch ${(result.mismatchRatio * 100).toFixed(3)}% within tolerance`,
    });
  }

  const passed = results.every((entry) => entry.status !== 'fail');
  return { passed, results };
};

const parseArgs = (argv) => {
  const opts = {
    capturedDir: null,
    baselineDir: path.resolve(__dirname, '..', 'visual-baselines'),
    diffOutDir: path.resolve('/tmp/visual-diffs'),
    update: false,
    pixelThreshold: DEFAULT_PIXEL_THRESHOLD,
    maxMismatch: DEFAULT_MAX_MISMATCH,
    topMaskRatio: DEFAULT_TOP_MASK_RATIO,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--captured') opts.capturedDir = path.resolve(argv[(i += 1)]);
    else if (arg === '--baseline') opts.baselineDir = path.resolve(argv[(i += 1)]);
    else if (arg === '--diff-out') opts.diffOutDir = path.resolve(argv[(i += 1)]);
    else if (arg === '--update') opts.update = true;
    else if (arg === '--pixel-threshold') opts.pixelThreshold = Number(argv[(i += 1)]);
    else if (arg === '--max-mismatch') opts.maxMismatch = Number(argv[(i += 1)]);
    else if (arg === '--top-mask-ratio') opts.topMaskRatio = Number(argv[(i += 1)]);
  }
  return opts;
};

if (require.main === module) {
  const opts = parseArgs(process.argv);
  if (!opts.capturedDir) {
    console.error('visual-regression: --captured <dir> is required');
    process.exit(2);
  }
  const { passed, results } = runVisualRegression(opts);
  for (const entry of results) {
    const tag = entry.status.toUpperCase().padEnd(8);
    console.log(`${tag} ${entry.name}  ${entry.reason}`);
  }
  console.log(passed ? '\nvisual-regression: PASS' : '\nvisual-regression: FAIL');
  process.exit(passed ? 0 : 1);
}

module.exports = { compareDecoded, runVisualRegression, applyMasks };
