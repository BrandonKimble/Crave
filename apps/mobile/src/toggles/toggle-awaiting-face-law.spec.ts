/**
 * OA12 source law — the bare-white awaiting face is unrepresentable in src.
 *
 * Two banned tokens, each the corpse of a killed mechanism:
 *   1. `__CRAVE_POLLS_TOGGLE_SEAM_SKELETON` — the OA9 A/B flag (dead by ruling; its
 *      disarmed arm WAS the bare-white face).
 *   2. an awaiting-phase ternary that renders `null` — the per-surface bespoke
 *      bare-white arm (ListDetailPanel's pre-OA12 shape). Surfaces render the
 *      primitive's `awaitingFace` instead.
 *
 * RED by reintroducing either token anywhere under src/. Filesystem sweep, no shell:
 * a missing tool cannot be swallowed as a pass (the walk itself throws on error).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.join(__dirname, '..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
};

describe('OA12: no bare-white awaiting face in src', () => {
  const files = walk(SRC_ROOT);

  it('sanity: the sweep sees the codebase (an empty walk is a broken sweep, not a pass)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('the OA9 A/B flag global is dead', () => {
    const offenders = files.filter((file) =>
      fs.readFileSync(file, 'utf8').includes('__CRAVE_POLLS_TOGGLE_SEAM_SKELETON')
    );
    expect(offenders).toEqual([]);
  });

  it("no surface renders null on the 'awaiting' phase", () => {
    const bareWhiteArm = /===\s*'awaiting'\s*\?\s*null/;
    const offenders = files.filter((file) => bareWhiteArm.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
