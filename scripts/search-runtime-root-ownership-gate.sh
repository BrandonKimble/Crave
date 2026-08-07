#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job search-runtime-contract-tests,
#     enforced slice S7).
#
# F7201/D114 (2026-08-07): the six index.tsx hook BUDGETS are retired (their
# history is in `retiredChecks` in the rules file — five of the six were slack
# on the day they were written and never once capable of failing). The
# concentration law they encoded now lives in the `max_per_file_in_tree` kind
# below, aimed at the TREE with the quantity as a MAXIMUM OVER FILES, and it
# carries a two-part non-zero witness so an evaporated subject goes RED. The 16
# absence checks and the submit-hook bans are UNCHANGED — maxCount 0 on a named
# killed symbol is the delete-gate's blessed negative class and ages well.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SLICE_ID="${1:-}"
# F1654 (2026-08-04): the rules moved from plans/perf-baselines/ to sit NEXT TO this
# runner. A gate reaching up out of scripts/ into a plans/ directory for its truth is what
# let the rules and the tree rot apart unnoticed (9 of 22 declared paths were dead, 5 of
# 10 slices exiting 1 where nobody looked). Rule DATA is part of the gate.
RULES_PATH="${2:-$REPO_ROOT/scripts/search-runtime-root-ownership-gates.json}"

