import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/mobile/scripts -> repo root
const repoRoot = path.resolve(__dirname, '../../..');
const inputPath = path.join(repoRoot, 'apps/mobile/src/assets/pin.png');
const outputPath = path.join(repoRoot, 'apps/mobile/src/assets/pin-shadow.png');

// This generates a blurred drop-shadow sprite for SymbolLayer pins.
//
// Why this exists:
// - MarkerView pins used native shadows (shadowRadius/elevation) which SymbolLayers don't support.
// - Mapbox style layers can only draw textured quads; to get a "real" shadow we bake the blur into
//   the PNG itself.
//
// Tunables:
// - `sigmaPx`: blur sigma in *source pixels* (pin.png is 96x98). Rendered size is ~28px tall, so
//   sigma 4–6 generally matches the old subtle shadow.
// - `alphaScale`: overall strength of the shadow.
const sigmaPx = 5;
const alphaScale = 0.32;
// Add padding so the baked blur isn't clipped at the PNG edges when rendered as a Mapbox icon.
// We pad the bottom too (blur can extend below the pin tip), and compensate in JS with a small
// additional `iconTranslate` so the shadow still sits in the same place.
const padXpx = 10;
const padTopPx = 10;
const padBottomPx = 18;

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));
const writePng = (filePath, png) => fs.writeFileSync(filePath, PNG.sync.write(png));

const gaussianKernel1D = (sigma) => {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const value = Math.exp(-(i * i) / denom);
    kernel[i + radius] = value;
    sum += value;
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  return { kernel, radius };
};

const blurAlphaSeparable = (alpha, width, height, sigma) => {
  const { kernel, radius } = gaussianKernel1D(sigma);

  const temp = new Float32Array(alpha.length);
  const out = new Float32Array(alpha.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.max(0, Math.min(width - 1, x + k));
        acc += alpha[rowOffset + sx] * kernel[k + radius];
      }
      temp[rowOffset + x] = acc;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.max(0, Math.min(height - 1, y + k));
        acc += temp[sy * width + x] * kernel[k + radius];
      }
      out[y * width + x] = acc;
    }
  }

  return out;
};

const main = () => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input: ${inputPath}`);
  }

  const input = readPng(inputPath);
  const { width, height } = input;
  const outWidth = width + padXpx * 2;
  const outHeight = height + padTopPx + padBottomPx;

  const alpha = new Float32Array(outWidth * outHeight);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inIdx = (width * y + x) * 4 + 3;
      const outIdx = outWidth * (y + padTopPx) + (x + padXpx);
      alpha[outIdx] = input.data[inIdx] / 255;
    }
  }

  const blurred = blurAlphaSeparable(alpha, outWidth, outHeight, sigmaPx);

  const output = new PNG({ width: outWidth, height: outHeight });
  for (let i = 0; i < outWidth * outHeight; i++) {
    const a = Math.max(0, Math.min(1, blurred[i] * alphaScale));
    output.data[i * 4 + 0] = 0;
    output.data[i * 4 + 1] = 0;
    output.data[i * 4 + 2] = 0;
    output.data[i * 4 + 3] = Math.round(a * 255);
  }

  writePng(outputPath, output);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
};

main();
