/**
 * F803 — EVERY build's API base URL must be the COMPLETE base, `/api/v1` included.
 *
 * The api client uses EXPO_PUBLIC_API_URL verbatim as axios `baseURL` (it does
 * not append a prefix), and the NestJS app serves everything under
 * `setGlobalPrefix('api/v1')` (apps/api/src/main.ts). An origin-only value
 * therefore 404s on every route — which is exactly what eas.json shipped until
 * 2026-08-03. The truth lives in more than one file, so this spec asserts the
 * agreement rather than trusting it.
 *
 * RED recipe: strip `/api/v1` off `build.base.env.EXPO_PUBLIC_API_URL` in
 * eas.json (the pre-fix value) and the first case fails.
 */
import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '..', '..');

const readEnvFile = (file: string): Record<string, string> | null => {
  const full = path.join(mobileRoot, file);
  if (!fs.existsSync(full)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) {
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
};

const collectEasApiUrls = (node: unknown, found: string[]): string[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectEasApiUrls(child, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'EXPO_PUBLIC_API_URL' && typeof value === 'string') {
        found.push(value);
      } else {
        collectEasApiUrls(value, found);
      }
    }
  }
  return found;
};

describe('EXPO_PUBLIC_API_URL carries the /api/v1 global prefix', () => {
  it('every EAS build profile points at a complete base URL', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
    const urls = collectEasApiUrls(eas, []);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/\/api\/v1$/);
    }
  });

  it('the committed env templates agree with the EAS profiles', () => {
    const example = readEnvFile('.env.example');
    expect(example).not.toBeNull();
    expect(example?.EXPO_PUBLIC_API_URL).toMatch(/\/api\/v1$/);
  });

  it("the client's own fallback carries the same suffix", () => {
    const source = fs.readFileSync(path.join(mobileRoot, 'src/services/api.ts'), 'utf8');
    const match = source.match(/const DEFAULT_API_URL = '([^']+)'/);
    expect(match?.[1]).toMatch(/\/api\/v1$/);
  });
});