# F2510: NO ARGUMENT RUNS EVERY ENFORCED SLICE.
#
# `enforcedSliceIds` declared five (S7, S8, S9B, S9C, S11) and CI invoked ONE
# (`... gate.sh S7`), so four slices were declared enforced and run by nothing —
# the field named the intent and a separate CI line decided the reality. The
# rule DATA already lives beside this runner (F1654); now it also decides what
# runs, so adding a slice to the list is the whole act of enforcing it.
if [[ -z "$SLICE_ID" ]]; then
  SLICES_RAW="$(
    node -e '
      const r = require(process.argv[1]);
      const ids = Array.isArray(r.enforcedSliceIds) ? r.enforcedSliceIds : [];
      if (ids.length === 0) { process.exit(3); }
      for (const id of ids) console.log(id);
    ' "$RULES_PATH"
  )" || {
    echo "[root-ownership-gate] enforcedSliceIds is empty or unreadable — a gate with nothing to run reports success, so this is a failure." >&2
    exit 1
  }
  ALL_SLICES=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && ALL_SLICES+=("$line")
  done <<< "$SLICES_RAW"
  if [[ ${#ALL_SLICES[@]} -eq 0 ]]; then
    echo "[root-ownership-gate] no enforced slices resolved — refusing to report success." >&2
    exit 1
  fi
  status=0
  for slice in "${ALL_SLICES[@]}"; do
    echo "[root-ownership-gate] slice $slice"
    bash "${BASH_SOURCE[0]}" "$slice" "$RULES_PATH" || status=1
  done
  exit "$status"
fi

if [[ ! -f "$RULES_PATH" ]]; then
  echo "[root-ownership-gate] Rules file not found: $RULES_PATH" >&2
  exit 1
fi

node - "$SLICE_ID" "$RULES_PATH" "$REPO_ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');

const sliceId = process.argv[2];
const rulesPath = process.argv[3];
const repoRoot = process.argv[4];
const outputPath = process.env.SEARCH_RUNTIME_ROOT_OWNERSHIP_GATE_SUMMARY_PATH || '';

const fail = (message) => {
  // A gate's failure is READ BY A HUMAN under time pressure. A v8 stack trace
  // buries the sentence that says what to do; print the sentence.
  console.error(`[root-ownership-gate] ${message}`);
  process.exit(1);
};

const safeInteger = (value) => (Number.isInteger(value) ? value : null);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readJson = (jsonPath) => JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const lineNumberAt = (contents, index) => {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (contents.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
};

const summarize = (summary) => {
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    process.stdout.write(`[root-ownership-gate] Summary: ${outputPath}\n`);
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
};

let rules;
try {
  rules = readJson(rulesPath);
} catch (error) {
  fail(
    `Unable to parse root ownership rules at ${rulesPath}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

if (rules?.schemaVersion !== 'runtime-root-ownership-gates.v1') {
  fail(
    `Unsupported schemaVersion in ${rulesPath}: expected runtime-root-ownership-gates.v1, got ${String(
      rules?.schemaVersion
    )}`
  );
}

const enforcedSlices = new Set(
  (Array.isArray(rules?.enforcedSliceIds) ? rules.enforcedSliceIds : [])
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

if (!enforcedSlices.has(sliceId)) {
  // F2510: this used to report `pass: true` and exit 0. A slice id that is not
  // enforced is a MISINVOCATION — a typo in CI, or a slice deleted from the
  // rules while its invocation lived on — and answering "pass" to a question
  // never asked is the exact shape this audit keeps finding. `S6` no longer
  // exists in the rules and returned green.
  fail(
    `slice ${sliceId} is not in enforcedSliceIds (${[...enforcedSlices].join(', ') || 'none'}). ` +
      `Nothing was checked. Add it to the rules, or fix the caller — a gate ` +
      `cannot pass a check it did not run.`
  );
}

const sliceChecks = rules?.slices?.[sliceId];
if (!Array.isArray(sliceChecks) || sliceChecks.length === 0) {
  fail(`No root ownership checks configured for enforced slice ${sliceId}.`);
}

// F7201/D114: glob -> RegExp for excludeGlobs. Deliberately small — `**/` and
// `*` are the only wildcards the rules use, and a matcher that quietly accepts
// syntax it does not implement is how an exclusion silently stops excluding.
const globToRegExp = (glob) => {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 2;
      continue;
    }
    const ch = glob[i];
    out += ch === '*' ? '[^/]*' : escapeRegExp(ch);
  }
  return new RegExp(`^${out}$`);
};

const listFilesRecursive = (dir) => {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
};

const failures = [];
const checks = [];

for (const check of sliceChecks) {
  const id = typeof check?.id === 'string' ? check.id : 'unknown_check';
  const kind = typeof check?.kind === 'string' ? check.kind : 'pattern_count';
  const relPath = typeof check?.path === 'string' ? check.path : null;
  const patternSource = typeof check?.pattern === 'string' ? check.pattern : null;
  const maxCount = safeInteger(check?.maxCount);
  const description = typeof check?.description === 'string' ? check.description : '';

  // F7201/D114 (2026-08-07): THE CONCENTRATION LAW NAMES A TREE, NOT A FILE.
  //
  // The six budget checks this kind replaces were born at 034ad4adc against a
  // 6,211-line screens/Search/index.tsx holding 71 effects. The law they
  // encoded — no single module may own the search runtime's state — WON: that
  // root is 87 lines with 0 effects, and screens/Search/runtime/ is 615 files.
  // But the checks had been derived from the INCIDENT rather than from the
  // invariant, so relocation silently emptied them: three of the six were
  // already ABOVE the actual on the day they were committed (101 and 97
  // against 71; 238 and 228 against 114), and the famous 101 -> 97 -> 70
  // descent was a ceiling drawn above the ceiling, never once capable of
  // failing.
  //
  // The subject is the TREE and the quantity is a MAXIMUM OVER FILES, so a
  // failure can name its own culprit — the argmax file, not a slice id.
  //
  // THE TWO-PART NON-ZERO WITNESS (generalizing F2510 and the closing line of
  // check-search-runtime-hook-names.mjs, "Zero files scanned is a FAILURE,
  // never a pass"): this check must scan at least one file (else the dir
  // moved) AND observe at least one non-zero count (else the subject evaporated
  // — which is PRECISELY how the six retired budgets reported a perfect score
  // for months). A gate whose subject has evaporated goes RED, not green.
  //
  // Budgets carry ZERO HEADROOM by construction: they are the measured actual.
  // This WILL red on legitimate growth. That is what a ratchet is; the honest
  // response is to raise it in the same commit with the reason recorded, which
  // is a review conversation the retired shape could never trigger.
  if (kind === 'max_per_file_in_tree') {
    const relDir = typeof check?.dir === 'string' ? check.dir : null;
    const maxPerFile = safeInteger(check?.maxPerFile);
    const excludeGlobs = Array.isArray(check?.excludeGlobs)
      ? check.excludeGlobs.filter((entry) => typeof entry === 'string')
      : [];
    const push = (extra) =>
      checks.push({ id, kind, dir: relDir, pattern: patternSource, maxPerFile, ...extra });

    if (!relDir) {
      failures.push(`Check ${id} missing dir.`);
      push({ pass: false, error: 'missing dir' });
      continue;
    }
    if (!patternSource) {
      failures.push(`Check ${id} missing pattern.`);
      push({ pass: false, error: 'missing pattern' });
      continue;
    }
    if (maxPerFile == null || maxPerFile < 0) {
      failures.push(`Check ${id} has invalid maxPerFile.`);
      push({ pass: false, error: 'invalid maxPerFile' });
      continue;
    }

    const absoluteDir = path.isAbsolute(relDir) ? relDir : path.join(repoRoot, relDir);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
      failures.push(
        `Check ${id} dir does not exist: ${relDir}. The tree this law is about has moved; ` +
          `re-aim the check rather than deleting it.`
      );
      push({ pass: false, error: 'dir missing' });
      continue;
    }

    let treePattern;
    try {
      treePattern = new RegExp(patternSource, 'gm');
    } catch (error) {
      failures.push(`Check ${id} has invalid pattern: ${patternSource}`);
      push({ pass: false, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const excludeMatchers = excludeGlobs.map(globToRegExp);
    let filesScanned = 0;
    let nonZeroFiles = 0;
    let argmaxFile = null;
    let argmaxCount = 0;
    const overBudget = [];

    for (const absoluteFile of listFilesRecursive(absoluteDir)) {
      const relFile = path.relative(repoRoot, absoluteFile);
      const relToDir = path.relative(absoluteDir, absoluteFile);
      if (excludeMatchers.some((matcher) => matcher.test(relToDir) || matcher.test(relFile))) {
        continue;
      }
      filesScanned += 1;
      treePattern.lastIndex = 0;
      const count = (fs.readFileSync(absoluteFile, 'utf8').match(treePattern) ?? []).length;
      if (count > 0) {
        nonZeroFiles += 1;
      }
      if (count > argmaxCount) {
        argmaxCount = count;
        argmaxFile = relFile;
      }
      if (count > maxPerFile) {
        overBudget.push({ file: relFile, count });
      }
    }

    if (filesScanned === 0) {
      failures.push(
        `Check ${id} scanned ZERO files under ${relDir} — the subject moved, and a gate with ` +
          `nothing to measure cannot report a pass.`
      );
      push({ pass: false, filesScanned, nonZeroFiles, error: 'zero files scanned' });
      continue;
    }
    if (nonZeroFiles === 0) {
      failures.push(
        `Check ${id} observed ZERO matches of /${patternSource}/ across ${filesScanned} files ` +
          `under ${relDir} — the subject of this concentration law has evaporated. That is the ` +
          `exact failure mode this kind was built to make visible; re-aim the check.`
      );
      push({ pass: false, filesScanned, nonZeroFiles, error: 'zero non-zero counts' });
      continue;
    }

    const pass = overBudget.length === 0;
    if (!pass) {
      overBudget.sort((a, b) => b.count - a.count);
      failures.push(
        `Check ${id} exceeded maxPerFile (${overBudget[0].count} > ${maxPerFile}) in ` +
          `${overBudget[0].file}${
            overBudget.length > 1 ? ` (and ${overBudget.length - 1} more file(s))` : ''
          }${description ? `: ${description}` : ''}.`
      );
    }
    push({
      pass,
      excludeGlobs,
      filesScanned,
      nonZeroFiles,
      argmaxFile,
      argmaxCount,
      overBudget: overBudget.slice(0, 10),
      description,
    });
    continue;
  }

  if (!relPath) {
    failures.push(`Check ${id} missing path.`);
    checks.push({ id, kind, pass: false, error: 'missing path' });
    continue;
  }

  const absolutePath = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Check ${id} path does not exist: ${relPath}`);
    checks.push({
      id,
      kind,
      pass: false,
      path: relPath,
      pattern: patternSource,
      maxCount,
      error: 'path missing',
    });
    continue;
  }

  if (kind === 'path_exists') {
    checks.push({
      id,
      kind,
      path: relPath,
      pass: true,
      description,
    });
    continue;
  }

  const contents = fs.readFileSync(absolutePath, 'utf8');

  if (kind === 'function_declaration_absent') {
    const functionNames = Array.isArray(check?.functionNames)
      ? check.functionNames
          .filter((entry) => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
    const effectiveMaxCount = maxCount == null ? 0 : maxCount;
    if (functionNames.length === 0) {
      failures.push(`Check ${id} missing functionNames.`);
      checks.push({
        id,
        kind,
        pass: false,
        path: relPath,
        maxCount: effectiveMaxCount,
        error: 'missing functionNames',
      });
      continue;
    }
    if (effectiveMaxCount < 0) {
      failures.push(`Check ${id} has invalid maxCount.`);
      checks.push({
        id,
        kind,
        pass: false,
        path: relPath,
        functionNames,
        maxCount: effectiveMaxCount,
        error: 'invalid maxCount',
      });
      continue;
    }
    const matchesByFunction = {};
    const sampleLines = [];
    let count = 0;
    for (const functionName of functionNames) {
      const declarationPattern = new RegExp(
        `(^|\\n)\\s*(?:const|let|var|function)\\s+${escapeRegExp(functionName)}\\b`,
        'g'
      );
      const lines = [];
      for (const match of contents.matchAll(declarationPattern)) {
        const matchIndex = typeof match.index === 'number' ? match.index : -1;
        if (matchIndex < 0) {
          continue;
        }
        const offset = typeof match[1] === 'string' ? match[1].length : 0;
        const declarationIndex = matchIndex + offset;
        const declarationLine = lineNumberAt(contents, declarationIndex);
        lines.push(declarationLine);
        sampleLines.push(`${functionName}@${declarationLine}`);
      }
      matchesByFunction[functionName] = lines;
      count += lines.length;
    }
    const pass = count <= effectiveMaxCount;
    if (!pass) {
      failures.push(
        `Check ${id} exceeded maxCount (${count} > ${effectiveMaxCount}) at ${relPath}${
          description ? `: ${description}` : ''
        }.`
      );
    }
    checks.push({
      id,
      kind,
      path: relPath,
      functionNames,
      maxCount: effectiveMaxCount,
      count,
      pass,
      matchesByFunction,
      sampleLines: sampleLines.slice(0, 20),
      description,
    });
    continue;
  }

  if (kind !== 'pattern_count') {
    failures.push(`Check ${id} has unsupported kind: ${kind}`);
    checks.push({
      id,
      kind,
      pass: false,
      path: relPath,
      error: `unsupported kind: ${kind}`,
    });
    continue;
  }

  if (!patternSource) {
    failures.push(`Check ${id} missing pattern.`);
    checks.push({ id, kind, pass: false, path: relPath, error: 'missing pattern' });
    continue;
  }
  if (maxCount == null || maxCount < 0) {
    failures.push(`Check ${id} has invalid maxCount.`);
    checks.push({
      id,
      kind,
      pass: false,
      path: relPath,
      pattern: patternSource,
      error: 'invalid maxCount',
    });
    continue;
  }

  let pattern;
  try {
    pattern = new RegExp(patternSource, 'gm');
  } catch (error) {
    failures.push(`Check ${id} has invalid pattern: ${patternSource}`);
    checks.push({
      id,
      kind,
      pass: false,
      path: relPath,
      pattern: patternSource,
      maxCount,
      error: error instanceof Error ? error.message : String(error),
    });
    continue;
  }

  const matchIndices = [];
  for (const match of contents.matchAll(pattern)) {
    const idx = typeof match.index === 'number' ? match.index : -1;
    if (idx < 0) {
      continue;
    }
    matchIndices.push(lineNumberAt(contents, idx));
  }
  const count = matchIndices.length;
  const pass = count <= maxCount;
  if (!pass) {
    failures.push(
      `Check ${id} exceeded maxCount (${count} > ${maxCount}) at ${relPath}${
        description ? `: ${description}` : ''
      }.`
    );
  }
  checks.push({
    id,
    kind,
    path: relPath,
    pattern: patternSource,
    maxCount,
    count,
    pass,
    sampleLines: matchIndices.slice(0, 10),
    description,
  });
}

const summary = {
  schemaVersion: rules.schemaVersion,
  sliceId,
  enforced: true,
  pass: failures.length === 0,
  checks,
  failures,
};

summarize(summary);

if (failures.length > 0) {
  process.exit(1);
}
NODE
