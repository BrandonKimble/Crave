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
 * SCOPE HONESTY (F-infra, 2026-08-11). This scanner used to walk four
 * directories under apps/api and match ELEVEN extensions, while calling itself
 * `source.files-are-text`. Everything else passed by not being looked at: a
 * NUL in any .sh, any .txt, the mobile app's .tsx/.swift, the site, the
 * repo-root scripts — all invisible, and the registry entry read as though the
 * repository were covered. The scope is the REPOSITORY now, enumerated by
 * `git ls-files` (tracked + not-yet-added, minus ignored) — the strongest
 * option that is also the FASTEST one: it is the exact set a person can
 * review (build output and node_modules are ignored, so no directory
 * skip-list can rot), and it costs one process instead of a recursive stat
 * walk. Measured: 3,257 files in 0.7s wall, ts-node startup included. Inclusion is by DENYLIST — the
 * few genuinely-binary tracked extensions below — so a new language or config
 * format is covered the day someone commits it, rather than the day someone
 * remembers to add its extension here.
 *
 * Run: npx ts-node -T scripts/check-source-is-text.ts
 * Exit 0 = every scanned file is text.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/**
 * The ONLY files exempt: formats that are binary by definition, where a zero
 * byte is the content rather than a defect. A scanner that cries wolf on a PNG
 * gets suppressed, which is how it stops working. Kept explicit and short —
 * everything not listed here is expected to be readable text, including
 * extensionless files (Makefile, Dockerfile, gradlew, .gitignore …).
 */
const BINARY_EXTENSIONS = [
  // images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.heic',
  '.icns',
  // fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  // archives, binaries, media, key material
  '.jar',
  '.zip',
  '.gz',
  '.tgz',
  '.pdf',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.keystore',
  '.jks',
  '.p12',
  '.mobileprovision',
  '.xcuserstate',
];

function trackedFiles(): string[] {
  // -z: NUL-separated, so a path containing a newline cannot split a record.
  // (The irony is noted. It is also the correct flag.)
  // --others --exclude-standard: files not yet `git add`ed are in scope too —
  // otherwise the defect is only caught AFTER it is staged, and the invariant
  // registry's own probe (an untracked scratch file) would sail through.
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO_ROOT,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out
    .toString('utf8')
    .split('\0')
    .filter((path) => path.length > 0);
}

function main(): number {
  const offenders: Array<{ path: string; line: number }> = [];
  let scanned = 0;

  for (const relative of trackedFiles()) {
    const lower = relative.toLowerCase();
    if (BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(REPO_ROOT, relative));
    } catch {
      continue; // tracked but absent from the worktree (sparse checkout, rm)
    }
    scanned += 1;
    const at = bytes.indexOf(0);
    if (at < 0) continue;
    // The line number, so the message points at the character rather than
    // at the file — the whole complaint is that this byte is hard to find.
    const line = bytes.subarray(0, at).toString('utf8').split('\n').length;
    offenders.push({ path: relative, line });
  }

  // A scan that inspected nothing passes vacuously, which is the failure this
  // whole registry was built around. Refuse to report success on zero files.
  if (scanned === 0) {
    console.error(
      'check-source-is-text inspected ZERO files — git ls-files returned ' +
        'nothing usable. A scanner that scans nothing reports perfect health.',
    );
    return 1;
  }

  if (offenders.length === 0) {
    console.log(`${scanned} tracked files scanned, all text.`);
    return 0;
  }

  console.error(
    `${offenders.length} tracked file(s) contain a raw NUL byte, which makes ` +
      'them BINARY to grep, git diff and every code review:\n',
  );
  for (const offender of offenders) {
    console.error(`  ${offender.path}:${offender.line}`);
  }
  console.error(
    "\nWrite the escape '\\0' instead of typing the byte. It compiles to the " +
      'identical string and the file stays readable. If the file is genuinely ' +
      'binary, add its extension to BINARY_EXTENSIONS in this script.',
  );
  return 1;
}

process.exit(main());
