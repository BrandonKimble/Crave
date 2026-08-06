// THE EXPORT-SURFACE LAW, ENFORCED (F1656 stated it; F2506 gives it a mechanism).
//
// index.ts's header states the rule — "a name appears below only when an app imports
// it" — and until now the comment WAS the mechanism. A census found the rule obeyed
// today (78 names, 0 unconsumed) and also found how the previous drift happened: the
// file used to be three `export *` lines, and 37 names accumulated behind them
// unnoticed. A correct rule with a comment as its only enforcer is one refactor away
// from being a false claim.
//
// The public surface is the INTERSECTION of what is exported and what is imported.
// That intersection is computable, so it is computed here rather than asserted.
//
// WHY IT REFUSES TO RUN AGAINST `export *`: a wildcard cannot be enumerated. A test
// that skipped wildcards would keep passing while measuring nothing — exactly the
// always-green instrument this repo keeps finding. The wildcard is the regression,
// so it is the loudest failure.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const INDEX = join(HERE, 'index.ts');

const CONSUMER_ROOTS = [join(REPO_ROOT, 'apps/api/src'), join(REPO_ROOT, 'apps/mobile/src')];

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Every identifier that appears anywhere in the two apps' source. */
function consumerIdentifiers(): Set<string> {
  const seen = new Set<string>();
  for (const root of CONSUMER_ROOTS) {
    for (const file of sourceFiles(root)) {
      for (const tok of readFileSync(file, 'utf8').match(/[A-Za-z_$][\w$]*/g) ?? []) {
        seen.add(tok);
      }
    }
  }
  return seen;
}

/** Names in the explicit `export { … } from '…'` / `export type { … } from '…'` blocks. */
function exportedNames(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

test('index.ts has no `export *` — a wildcard surface cannot be measured', () => {
  const src = readFileSync(INDEX, 'utf8');
  const wildcards = src.split('\n').filter((line) => /^\s*export\s+(type\s+)?\*/.test(line));
  assert.deepEqual(
    wildcards,
    [],
    'index.ts contains `export *`. A barrel makes the package contract accidental — it is ' +
      'how 37 unconsumed names accumulated before F1656 — and it makes the surface test ' +
      'below unable to enumerate anything. List the names explicitly.'
  );
});

test('every name in the public surface reaches a consumer in apps/api or apps/mobile', () => {
  const src = readFileSync(INDEX, 'utf8');
  const names = exportedNames(src);

  // A census that finds nothing must FAIL, not pass: an empty denominator would
  // make this assertion vacuously true forever.
  assert.ok(
    names.length > 0,
    'parsed ZERO exported names from index.ts — the parse is broken and this test covers nothing.'
  );

  const identifiers = consumerIdentifiers();
  assert.ok(
    identifiers.size > 1000,
    'scanned suspiciously few identifiers across the apps — the consumer walk is broken.'
  );

  const unconsumed = names.filter((n) => !identifiers.has(n));
  assert.deepEqual(
    unconsumed,
    [],
    `these exported names reach NO consumer in apps/api/src or apps/mobile/src:\n` +
      unconsumed.map((n) => `  - ${n}`).join('\n') +
      `\n\nAn export nobody imports is an unpaid maintenance promise (index.ts's own rule). ` +
      `Either import it, or drop it from index.ts — internal helpers stay exported in their ` +
      `own module and simply do not come through the barrel.`
  );
});
