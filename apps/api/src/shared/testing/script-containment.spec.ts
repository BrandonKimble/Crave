import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { codeOnly } from './code-only';
import { collectSourceFiles } from './import-scan';

/**
 * SCRIPT CONTAINMENT IS A PROPERTY OF THE TREE, NOT OF THE AUTHOR'S MEMORY.
 *
 * THE HAZARD (stop-crons.ts states it precisely). Every
 * `NestFactory.createApplicationContext(AppModule)` boots the FULL module
 * graph, which registers all ~20 `@Cron` jobs and starts them ticking —
 * `PROCESS_ROLE` defaults to `'all'`, so `isSchedulerRuntime()` is true. A
 * long-running script then runs the hourly crons IN ADDITION to the real
 * worker: double-drained governed queues and double-spent vendor pools.
 *
 * The remedy — call `stopCronsForScript(app)` by hand — closes the hazard only
 * for whoever remembers. 45 of 46 scripts remembered;
 * `scripts/archive/batch-slice-test.ts` did not, and nothing noticed, because
 * nothing was looking (audit 2026-08-02, F411).
 *
 * This is the `filesImporting()` lesson applied one directory over: a guard
 * scoped to "the files I happened to think of" is outflanked by the next file
 * someone adds, so the scan walks the WHOLE tree and the exceptions are named.
 *
 * F414 rides along: a script is one of exactly three things, and it must SAY
 * which in its own header. Until this spec existed, the only way to learn
 * whether a script was live tooling or a spent probe was a repo-wide grep —
 * which is why a 100-file census had to be run at all.
 */

const SCRIPTS_ROOT = join(__dirname, '..', '..', '..', 'scripts');

const scriptFiles = (): string[] =>
  collectSourceFiles(SCRIPTS_ROOT).filter((f) => !f.endsWith('.d.ts'));

const rel = (f: string): string =>
  relative(SCRIPTS_ROOT, f).split('\\').join('/');

/**
 * THE BOUNDARY WAS THE DEFECT (audit 2026-08-03, F1252).
 *
 * The first version of this lockdown asked a FILE-LOCAL question: does this
 * file's text contain `createApplicationContext`? 21 search-harness scripts
 * boot the full Nest graph through `bootstrap()` imported from `_shared.ts`,
 * so none of them contains the literal and none of them was seen — by exactly
 * the disease the docstring above names. A guard scoped to "the files that
 * spell a particular string" is outflanked by the next file that calls a
 * helper. The cron hazard happened to be closed for those 21 only because
 * `_shared.bootstrap()` calls `stopCronsForScript` — luck of construction,
 * not a rule; nothing makes tomorrow's `_shared2.ts` do the same.
 *
 * "This script boots Nest" is a property of the module GRAPH. So the scan
 * resolves each file's transitive local imports and asks the question of the
 * CLOSURE. Comments are stripped at every hop (`codeOnly`) — the walk follows
 * real imports, and a mention of the literal in prose proves nothing.
 */
const sourceCache = new Map<string, string>();
const readCode = (file: string): string => {
  const hit = sourceCache.get(file);
  if (hit !== undefined) return hit;
  const code = codeOnly(readFileSync(file, 'utf8'));
  sourceCache.set(file, code);
  return code;
};

