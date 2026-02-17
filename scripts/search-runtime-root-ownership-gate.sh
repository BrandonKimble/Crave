#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SLICE_ID="${1:-}"
RULES_PATH="${2:-$REPO_ROOT/plans/perf-baselines/runtime-root-ownership-gates.json}"

if [[ -z "$SLICE_ID" ]]; then
  echo "Usage: scripts/search-runtime-root-ownership-gate.sh <slice_id> [rules_json_path]" >&2
  exit 1
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
  throw new Error(message);
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
  summarize({
    schemaVersion: rules.schemaVersion,
    sliceId,
    enforced: false,
    pass: true,
    checks: [],
    failures: [],
    reason: `slice ${sliceId} is outside root ownership gate enforcement.`,
  });
  process.exit(0);
}

const sliceChecks = rules?.slices?.[sliceId];
if (!Array.isArray(sliceChecks) || sliceChecks.length === 0) {
  fail(`No root ownership checks configured for enforced slice ${sliceId}.`);
}

const failures = [];
const checks = [];

for (const check of sliceChecks) {
  const id = typeof check?.id === 'string' ? check.id : 'unknown_check';
  const kind = typeof check?.kind === 'string' ? check.kind : 'pattern_count';
  const relPath = typeof check?.path === 'string' ? check.path : null;
  const patternSource = typeof check?.pattern === 'string' ? check.pattern : null;
  const maxCount = safeInteger(check?.maxCount);
  const description = typeof check?.description === 'string' ? check.description : '';

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
