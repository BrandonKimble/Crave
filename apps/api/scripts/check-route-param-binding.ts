/**
 * @script-class: invariant-check
 *
 * ROUTE-PARAM BINDING SCANNER (R14 residue class, 2026-08-19; invariant
 * routes.every-param-binding-names-a-route-segment).
 *
 * Every `@Param('name')` in every controller must name a `:name` segment in
 * the method's route template (route decorator path + controller prefix).
 * The proven failure class: the R14 vocabulary rename changed route segments
 * without the `@Param` strings (polls mentions) and vice versa (photos
 * gallery) — `req.params['placeId']` was undefined, ParseUUIDPipe 400'd
 * EVERY call, and the endpoints were dead for three days. Invisible to tsc
 * (both sides are strings) and to unit specs (params are mocked).
 *
 * PARSING REACH — regex-level, honest about it. This repo's controllers use
 * exactly (verified by reading all 27 on 2026-08-19):
 *   - `@Controller()` / `@Controller('literal')` — single string or empty
 *   - `@Get()/@Post()/@Put()/@Patch()/@Delete()/etc.('literal')` or empty
 *   - `@Param('literal')` with optional pipes — never bare `@Param()`
 *   - plain `:name` segments — no wildcards, optionals (`:x?`), regex
 *     segments, or array route paths anywhere in src/
 * The scanner supports exactly those forms and REFUSES (exit 1) on anything
 * it cannot parse — a route decorator with a non-literal argument, a bare or
 * non-literal `@Param(`, or a path containing `* ? ( +`. Out of scope by the
 * same honesty: route decorators outside `*.controller.ts` (today only spec
 * files and the throttler decorator plumbing carry any).
 *
 * Like scanRepo, it refuses on zero: zero controller files, zero
 * @Controller decorators, zero route decorators, or zero @Param bindings
 * repo-wide each mean the scan lost its subject, not that the law holds.
 *
 * Exit 0 = every binding names a real segment. Exit 1 = mismatch (named:
 * controller, method, param, available segments) or the scan cannot vouch
 * for its own reach.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', 'src');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...controllerFiles(full));
    else if (name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/** Strip block and line comments so a `@Param` in prose cannot be scanned
 *  as a binding. Route paths and param names are plain single-quoted
 *  literals with no `//` or `/*` inside, so this is safe for the subject. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const ROUTE_DECORATOR =
  /@(Get|Post|Put|Patch|Delete|All|Options|Head|Search)\s*\(\s*(?:'([^']*)')?\s*\)/g;
const CONTROLLER_DECORATOR = /@Controller\s*\(\s*(?:'([^']*)')?\s*\)/g;
const PARAM_ANY = /@Param\s*\(/g;
const PARAM_LITERAL = /@Param\s*\(\s*'([^']+)'/g;

const UNSUPPORTED_PATH = /[*?(+]/;

interface Failure {
  file: string;
  detail: string;
}

const failures: Failure[] = [];
let filesScanned = 0;
let controllersScanned = 0;
let routesScanned = 0;
let paramsChecked = 0;

function segmentsOf(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function paramNamesOf(segments: string[]): string[] {
  return segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1));
}

for (const file of controllerFiles(SRC)) {
  filesScanned += 1;
  const rel = relative(join(__dirname, '..'), file);
  const source = stripComments(readFileSync(file, 'utf8'));

  // A route or param decorator this scanner cannot read is a refusal, not a
  // skip: an unreadable binding is exactly where the next mismatch hides.
  const paramAnyCount = [...source.matchAll(PARAM_ANY)].length;
  const paramLiteralCount = [...source.matchAll(PARAM_LITERAL)].length;
  if (paramAnyCount !== paramLiteralCount) {
    failures.push({
      file: rel,
      detail: `carries ${paramAnyCount} @Param( but only ${paramLiteralCount} parse as @Param('literal') — a bare or computed @Param is outside this scanner's proven reach; extend the scanner WITH a RED proof before using that form.`,
    });
    continue;
  }
  // Exact coverage: every route-decorator OPEN in the (comment-stripped)
  // source must be one the full regex parsed. A count mismatch means an
  // argument form outside the proven reach (array path, variable, second
  // argument) — refuse rather than silently skip that route.
  const routeOpens = [
    ...source.matchAll(
      /@(Get|Post|Put|Patch|Delete|All|Options|Head|Search)\s*\(/g,
    ),
  ].length;
  const routeParsed = [...source.matchAll(ROUTE_DECORATOR)].length;
  if (routeOpens !== routeParsed) {
    failures.push({
      file: rel,
      detail: `carries ${routeOpens} route decorators but only ${routeParsed} parse as @Verb() / @Verb('literal') — arrays/variables/multi-arg forms are outside this scanner's proven reach; extend it WITH a RED proof first.`,
    });
    continue;
  }

  // Split the file into controller blocks: each @Controller decorator owns
  // everything until the next one (photos.controller.ts carries two classes).
  const controllerMatches = [...source.matchAll(CONTROLLER_DECORATOR)];
  for (let c = 0; c < controllerMatches.length; c += 1) {
    controllersScanned += 1;
    const cm = controllerMatches[c];
    const prefix = cm[1] ?? '';
    const blockStart = cm.index ?? 0;
    const blockEnd =
      c + 1 < controllerMatches.length
        ? (controllerMatches[c + 1].index ?? source.length)
        : source.length;
    const block = source.slice(blockStart, blockEnd);
    const classMatch = /export\s+class\s+(\w+)/.exec(block);
    const className = classMatch ? classMatch[1] : '<unnamed controller>';

    if (UNSUPPORTED_PATH.test(prefix)) {
      failures.push({
        file: rel,
        detail: `${className}: @Controller('${prefix}') uses a wildcard/optional/regex feature this scanner does not model — extend it WITH a RED proof first.`,
      });
      continue;
    }

    const routeMatches = [...block.matchAll(ROUTE_DECORATOR)];
    for (let r = 0; r < routeMatches.length; r += 1) {
      routesScanned += 1;
      const rm = routeMatches[r];
      const path = rm[2] ?? '';
      const regionStart = (rm.index ?? 0) + rm[0].length;
      const regionEnd =
        r + 1 < routeMatches.length
          ? (routeMatches[r + 1].index ?? block.length)
          : block.length;
      const region = block.slice(regionStart, regionEnd);

      const methodMatch =
        /(?:^|\n)\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/.exec(
          region,
        );
      const methodName = methodMatch ? methodMatch[1] : '<unresolved method>';

      if (UNSUPPORTED_PATH.test(path)) {
        failures.push({
          file: rel,
          detail: `${className}.${methodName}: @${rm[1]}('${path}') uses a wildcard/optional/regex feature this scanner does not model — extend it WITH a RED proof first.`,
        });
        continue;
      }

      const segments = [...segmentsOf(prefix), ...segmentsOf(path)];
      const available = paramNamesOf(segments);

      for (const pm of region.matchAll(PARAM_LITERAL)) {
        paramsChecked += 1;
        const paramName = pm[1];
        if (!available.includes(paramName)) {
          failures.push({
            file: rel,
            detail:
              `${className}.${methodName}: @Param('${paramName}') names no segment of ` +
              `@${rm[1]}('${path}') under @Controller('${prefix}') — ` +
              `available: ${available.length > 0 ? available.map((a) => `:${a}`).join(', ') : '(none)'}. ` +
              `req.params['${paramName}'] is undefined at runtime, so a pipe 400s EVERY call ` +
              `(the R14 residue class: polls mentions + photos gallery, dead 3 days, invisible to tsc and mocked specs).`,
          });
        }
      }
    }
  }
}

// The refuse-on-zero floor: a scan that saw nothing proves nothing.
if (filesScanned === 0)
  failures.push({
    file: SRC,
    detail: 'ZERO controller files found — the glob lost the tree.',
  });
if (controllersScanned < 10)
  failures.push({
    file: SRC,
    detail: `only ${controllersScanned} @Controller decorators parsed (28 existed on 2026-08-19) — the decorator regex lost its subject.`,
  });
if (routesScanned < 50)
  failures.push({
    file: SRC,
    detail: `only ${routesScanned} route decorators parsed (124 existed on 2026-08-19) — the route regex lost its subject.`,
  });
if (paramsChecked < 10)
  failures.push({
    file: SRC,
    detail: `only ${paramsChecked} @Param bindings checked (57 existed on 2026-08-19) — the param regex lost its subject.`,
  });

if (failures.length > 0) {
  console.error('RED: route-param binding scan failed:');
  for (const f of failures) console.error(`  ${f.file}\n    ${f.detail}`);
  process.exit(1);
}

console.log(
  `route-param bindings hold: ${paramsChecked} @Param bindings across ${routesScanned} routes, ` +
    `${controllersScanned} controllers, ${filesScanned} files — every binding names a live segment.`,
);
