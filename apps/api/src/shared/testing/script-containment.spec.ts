import { readFileSync } from 'fs';
import { join, relative } from 'path';
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

describe('scripts/ cron containment', () => {
  it('every script that boots a Nest context also stops the crons', () => {
    const escapes = scriptFiles().filter((file) => {
      // codeOnly: a guard was once satisfied by a COMMENT sixteen lines above
      // the missing call. Comments do not contain crons.
      const source = codeOnly(readFileSync(file, 'utf8'));
      if (!source.includes('createApplicationContext')) return false;
      return !source.includes('stopCronsForScript');
    });

    expect(escapes.map(rel)).toEqual([]);
  });

  it('the scan actually sees the scripts that boot Nest (no empty-loop green)', () => {
    // An always-green guard is the disease, not the cure. If this count ever
    // collapses, the scan has lost the tree and the assertion above is lying.
    const booting = scriptFiles().filter((file) =>
      codeOnly(readFileSync(file, 'utf8')).includes('createApplicationContext'),
    );
    expect(booting.length).toBeGreaterThan(30);
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

  it('every script that boots Nest declares its class', () => {
    const undeclared = scriptFiles()
      .filter((file) =>
        codeOnly(readFileSync(file, 'utf8')).includes(
          'createApplicationContext',
        ),
      )
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
