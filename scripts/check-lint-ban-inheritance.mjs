#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml ('Static guard: no eslint override silently drops a repo-wide ban').
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
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(REPO_ROOT, 'apps/mobile');

// minimatch lives in apps/mobile's dependency tree; resolve it from there so
// the glob semantics match the ones ESLint itself uses for `files`/`excludedFiles`.
const pkgRequire = createRequire(join(PKG, 'package.json'));
const { minimatch } = pkgRequire('minimatch');

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
 * PROBES — one representative file per override scope that configures a
 * restricted rule.
 *
 * F3708 (2026-08-07): this used to be a hand-maintained list, justified as
 * "adding an override without adding a probe is visible in review." Review is a
 * human, which is the exact standard this mandate rejects — if a caller can
 * still forget, it is convention, not abstraction. The near-miss was already in
 * the tree: the tracksheet `__render__` override was added with no probe, and
 * was harmless ONLY because it happens to configure no restricted rule. Nothing
 * checked that.
 *
 * So the probe set is DERIVED from the config ESLint actually loads: parse
 * `.eslintrc.js`'s `overrides` for every block that configures a rule in
 * RESTRICTED_RULES, and resolve one representative on-disk file from its `files`
 * globs (honouring `excludedFiles`). Then an override that configures a
 * restricted rule is COVERED the moment it exists, and one that does not is
 * correctly ignored. A block whose globs match no file on disk is itself a
 * failure — the same dead-scope defect the stale-target check already names.
 *
 * KNOWN LIMIT (worth stating rather than glossing, per the finding's red-team):
 * this trusts `.eslintrc.js` is the relevant config layer. The root
 * `../../.eslintrc.js` it extends is not walked here; a restricted-rule override
 * added THERE would be missed. The measured config (`--print-config`) each probe
 * is compared against is still the fully-merged one, so a ban lost via the root
 * would still show up on any derived probe — only a NEW root override scope with
 * no mobile-side representative would be invisible.
 */
const isGlob = (p) => /[*?[\]{}]/.test(p);
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Every file under apps/mobile/src, as PKG-relative POSIX paths. */
function listSrcFiles() {
  const out = [];
  const walk = (absDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(relative(PKG, abs).split('\\').join('/'));
    }
  };
  walk(join(PKG, 'src'));
  return out;
}

/**
 * Derive the probe set from the overrides that configure a restricted rule.
 * Returns { probes, failures } — a block that matches no file becomes a failure
 * (dead scope reading as protection), never a silently-dropped probe.
 */
function deriveProbes() {
  const cfg = pkgRequire(join(PKG, '.eslintrc.js'));
  const overrides = Array.isArray(cfg.overrides) ? cfg.overrides : [];
  const srcFiles = listSrcFiles();
  const probes = new Set();
  const failures = [];
  for (const ov of overrides) {
    const rules = ov?.rules ?? {};
    if (!RESTRICTED_RULES.some((r) => r in rules)) continue;
    const files = toArray(ov.files);
    const excluded = toArray(ov.excludedFiles);
    // A literal (non-glob) target that exists is the most stable representative.
    let rep = files.find((f) => !isGlob(f) && existsSync(join(PKG, f)));
    if (!rep) {
      rep = srcFiles.find(
        (f) => files.some((g) => minimatch(f, g)) && !excluded.some((g) => minimatch(f, g))
      );
    }
    if (!rep) {
      failures.push(
        `.eslintrc.js has an override scoped to ${JSON.stringify(files)} that ` +
          `configures a restricted rule but matches NO file on disk — it reads as ` +
          `protection and guards nothing. Fix the globs or delete the block.`
      );
      continue;
    }
    probes.add(rep);
  }
  return { probes: [...probes], failures };
}

const { probes: PROBES, failures: probeDerivationFailures } = deriveProbes();
if (PROBES.length === 0) {
  console.error(
    'FAIL: derived ZERO probe scopes from .eslintrc.js overrides. Either no ' +
      'override configures a restricted rule (the bans were deleted), or the ' +
      'config could not be parsed — a gate with nothing to probe measures nothing.'
  );
  process.exit(1);
}