/** Local (relative) imports of `file`, resolved to real .ts paths. */
const localImports = (file: string): string[] => {
  const out: string[] = [];
  for (const m of readCode(file).matchAll(
    /(?:from|require\()\s*['"](\.[^'"]+)['"]/g,
  )) {
    const base = resolve(dirname(file), m[1]);
    for (const cand of [`${base}.ts`, join(base, 'index.ts'), base]) {
      if (cand.endsWith('.ts') && existsSync(cand)) {
        out.push(cand);
        break;
      }
    }
  }
  return out;
};

/**
 * Does `file`'s import closure contain `needle`? Memoised, cycle-safe.
 * Walks OUT of scripts/ too (a boot helper could live in src/ tomorrow —
 * a closure that stops at a directory boundary is the same defect again).
 */
const closureContains = (() => {
  const memo = new Map<string, boolean>();
  return (file: string, needle: string): boolean => {
    const key = `${needle}\u0000${file}`;
    const walk = (f: string, seen: Set<string>): boolean => {
      const k = `${needle}\u0000${f}`;
      const hit = memo.get(k);
      if (hit !== undefined) return hit;
      if (seen.has(f)) return false; // cycle: this branch adds nothing
      seen.add(f);
      let found = readCode(f).includes(needle);
      if (!found) {
        for (const dep of localImports(f)) {
          if (walk(dep, seen)) {
            found = true;
            break;
          }
        }
      }
      // Only a POSITIVE is safe to memoise across walks: a negative reached
      // inside a cycle is provisional (`seen` cut the branch short).
      if (found) memo.set(k, true);
      return found;
    };
    const answer = walk(file, new Set());
    if (answer) memo.set(key, true);
    return answer;
  };
})();

const bootsNest = (file: string): boolean =>
  closureContains(file, 'createApplicationContext');

/**
 * The files an operator RUNS: a script under scripts/ that no other script
 * imports. Helpers (`_shared.ts`, `lib/*`) are closure members, not entry
 * points, and the class header was only ever useful on the thing you run.
 */
const entryPoints = (): string[] => {
  const files = scriptFiles();
  const imported = new Set<string>();
  for (const f of files) for (const dep of localImports(f)) imported.add(dep);
  return files.filter((f) => !imported.has(f));
};

describe('scripts/ cron containment', () => {
  it('every script whose CLOSURE boots a Nest context also stops the crons', () => {
    // codeOnly: a guard was once satisfied by a COMMENT sixteen lines above
    // the missing call. Comments do not contain crons.
    const escapes = scriptFiles().filter(
      (file) => bootsNest(file) && !closureContains(file, 'stopCronsForScript'),
    );

    expect(escapes.map(rel)).toEqual([]);
  });

  it('the closure scan sees MORE than the flat text scan (no regression to file-local)', () => {
    // The instrument that would have caught F1252. If someone reverts the
    // walker to a per-file `includes()`, these two numbers converge and this
    // fails loudly instead of the suite going quietly green over 21 blind
    // spots.
    const files = scriptFiles();
    const flat = files.filter((f) =>
      readCode(f).includes('createApplicationContext'),
    ).length;
    const closure = files.filter(bootsNest).length;

    expect(closure).toBeGreaterThan(flat);
  });

  it('the scan actually sees the scripts that boot Nest (no empty-loop green)', () => {
    // An always-green guard is the disease, not the cure. If this count ever
    // collapses, the scan has lost the tree and the assertions above are lying.
    expect(scriptFiles().filter(bootsNest).length).toBeGreaterThan(60);
  });
});

/**
 * THE THREE CLASSES A SCRIPT CAN BE (F414). Declared as `@script-class: <c>`
 * in the file's own header, on its own line:
 *
 *   operational — invoked by a runner (package.json, scripts/rig/*.sh, a
 *                 .claude skill). The header names the runner.
 *   probe       — a banked probe: its value is the RECORDED FINDING, kept so
 *                 the finding stays reproducible. The header names the finding.
 *   scratch     — valuable for a day. Lives in scripts/scratch/ (gitignored);
 *                 a committed `scratch` is itself the signal to delete it.
 *
 * The tsconfig exclusion of `scripts/search-harness/rt-*.ts` ("red-team /
 * exploratory harnesses: throwaway by convention") shows the convention was
 * already FELT. It was just never made operational, and it stopped at one
 * glob. This makes the class a fact the tree carries, so a deletion sweep is
 * mechanical instead of a judgement call per file.
 */
const SCRIPT_CLASSES = ['operational', 'probe', 'scratch'];

describe('scripts/ class headers', () => {
  const classOf = (file: string): string | null => {
    const head = readFileSync(file, 'utf8').slice(0, 4000);
    const m = /@script-class:\s*([a-z]+)/.exec(head);
    return m ? m[1] : null;
  };

  it('every ENTRY POINT whose closure boots Nest declares its class', () => {
    // Entry point, not "file containing a string" (F1252). The header answers
    // "what is this thing and should it still exist?", which is a question
    // about the thing an operator runs.
    const undeclared = entryPoints()
      .filter(bootsNest)
      .filter((file) => classOf(file) === null);

    expect(undeclared.map(rel)).toEqual([]);
  });

  it('every declared class is one of the three', () => {
    const bogus = scriptFiles()
      .map((file) => ({ file, cls: classOf(file) }))
      .filter(({ cls }) => cls !== null && !SCRIPT_CLASSES.includes(cls))
      .map(({ file, cls }) => `${rel(file)}: ${cls}`);

    expect(bogus).toEqual([]);
  });
});
