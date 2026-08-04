/**
 * THE F1610/F1611 GUARD — a dep array must cover every field its factory reads.
 *
 * F1610 measured the disease: a repacker's field list lives in FOUR places (the factory's
 * destructure, its object literal, the call site's argument list, and the call site's
 * `useMemo` dep array). Nothing holds the fourth in step with the first three, and F1611
 * proved it had already drifted — a factory read `mapBearing`/`mapPitch` while its dep array
 * omitted both, so a bearing/pitch-only change could not invalidate the memo.
 *
 * F1611 was fixed by hand at one site. Hand-fixing a truth-in-four-places defect at one site
 * is not a fix, it is a coincidence: THIS SPEC found the same two fields missing at a second
 * site (`use-search-root-map-surface-state-runtime.ts`) that gates the very memo the hand-fix
 * landed in. The guard is the actual fix; the dep arrays are just its current output.
 *
 * WHAT IT CHECKS: for every `create*` factory in the search runtime that is called inside a
 * `useMemo`, every property path the FACTORY BODY reads off one of its parameters must be
 * covered by that `useMemo`'s dep array — either by the exact path or by a prefix of it
 * (depending on a parent object is strictly stronger than depending on its field).
 *
 * KNOWN-GOOD EXCEPTIONS are listed explicitly below, each with a reason. An exception is a
 * claim you are making in public; if you add one, say why it is stable.
 */
import fs from 'fs';
import path from 'path';

const RUNTIME_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Reads that are stable by construction and correctly absent from dep arrays.
 * A `useRef` container never changes identity, so listing it would be noise, and listing
 * `.current` would be actively wrong (it is mutable and not a render input).
 */
const isStableByConstruction = (readPath: string): boolean =>
  /(^|\.)[A-Za-z0-9]*[Rr]ef(\.|$)/.test(readPath);

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(full);
    }
    return entry.isFile() && full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });

/**
 * Comments are stripped before ANY parsing.
 *
 * This is not tidiness — it is the difference between a guard and a decoration. The first
 * version of this scanner parsed raw source, and a provenance comment written INSIDE a dep
 * array silenced it: the comment text became pseudo-entries and the missing dep stopped being
 * reported. A guard that a comment can switch off is worse than no guard, because it reads
 * as green. Proven by re-running the F1611 mutation with the comment in place.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const readMatchingBrace = (source: string, openIndex: number): string => {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }
  return '';
};

type Factory = { name: string; params: string[]; reads: string[] };

/** Every `export const createX = ({ a, b }: T): T => ({ ... })` in the runtime. */
const collectFactories = (files: string[]): Map<string, Factory> => {
  const factories = new Map<string, Factory>();
  files.forEach((file) => {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const pattern = /export const (create\w+) = \(\{([^}]*)\}:/g;
    let match = pattern.exec(source);
    while (match != null) {
      const [, name, rawParams] = match;
      const params = rawParams
        .split(',')
        .map((entry) => entry.split(':')[0].trim())
        .filter((entry) => entry.length > 0 && /^[A-Za-z_$][\w$]*$/.test(entry));
      const bodyStart = source.indexOf('{', source.indexOf('=>', match.index));
      const body = bodyStart === -1 ? '' : readMatchingBrace(source, bodyStart);
      const reads = params.flatMap((param) => {
        const readPattern = new RegExp(`\\b${param}((?:\\.[A-Za-z_$][\\w$]*)+)`, 'g');
        const found = new Set<string>();
        let readMatch = readPattern.exec(body);
        while (readMatch != null) {
          found.add(`${param}${readMatch[1]}`);
          readMatch = readPattern.exec(body);
        }
        return [...found];
      });
      factories.set(name, { name, params, reads });
      match = pattern.exec(source);
    }
  });
  return factories;
};

const splitTopLevel = (input: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if ('([{'.includes(char)) {
      depth += 1;
    } else if (')]}'.includes(char)) {
      depth -= 1;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

type Violation = { factory: string; site: string; uncovered: string[]; deps: string[] };

const findViolations = (files: string[], factories: Map<string, Factory>): Violation[] => {
  const violations: Violation[] = [];
  files.forEach((file) => {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    factories.forEach((factory) => {
      const callPattern = new RegExp(`${factory.name}\\(\\{`, 'g');
      let call = callPattern.exec(source);
      while (call != null) {
        const argsStart = source.indexOf('{', call.index);
        const args = readMatchingBrace(source, argsStart);
        const afterArgs = source.indexOf('}', argsStart + args.length);
        const tail = source.slice(afterArgs + 1, afterArgs + 601);
        const depsMatch = /\[([\s\S]*?)\]\s*\)/.exec(tail);
        /**
         * Only the REPACKER shape is in scope: the factory call must be the direct return of
         * the `useMemo`, so nothing but closing parens and a comma may sit between its
         * argument object and the dep array. This deliberately excludes a factory called
         * INSIDE a callback body (e.g. inside a `useCallback`, or a state-updater lambda),
         * where the values it reads are the callback's own locals — those are not render
         * inputs and listing them as deps would be wrong, not right.
         */
        const isDirectMemoReturn =
          depsMatch != null && /^[\s)]*,\s*$/.test(tail.slice(0, depsMatch.index));
        if (depsMatch != null && isDirectMemoReturn) {
          const deps = splitTopLevel(depsMatch[1]);
          // Map each factory parameter to the expression the call site passes for it.
          const bindings = new Map<string, string>();
          splitTopLevel(args).forEach((entry) => {
            const colon = entry.indexOf(':');
            if (colon === -1) {
              bindings.set(entry.trim(), entry.trim());
            } else {
              bindings.set(entry.slice(0, colon).trim(), entry.slice(colon + 1).trim());
            }
          });
          const uncovered = factory.reads
            .filter((read) => !isStableByConstruction(read))
            .map((read) => {
              const [param, ...rest] = read.split('.');
              const bound = bindings.get(param);
              return bound == null ? null : [bound, ...rest].join('.');
            })
            .filter((read): read is string => read != null)
            // Re-test AFTER binding: a factory may name a parameter `stats` while the call
            // site passes `stats: someRef.current`. The read is only revealed as a ref read
            // once the call site's expression is substituted in.
            .filter((read) => !isStableByConstruction(read))
            .filter((read) => !deps.some((dep) => read === dep || read.startsWith(`${dep}.`)));
          if (uncovered.length > 0) {
            violations.push({
              factory: factory.name,
              site: path.relative(RUNTIME_ROOT, file),
              uncovered: [...new Set(uncovered)].sort(),
              deps,
            });
          }
        }
        call = callPattern.exec(source);
      }
    });
  });
  return violations;
};

describe('repacker dep arrays cover every field their factory reads (F1610/F1611)', () => {
  const files = listSourceFiles(RUNTIME_ROOT);

  it('finds the repacker factories at all (the scanner must not pass by finding nothing)', () => {
    const factories = collectFactories(files);
    // A self-check: a scanner that silently matches zero factories is always green and lying.
    expect(factories.size).toBeGreaterThan(15);
  });

  it('reports no factory read that its call site cannot invalidate on', () => {
    const violations = findViolations(files, collectFactories(files));

    expect(
      violations.map(
        (violation) =>
          `${violation.site} :: ${violation.factory} cannot invalidate on ${violation.uncovered.join(', ')} (deps: ${violation.deps.join(', ')})`
      )
    ).toEqual([]);
  });
});
