import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Find every file that imports a symbol, across ALL of src.
 *
 * WHY THIS IS SHARED (red team 2026-08-02). Guard scanners in this codebase
 * kept being scoped to "the files I happened to think of", and that is exactly
 * how the invariants they protect got breached:
 *
 *   - The photo seam's first guard grepped ONE controller and missed a second
 *     consumer (the list-tile gallery) that read photos unfiltered.
 *   - Its replacement hard-coded TWO files, so a third consumer was invisible
 *     in the identical way.
 *
 * An allow-list over the WHOLE tree cannot be outflanked by a new file, which
 * is the property a containment guard actually needs. The Gemini gateway
 * lockdown already worked this way and is the template.
 *
 * Import-based, not usage-based: referencing the module at all is the thing to
 * forbid, and unlike a `this.foo.` grep it cannot be evaded by renaming a
 * field. That rename evasion was real — a guard searched for `this.reads.`
 * against a controller whose field was named `photoReads`, so it matched
 * nothing and asserted that nothing equals nothing.
 */
export function filesImporting(
  symbol: string,
  options: { root: string; allow?: readonly string[] },
): string[] {
  const offenders: string[] = [];
  const allow = new Set(options.allow ?? []);

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;

      const rel = relative(options.root, full).split('\\').join('/');
      if (allow.has(rel)) continue;

      const source = readFileSync(full, 'utf8');
      // A VALUE import. `import type { X }` cannot be constructed or injected,
      // so it is not a containment breach.
      const imports = new RegExp(
        `import\\s+(?!type\\s)\\{[^}]*\\b${symbol}\\b[^}]*\\}`,
      ).test(source);
      if (imports) offenders.push(rel);
    }
  };

  walk(options.root);
  return offenders.sort();
}