/**
 * SCOPED FLOORS (F7901/D122 — the gate that covered half its mandate).
 *
 * The single repo-wide BASELINE_FILE cannot carry a SCOPED ban. F2050 was TWO
 * door-lock bans; only one — the native `<Modal>` ban — is repo-wide and thus
 * visible to a plain-util baseline. The other, the SKELETON LAW (no raw
 * `ActivityIndicator` in a panel or in `Button.tsx`), exists ONLY on the panels
 * override. A superset-of-baseline check therefore never required it, so an
 * override could drop the skeleton-law ban and the gate stayed GREEN — the
 * exact class this gate exists to catch, on the exact ban that motivated it
 * (demonstrated live: appending a panels override with `importNames: ['Modal']`
 * left the gate at exit 0 while `--print-config` showed the ActivityIndicator
 * ban gone).
 *
 * The fix is a FROZEN floor: every file in a named scope MUST carry these ban
 * keys, asserted directly rather than derived from a live config a later
 * override could shrink in lockstep (deriving the floor from a panel file would
 * reproduce the same subset-of-what-it-guards hole one level up). Adding a
 * scoped ban means adding its key here — a deliberate, visible act, which is
 * the point; a frozen digest going stale on an intentional ban addition is
 * correct and cheap.
 */
const SCOPED_FLOORS = [
  {
    scope: 'panels + shared Button (THE SKELETON LAW, F2050)',
    rule: 'no-restricted-imports',
    // Representative files that must each carry the scoped bans. Explicit, not
    // globbed, for the same reason PROBES is: adding a scoped file without a
    // probe should be visible in review.
    probes: ['src/overlays/panels/ListDetailPanel.tsx', 'src/components/ui/Button.tsx'],
    // Effective-config ban keys required in every probe above. Both F2050 door
    // locks: the skeleton-law spinner ban AND the native-Modal ban.
    requiredKeys: ['path:react-native:ActivityIndicator', 'path:react-native:Modal'],
  },
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

function printConfigIn(cwd, relPath) {
  const out = execFileSync('npx', ['eslint', '--print-config', relPath], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function printConfig(relPath) {
  return printConfigIn(PKG, relPath);
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

const SCOPED_PROBES = [...new Set(SCOPED_FLOORS.flatMap((f) => f.probes))];

// Missing tooling is a FAILURE, never a pass.
for (const rel of [BASELINE_FILE, ...PROBES, ...SCOPED_PROBES]) {
  if (!existsSync(join(PKG, rel))) {
    console.error(
      `FAIL: probe file ${rel} does not exist. This gate measures nothing ` +
        `until every probe resolves — a missing probe is a silent green.`
    );
    process.exit(1);
  }
}

const baseConfig = printConfig(BASELINE_FILE);
const baseline = new Map(RESTRICTED_RULES.map((r) => [r, banKeys(baseConfig.rules?.[r])]));

const totalBaseline = [...baseline.values()].reduce((n, s) => n + s.size, 0);
if (totalBaseline === 0) {
  console.error(
    'FAIL: the baseline file carries ZERO restricted-rule bans. Either the ' +
      'bans were deleted, or BASELINE_FILE now matches an override — both ' +
      'mean this gate is comparing against nothing.'
  );
  process.exit(1);
}

const failures = [...probeDerivationFailures];

for (const stale of staleOverrideTargets()) {
  failures.push(
    `.eslintrc.js scopes a config block to \`${stale}\`, which does not ` +
      `exist. A block targeting a deleted file protects nothing while reading ` +
      `as protection — delete the entry or fix the path.`
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
          `rule the baseline does not use.`
      );
    }
  }
}

// SCOPED FLOORS: a scoped ban is invisible to the repo-wide baseline, so assert
// it directly against every probe in its scope.
let scopedRequired = 0;
for (const floor of SCOPED_FLOORS) {
  for (const probe of floor.probes) {
    const cfg = printConfig(probe);
    const got = banKeys(cfg.rules?.[floor.rule]);
    const covers = (k) => {
      if (got.has(k)) return true;
      const m = /^path:([^:]+):/.exec(k);
      return m ? got.has(`path:${m[1]}`) : false;
    };
    const missing = floor.requiredKeys.filter((k) => !covers(k));
    if (missing.length) {
      failures.push(
        `${probe}: the scoped floor "${floor.scope}" requires ` +
          `${missing.length} ban(s) that this file's effective \`${floor.rule}\` ` +
          `config does not carry — ${missing.join(', ')}. This ban is SCOPED (it ` +
          `is not in the repo-wide baseline), so the superset check cannot see it; ` +
          `an override that drops it from this scope must red HERE. Restate the ban ` +
          `in the scope's override.`
      );
    }
  }
  scopedRequired += floor.requiredKeys.length;
}

/**
 * ── SEVERITY FLOOR (F9100/F9101) ─────────────────────────────────────────────
 *
 * THE SECOND WAY A RULE STOPS EXISTING. Everything above proves a ban is not
 * silently DROPPED. It says nothing about a ban that is silently DEMOTED — and
 * demotion is the same outcome, because nothing in this repo fails on warnings.
 * `eslint` exits 0 with any number of them; `yarn lint` (turbo) exits 0; the
 * lefthook staged-lint commands exit 0. A safety rule at `warn` is a comment
 * with a severity field.
 *
 * That is exactly how the repo ended up with two standards: the ROOT config held
 * no-floating-promises / no-unsafe-call / no-unused-vars / no-explicit-any at
 * `warn`, apps/api ran `recommendedTypeChecked`, and nothing anywhere compared
 * the two. The split was invisible because no instrument could show RED on it.
 *
 * THE MUTATION THIS MUST CATCH: change any severity below back to 'warn' — in
 * the root `.eslintrc.js` or in a flat config — and this gate must fail. Proven
 * live rather than asserted: demoting `@typescript-eslint/no-floating-promises`
 * to 'warn' at root reds ROOT_FLOOR, and demoting it in
 * packages/shared/eslint.config.mjs reds that package's floor.
 *
 * DECLARED EXCEPTIONS ARE NOT PROBED, DELIBERATELY. apps/mobile and apps/api each
 * restate some of these at `warn` in their OWN config, with a measured count in a
 * comment beside it. Probing them would force either a lie or a permanent RED;
 * the point of this floor is that lax is never the inherited DEFAULT and never
 * silent. When a package burns its count to zero it deletes its restatement and
 * inherits the floor — add it to PACKAGE_FLOORS then.
 */
const SAFETY_SEVERITY_FLOOR = [
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-misused-promises',
  '@typescript-eslint/require-await',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unused-vars',
];

/** The four the ROOT config itself declares — the standard everything inherits. */
const ROOT_FLOOR_RULES = [
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unused-vars',
];

/**
 * Flat-config packages that meet the full floor with no exceptions, and a probe
 * file whose EFFECTIVE config is measured (not the source text) — same standard
 * of evidence as the ban checks above.
 */
const PACKAGE_FLOORS = [
  { pkg: 'packages/shared', probe: 'src/index.ts' },
  { pkg: 'apps/site', probe: 'src/router.ts' },
];

/** 'error' | 'warn' | 'off', from any of eslint's severity spellings. */
function severityOf(entry) {
  const raw = Array.isArray(entry) ? entry[0] : entry;
  if (raw === 2 || raw === 'error') return 'error';
  if (raw === 1 || raw === 'warn') return 'warn';
  if (raw === 0 || raw === 'off') return 'off';
  return undefined;
}

{
  // The root config is read DIRECTLY, not through --print-config on a mobile
  // file: mobile declares its own (documented, counted) severities for these,
  // so a merged view would report mobile's answer and never see a root demotion.
  const rootRules = pkgRequire(join(REPO_ROOT, '.eslintrc.js')).rules ?? {};
  for (const rule of ROOT_FLOOR_RULES) {
    const sev = severityOf(rootRules[rule]);
    if (sev !== 'error') {
      failures.push(
        `.eslintrc.js declares \`${rule}\` at ${sev ?? 'NOTHING'} — the root ` +
          `standard must be 'error'. Nothing in this repo fails on warnings, so a ` +
          `safety rule at 'warn' does not exist; demoting it here quietly relaxes ` +
          `every package that inherits this file.`
      );
    }
  }
}

for (const { pkg, probe } of PACKAGE_FLOORS) {
  const abs = join(REPO_ROOT, pkg, probe);
  if (!existsSync(abs)) {
    failures.push(
      `FAIL: severity-floor probe ${pkg}/${probe} does not exist. A missing probe ` +
        `is a silent green — repoint it at a real source file in that package.`
    );
    continue;
  }
  const cfg = printConfigIn(join(REPO_ROOT, pkg), probe);
  for (const rule of SAFETY_SEVERITY_FLOOR) {
    const sev = severityOf(cfg.rules?.[rule]);
    if (sev !== 'error') {
      failures.push(
        `${pkg}/${probe}: \`${rule}\` is ${sev ?? 'NOT CONFIGURED'} in this file's ` +
          `effective config — the floor is 'error'. This package carries no declared ` +
          `exception, so either restore the severity or move the package to a ` +
          `documented, COUNTED exception the way apps/mobile does.`
      );
    }
  }
}

if (failures.length) {
  console.error('lint-ban-inheritance FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `lint-ban-inheritance OK — ${PROBES.length} override scopes each carry all ` +
    `${totalBaseline} baseline ban(s); ${SCOPED_FLOORS.length} scoped floor(s) ` +
    `assert ${scopedRequired} additional scoped ban(s) over ${SCOPED_PROBES.length} probe(s); ` +
    `the severity floor holds ${ROOT_FLOOR_RULES.length} root rule(s) at error and ` +
    `${SAFETY_SEVERITY_FLOOR.length} rule(s) across ${PACKAGE_FLOORS.length} flat-config package(s).`
);
