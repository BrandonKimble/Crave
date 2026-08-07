#!/usr/bin/env node
/**
 * GATE: an eslint override may not silently drop a repo-wide ban.
 *
 * THE INCIDENT (F2050, apps/mobile). ESLint REPLACES a rule's options when a
 * later config block configures the same rule — it never merges them. Two
 * "door lock" bans were written as `no-restricted-syntax` at the top level: no
 * raw `ActivityIndicator` in panels (the SKELETON LAW) and no native `<Modal>`
 * anywhere in src. A later override configured `no-restricted-syntax` for its
 * own purpose, and both locks silently ceased to exist — while the comments
 * above them still read "Banned at the import so a new spinner is a lint error
 * that names the file" and "the door lock". Nothing failed. The bans were
 * simply gone, and stayed gone until someone happened to read the merged
 * config.
 *
 * WHY A GATE AND NOT JUST A FIX. Moving the bans to a rule nobody else owned
 * fixed those two. It did not make the next one impossible: the override that
 * now carries them had to RESTATE the base ban to keep it, so a new repo-wide
 * ban added tomorrow is silently absent from every file the override matches.
 * A rule you have to remember to restate is a convention, not a guarantee.
 *
 * WHAT THIS PROVES. For every restricted-* rule, the effective config of every
 * override-matched file must be a SUPERSET of the base config's entries. An
 * override may ADD bans; it may never LOSE one. The check reads the config
 * ESLint itself computes (`eslint --print-config`), not the source text, so it
 * measures the merged result rather than the intent.
 *
 * WHAT IT CANNOT DO. It compares entries by their identifying key (import name
 * + imported members, or selector text). It does not judge whether a ban is
 * the RIGHT ban — only that no file quietly has fewer than the baseline.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(REPO_ROOT, 'apps/mobile');

/** Rules whose options are a SET of bans that an override must not shrink. */
const RESTRICTED_RULES = [
  'no-restricted-imports',
  'no-restricted-syntax',
  '@typescript-eslint/no-restricted-imports',
];

/**
 * A file matching NO override, establishing the baseline every other file must
 * meet or exceed. Chosen deliberately: a plain util, not a panel, not a screen.
 */
const BASELINE_FILE = 'src/utils/user-display-name.ts';

/**
 * Representative files, one per override scope that configures a restricted
 * rule. Keeping this list explicit (rather than globbing) means adding an
 * override without adding a probe is itself visible in review.
 */
const PROBES = [
  'src/overlays/panels/ListDetailPanel.tsx',
  'src/components/ui/Button.tsx',
  'src/screens/Search/utils/quality.ts',
  'src/screens/Search/utils/marker-lod.ts',
  'src/utils/quality-color.ts',
  // F7200/D114: the search-dismiss motion plane's dependency-rule override.
  'src/screens/Search/runtime/shared/use-search-dismiss-motion-plane-runtime.ts',
];

/**
 * Every literal (non-glob) path an override names must still exist. A config
 * block scoped to a deleted file is dead weight that reads as live protection
 * — and it is how a probe list silently stops covering anything. Found on the
 * first run of this gate: the override still named
 * `src/screens/Search/utils/map-render-model.ts`, deleted with the map work.
 */
function staleOverrideTargets() {
  const src = readFileSync(join(PKG, '.eslintrc.js'), 'utf8');
  const stale = [];
  for (const m of src.matchAll(/'(src\/[^'*]+\.(?:ts|tsx|js|jsx))'/g)) {
    if (!existsSync(join(PKG, m[1]))) stale.push(m[1]);
  }
  return [...new Set(stale)];
}

function printConfig(relPath) {
  const out = execFileSync(
    'npx',
    ['eslint', '--print-config', relPath],
    { cwd: PKG, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

/** The identifying key of one ban entry, stable across formatting. */
function banKeys(ruleEntry) {
  if (!ruleEntry) return new Set();
  const opts = Array.isArray(ruleEntry) ? ruleEntry.slice(1) : [];
  const keys = new Set();
  for (const opt of opts) {
    if (typeof opt === 'string') {
      keys.add(`selector:${opt}`);
      continue;
    }
    if (!opt || typeof opt !== 'object') continue;
    if (opt.selector) keys.add(`selector:${opt.selector}`);
    for (const p of opt.paths ?? []) {
      // ONE KEY PER BANNED MEMBER. Combining a path's importNames into a
      // single key would make `{Modal, ActivityIndicator}` a different ban
      // from `{Modal}` — so an override that ADDS a ban would read as having
      // LOST the baseline one. The subset test only means anything if each
      // banned member is its own element.
      const names = p.importNames ?? [];
      if (names.length === 0) {
        keys.add(`path:${p.name}`);
      } else {
        for (const n of names) keys.add(`path:${p.name}:${n}`);
      }
    }
    for (const p of opt.patterns ?? []) {
      keys.add(`pattern:${typeof p === 'string' ? p : JSON.stringify(p.group ?? p)}`);
    }
  }
  return keys;
}

// Missing tooling is a FAILURE, never a pass.
for (const rel of [BASELINE_FILE, ...PROBES]) {
  if (!existsSync(join(PKG, rel))) {
    console.error(
      `FAIL: probe file ${rel} does not exist. This gate measures nothing ` +
        `until every probe resolves — a missing probe is a silent green.`,
    );
    process.exit(1);
  }
}

const baseConfig = printConfig(BASELINE_FILE);
const baseline = new Map(
  RESTRICTED_RULES.map((r) => [r, banKeys(baseConfig.rules?.[r])]),
);

const totalBaseline = [...baseline.values()].reduce((n, s) => n + s.size, 0);
if (totalBaseline === 0) {
  console.error(
    'FAIL: the baseline file carries ZERO restricted-rule bans. Either the ' +
      'bans were deleted, or BASELINE_FILE now matches an override — both ' +
      'mean this gate is comparing against nothing.',
  );
  process.exit(1);
}

const failures = [];

for (const stale of staleOverrideTargets()) {
  failures.push(
    `.eslintrc.js scopes a config block to \`${stale}\`, which does not ` +
      `exist. A block targeting a deleted file protects nothing while reading ` +
      `as protection — delete the entry or fix the path.`,
  );
}

for (const probe of PROBES) {
  const cfg = printConfig(probe);
  for (const rule of RESTRICTED_RULES) {
    const base = baseline.get(rule);
    if (!base?.size) continue;
    const got = banKeys(cfg.rules?.[rule]);
    // A WHOLE-MODULE ban subsumes a member ban. The pure-logic utils forbid
    // `react-native` outright, which is strictly stronger than the baseline's
    // "no Modal from react-native" — counting that as a LOSS would push the
    // config toward weaker, more literal bans just to satisfy the gate.
    const covers = (k) => {
      if (got.has(k)) return true;
      const m = /^path:([^:]+):/.exec(k);
      return m ? got.has(`path:${m[1]}`) : false;
    };
    const lost = [...base].filter((k) => !covers(k));
    if (lost.length) {
      failures.push(
        `${probe}: an override drops ${lost.length} baseline ban(s) from ` +
          `\`${rule}\` — ${lost.join(', ')}. ESLint REPLACES rule options, it ` +
          `does not merge them, so this ban does not exist for this file. ` +
          `Restate it in the override, or move the override's own entries to a ` +
          `rule the baseline does not use.`,
      );
    }
  }
}

if (failures.length) {
  console.error(
    'lint-ban-inheritance FAILED:\n' +
      failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `lint-ban-inheritance OK — ${PROBES.length} override scopes each carry all ` +
    `${totalBaseline} baseline ban(s).`,
);
