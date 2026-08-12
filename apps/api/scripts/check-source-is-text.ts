/**
 * @script-class: probe
 *
 * SOURCE FILES ARE TEXT.
 *
 * A NUL byte typed directly into a string literal compiles and runs perfectly
 * — and makes the FILE binary to every tool that decides by sniffing content.
 * Two files in this repository carried one, both as a dedupe-key separator
 * (`${locale}\0${form}`), and the cost was paid every time anyone went
 * looking: `grep` refuses the file without -a and says so in one line you
 * scroll past, `git diff` prints "Binary files a/x and b/x differ" instead of
 * the change, GitHub renders nothing, and a code review of that line is not
 * possible. A separator that cannot appear in the data is the right idea; the
 * ESCAPE `\0` produces the identical string and keeps the file readable.
 *
 * WHY THIS IS A SCANNER AND NOT A LINT RULE: ESLint parses the file first,
 * and it parses a NUL-bearing file happily — the defect is not in the AST, it
 * is in the BYTES. Nothing in a normal test run reads these files as bytes,
 * which is exactly the "mechanism that can silently die" shape the invariant
 * registry exists for. Registered as `source.files-are-text`.
 *
 * Run: npx ts-node -T scripts/check-source-is-text.ts
 * Exit 0 = every scanned file is text.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(__dirname, '..');
/** Everything a person reads or reviews. Roots, not a file list, so a new
 *  directory is covered the day it is created. */
const ROOTS = ['src', 'scripts', 'test', 'prisma'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'generated']);
/** Source and configuration. Deliberately NOT extension-blind: this tree
 *  legitimately holds binary fixtures (images, .snap blobs), and a scanner
 *  that cries wolf on those gets suppressed, which is how it stops working. */
const EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.sql',
  '.prisma',
  '.yml',
  '.yaml',
];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // an absent root is not a finding; an absent SCAN is (see below)
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      yield path;
    }
  }
}

function main(): number {
  const offenders: Array<{ path: string; line: number }> = [];
  let scanned = 0;

  for (const root of ROOTS) {
    for (const path of walk(join(API_ROOT, root))) {
      scanned += 1;
      const bytes = readFileSync(path);
      const at = bytes.indexOf(0);
      if (at < 0) continue;
      // The line number, so the message points at the character rather than
      // at the file — the whole complaint is that this byte is hard to find.
      const line = bytes.subarray(0, at).toString('utf8').split('\n').length;
      offenders.push({ path: path.slice(API_ROOT.length + 1), line });
    }
  }

  // A scan that inspected nothing passes vacuously, which is the failure this
  // whole registry was built around. Refuse to report success on zero files.
  if (scanned === 0) {
    console.error(
      'check-source-is-text inspected ZERO files — the roots moved. ' +
        'A scanner that scans nothing reports perfect health.',
    );
    return 1;
  }

  if (offenders.length === 0) {
    console.log(`${scanned} files scanned, all text.`);
    return 0;
  }

  console.error(
    `${offenders.length} source file(s) contain a raw NUL byte, which makes ` +
      'them BINARY to grep, git diff and every code review:\n',
  );
  for (const offender of offenders) {
    console.error(`  ${offender.path}:${offender.line}`);
  }
  console.error(
    "\nWrite the escape '\\0' instead of typing the byte. It compiles to the " +
      'identical string and the file stays readable.',
  );
  return 1;
}

process.exit(main());
