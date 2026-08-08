#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml (the tracksheet R8 grep-invariant CI step).
/**
 * GATE: the R8 old-system delete stays deleted, and the track's one-authority
 * laws hold (transition-endstate-contract PART 4 — "the grep-invariant suite").
 *
 * Four checks, each RED-proven by temporary reintroduction (ledger in the R8
 * report):
 *
 *  1. NO IMPORT OF A DELETED OLD-HOST MODULE. R8 (2026-08-08) deleted the old
 *     sheet subtree (BottomSheetSceneStackHost and its satellites). A new
 *     import of any of those module names is the old system growing back.
 *
 *  2. NO SCENE-KEYED SCROLL-MEMORY WRITE in src/tracksheet (G-ENTRY, R1).
 *     Scroll memory keys on the ENTRY (`sceneKey#entryId`); a `.save(scene…)`
 *     or `.save(legScene…)` call re-forks tab scroll memory by scene — the
 *     exact collision R1 deleted.
 *
 *  3. ONE SKELETON MATERIAL RESOLVER (G-SKEL / OA2). The loading material is
 *     the scene's foundation-spec row through resolveSceneLoadingMaterial;
 *     a `rowType="…"` / `rowType: '…'` literal outside the spec, the skeleton
 *     component library, the track resolver, and the stated exclusions is a
 *     second material decider. Exclusions, each with its reason:
 *       - components/skeletons/**          (the material definitions themselves)
 *       - navigation/runtime/scene-foundation-spec.ts (THE spec)
 *       - tracksheet/track-entry-skeleton.ts (the track resolver + fallback)
 *       - screens/Search/**                ('search' owns its composition —
 *                                           spec-excluded by design, audit #10-12)
 *       - perf/lifecycle-harness/**        (dev harness, not a product surface)
 *       - overlays/panels/SaveListPanel.tsx (TODO(owner): 'history' vs 'tile'
 *                                           spec contradiction — owner ruling
 *                                           pending, today's behavior kept)
 *       - *.spec.ts* / __render__/**       (fixtures fossilize literals on purpose)
 *
 *  4. NO 'instant' SHEET MOTION (OA5: "every sheet glides"). The
 *     mode:'spring'|'instant' plumbing died in R8; any `mode: 'instant'` or a
 *     reintroduced `'spring' | 'instant'` union is the teleport coming back.
 *
 * Comments are STRIPPED before matching (prose cannot vote) — same discipline
 * as check-search-styles-orphan-keys.mjs, same helper.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(repoRoot, 'apps/mobile/src');

const DELETED_OLD_HOST_MODULES = [
  'BottomSheetSceneStackHost',
  'SearchOverlayRouteGateHost',
  'SearchOverlayRouteSheetSurfaceHost',
  'SearchRouteSceneStackBottomSheetSurfaceHost',
  'SearchMountedScenePageBundleAuthority',
  'SearchMountedSceneBody',
  'BottomSheetSceneStackBodyLayer',
  'BottomSheetSceneStackDecorLayers',
  'PersistentSheetHeaderHost',
  'host-token-transition-adapter',
  'transition-lane-player',
  'OneTrackPrototype',
];

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const files = walk(SRC);
if (files.length === 0) {
  console.error('[tracksheet-invariants] scanned ZERO files — the scan root moved; failing loud.');
  process.exit(1);
}

const failures = [];
const rel = (f) => path.relative(repoRoot, f);

const isSpecOrFixture = (f) =>
  /\.spec\.tsx?$/.test(f) ||
  /render-spec\.tsx?$/.test(f) ||
  f.includes(`${path.sep}__render__${path.sep}`);

const ROWTYPE_ALLOWED = (f) => {
  const r = rel(f).replace(/\\/g, '/');
  return (
    r.startsWith('apps/mobile/src/components/skeletons/') ||
    r === 'apps/mobile/src/navigation/runtime/scene-foundation-spec.ts' ||
    r === 'apps/mobile/src/tracksheet/track-entry-skeleton.ts' ||
    r.startsWith('apps/mobile/src/screens/Search/') ||
    r.startsWith('apps/mobile/src/perf/lifecycle-harness/') ||
    r === 'apps/mobile/src/overlays/panels/SaveListPanel.tsx' ||
    isSpecOrFixture(f)
  );
};

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const lines = code.split('\n');

  // 1 — deleted old-host imports (any import/require/export-from specifier).
  for (const name of DELETED_OLD_HOST_MODULES) {
    const importRe = new RegExp(
      `from\\s+['"][^'"]*\\/${name}['"]|require\\(['"][^'"]*\\/${name}['"]\\)`
    );
    lines.forEach((line, i) => {
      if (importRe.test(line)) {
        failures.push(`${rel(file)}:${i + 1} imports deleted old-host module '${name}'`);
      }
    });
  }

  // 2 — scene-keyed scroll-memory writes, tracksheet only.
  if (
    rel(file).replace(/\\/g, '/').startsWith('apps/mobile/src/tracksheet/') &&
    !isSpecOrFixture(file)
  ) {
    const sceneKeyedSave =
      /(?:ScrollMemory|scrollMemory)\w*(?:Ref\.current)?\.save\(\s*(?:scene|legScene|sceneKey)\b/;
    lines.forEach((line, i) => {
      if (sceneKeyedSave.test(line)) {
        failures.push(
          `${rel(file)}:${i + 1} scene-keyed scroll-memory write (G-ENTRY: key on the entry)`
        );
      }
    });
  }

  // 3 — rowType literals outside the one resolver + stated exclusions.
  if (!ROWTYPE_ALLOWED(file)) {
    // JSX attribute literal or object-literal single value (a union TYPE
    // annotation `rowType: 'a' | 'b'` is a type position, not a decision —
    // exempted by the negative lookahead for `|`).
    const rowTypeLiteral = /rowType\s*(?:=\s*["']|:\s*["'][a-zA-Z]+["']\s*(?!\s*\|))/;
    lines.forEach((line, i) => {
      if (/rowType\s*:\s*["'][a-zA-Z]+["']\s*\|/.test(line)) return; // union type
      if (rowTypeLiteral.test(line)) {
        failures.push(
          `${rel(file)}:${i + 1} hardcoded skeleton rowType (OA2: material comes from the foundation spec)`
        );
      }
    });
  }

  // 4 — instant sheet motion.
  lines.forEach((line, i) => {
    if (
      /mode\s*:\s*['"]instant['"]/.test(line) ||
      /['"]spring['"]\s*\|\s*['"]instant['"]/.test(line)
    ) {
      failures.push(`${rel(file)}:${i + 1} 'instant' sheet motion (OA5: every sheet glides)`);
    }
  });
}

if (failures.length > 0) {
  console.error(`[tracksheet-invariants] ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`[tracksheet-invariants] OK — ${files.length} files scanned, 4 invariants hold.`);
