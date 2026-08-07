#!/usr/bin/env node
// @script-class: gate
// @run-by: .github/workflows/ci.yml (the dead-hook-args --check CI step (earned then wired, D111)).
/**
 * HUNT TOOL (not a gate — see THE --check DECISION at the bottom of this
 * header): a property that a function's parameter TYPE declares, that the
 * function's destructuring pattern never binds, is read by nothing.
 *
 * THE INCIDENT (F4101 → F4601). `filterModalRuntime` was declared in
 * `UseSearchRootForegroundTransientRuntimeArgs`, typed, and supplied by its
 * caller on EVERY RENDER — and the hook's destructuring param list simply did
 * not name it. Nothing read it. Nothing could have told us:
 *
 *   - TypeScript checks that a declared argument is SUPPLIED, never that it is
 *     USED. Excess-property checking runs the other way.
 *   - ESLint's no-unused-vars sees only the identifiers a binding pattern
 *     actually NAMES. A property absent from the pattern is not an unused
 *     binding; it is not a binding at all.
 *   - A `({ ...args })` rest pattern hides the whole question from eslint,
 *     since the rest binding is always "used".
 *
 * This is a gap BETWEEN two checkers, each correctly doing its own job — the
 * ladder's "compensates-for = nothing". Six instances surfaced in a single
 * lane (F4601), and not one was hunted: every one fell out of unrelated work.
 * The bedrock is one sentence: AN ARGUMENT EXISTS BECAUSE A CALLEE READS IT.
 *
 * WHY THIS IS TYPE-AWARE AND NOT A REGEX. Two regex censuses over the same
 * 283 files were written before this and BOTH mis-parsed nested object-type
 * members as top-level arguments — i.e. both would have accused live code.
 * For a verdict that reads "delete this argument" that failure mode is
 * disqualifying, so this walks the TypeScript compiler's resolved types and
 * symbols instead. It resolves a real `Type`, enumerates its real properties,
 * and compares them against the real binding pattern.
 *
 * THE D96 CAVEAT, honoured because we have the compiler. `void x;` means two
 * OPPOSITE things in this repo. On a parameter it is the author asserting
 * "supplied and deliberately unread" (F5302). On a const whose DECLARATION IS
 * THE CHECK — `void _assertEveryRuntimeField…`, `void exhaustive;`, a
 * never-exhaustiveness binding or a compile-time type assertion — the void is
 * what marks a REAL GUARD as used, and deleting it deletes the guard. ESLint
 * cannot tell them apart because it cannot resolve bindings; the compiler API
 * can, so `isTypeLevelCheckDeclaration` below resolves the voided identifier
 * to its declaration and treats the second kind as a READ.
 *
 * WHAT COUNTS AS A SUBJECT, and both restrictions were learned from the first
 * report-only run rather than assumed:
 *
 *  1. THE TYPE MUST BE OURS, AND NAMED. Only a reference to a type alias or
 *     interface DECLARED IN THIS REPO qualifies. The first run accused
 *     fourteen properties of `LayoutChangeEvent` on `({ nativeEvent }:
 *     LayoutChangeEvent) => …` — a platform type whose other members React
 *     Native supplies and no caller of ours chose. A vendor or inline
 *     structural callback type is a signature DICTATED TO us; only a named
 *     type we own is a fan-in contract someone can pad.
 *
 *  2. THE VERDICT IS PER TYPE, NOT PER FUNCTION. A shared Args type read by
 *     several hooks is read in SUBSETS by design —
 *     `SearchForegroundOverlayRuntimeArgs` feeds two hooks, and the first run
 *     accused each of the properties the OTHER one reads (37 of 88 findings).
 *     A property is dead when NO in-scope consumer of its type binds it. That
 *     is exactly F4101's shape: the property nobody anywhere reads.
 *
 * THE SKIPS, all in the OVER-CREDIT direction (this must never accuse live
 * code, so anything it cannot resolve exactly is credited and COUNTED):
 *   - a parameter with no explicit type annotation (its type is INFERRED FROM
 *     the pattern, so type-vs-pattern is a tautology);
 *   - a union/intersection-shaped, generic, computed or non-ours type, where
 *     "the properties someone chose to declare" is not one answer;
 *   - a rest binding used as a whole value (spread, passed on, element-access)
 *     rather than only as `rest.prop` — every remaining property is reachable;
 *   - a type with an index signature.
 *
 * AND THE EVIDENCE IS WIDER THAN THE VERDICT: candidates are reported for
 * types DECLARED in scope, but every file in apps/mobile/src — specs included
 * — votes on whether a property is read. A property read by a consumer this
 * run never looked at is not dead.
 *
 * THE --check DECISION (2026-08-07), recorded because the row asked for it.
 *
 * CALIBRATION, against the F4601 family rather than against invented cases:
 *   - the ORIGINAL F4101 instance, restored from its pre-delete blob
 *     (d82570f5a^): FOUND — `UseSearchRootForegroundTransientRuntimeArgs
 *     .filterModalRuntime`, and nothing else in that file was accused;
 *   - the sixth instance, the `({ ...args })` REST shape eslint is
 *     structurally blind to, restored from 0baa2eb5e^: FOUND —
 *     `UseSearchSuggestionPresentationPlaneRuntimeArgs.searchInteractionRef`;
 *   - the THREADED shape (a lane supplied through two files to a hook that
 *     stopped reading it): FOUND, via a planted property supplied from the
 *     caller two files up.
 *   - the three F3900 arguments are NOT calibration inputs, and saying so is
 *     the honest half: they only became dead AFTER that commit deleted the
 *     chip props, so at the pre-fix blob they are destructured and read. Their
 *     shape is the first bullet's, which is proven.
 *
 * FALSE-POSITIVE RATE ON THE LIVE TREE: zero. Eleven candidates were reported
 * and ALL ELEVEN were verified genuine by reading — including two the code's
 * own comments had already declared dead in prose (F1064's "the three
 * factories read actionExecutionPorts + runtimeState ONLY", while the type
 * still carries queryState/selectionState; and F1494's dead `mode`). Three
 * corrections were forced by that verification pass and each is implemented
 * above: vendor/inline types are not subjects, credits are keyed by PROPERTY
 * SYMBOL (so an intersection alias cannot accuse its base), and a read
 * through `Readonly<Props>` in a React.memo comparator is credited via
 * `getRootSymbols`.
 *
 * SO --check IS EARNED AND IS NOT YET WIRED TO CI, deliberately: the live
 * tree still holds those eleven. Deleting them is a change to shared
 * foreground contracts, filed as its own finding rather than smuggled into
 * the lane that built the instrument. Wire the CI step in the commit that
 * takes the count to zero — a gate that lands red is the thing this repo
 * keeps learning not to ship.
 *
 *   node scripts/find-dead-hook-args.mjs                 # report, exit 0
 *   node scripts/find-dead-hook-args.mjs --check         # exit 1 on a finding
 *   node scripts/find-dead-hook-args.mjs --scope=<path prefix>   # hunt elsewhere
 *
 * MUTATION PROOF (run 2026-08-07): with a property planted in an Args type and
 * supplied by its caller, --check exits 1 naming file, hook and property; with
 * it removed the count returns to the eleven-strong baseline. Zero files in
 * scope is a FAILURE, never a pass.
 */
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_ROOT = resolve(REPO_ROOT, 'apps/mobile');

const args = process.argv.slice(2);
const CHECK_MODE = args.includes('--check');
const DEFAULT_SCOPES = [
  'apps/mobile/src/screens/Search/',
  'apps/mobile/src/overlays/',
];
const scopeArgs = args
  .filter((a) => a.startsWith('--scope='))
  .map((a) => a.slice('--scope='.length));
const SCOPES = (scopeArgs.length ? scopeArgs : DEFAULT_SCOPES).map((s) =>
  resolve(REPO_ROOT, s),
);

const configPath = ts.findConfigFile(MOBILE_ROOT, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) {
  console.error(
    `FAIL: no tsconfig.json under ${MOBILE_ROOT}. This scanner is type-aware ` +
      `by construction — without a program it would have to guess, which is ` +
      `the regex shape F4601 disqualified.`,
  );
  process.exit(1);
}
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    console.error(`FAIL: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    process.exit(1);
  },
});
if (!parsed || parsed.fileNames.length === 0) {
  console.error('FAIL: the mobile tsconfig resolved zero files — a scan of nothing.');
  process.exit(1);
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});
const checker = program.getTypeChecker();

const MOBILE_SRC = resolve(MOBILE_ROOT, 'src');

/** Where a type must be DECLARED for its properties to be reported. */
const inScope = (fileName) =>
  SCOPES.some((s) => resolve(fileName).startsWith(s)) &&
  !/\/node_modules\//.test(fileName);

/**
 * Where EVIDENCE is gathered. Deliberately wider than the reported scope: a
 * property read by a consumer this run never looked at is not dead, so the
 * whole mobile source (specs included — a spec reading a property is a
 * consumer) votes on every candidate.
 */
const isEvidenceFile = (fileName) =>
  resolve(fileName).startsWith(MOBILE_SRC) && !/\/node_modules\//.test(fileName);

const evidenceFiles = program
  .getSourceFiles()
  .filter((sf) => !sf.isDeclarationFile && isEvidenceFile(sf.fileName));
const subjectFiles = evidenceFiles.filter((sf) => inScope(sf.fileName));

if (evidenceFiles.length === 0 || subjectFiles.length === 0) {
  console.error(
    'FAIL: zero source files in scope. Either the scope moved (retarget ' +
      'deliberately) or the program is empty — a scan of nothing reports clean.',
  );
  process.exit(1);
}

const skips = {
  untypedParam: 0,
  notOurNamedType: 0,
  unresolvableType: 0,
  wholeRestUse: 0,
};

/**
 * D96's caveat, resolved rather than guessed: the declaration of the voided
 * identifier decides what `void x;` MEANS. A variable declaration (an
 * exhaustiveness binding, a compile-time type assertion) is a guard being
 * marked used — a READ. A parameter or binding element is the author asserting
 * the value is unread — not a read.
 */
function isTypeLevelCheckDeclaration(symbol) {
  const decls = symbol?.getDeclarations() ?? [];
  if (decls.length === 0) return false;
  return decls.every(
    (d) => ts.isVariableDeclaration(d) || ts.isFunctionDeclaration(d) || ts.isTypeAliasDeclaration(d),
  );
}

/** True when this identifier occurrence is a genuine READ of its binding. */
function isGenuineRead(id) {
  const parent = id.parent;
  if (parent && ts.isVoidExpression(parent)) {
    return isTypeLevelCheckDeclaration(checker.getSymbolAtLocation(id));
  }
  // `{ x }` shorthand in a binding pattern is a declaration, not a read.
  if (parent && ts.isBindingElement(parent) && parent.name === id) return false;
  if (parent && ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (parent && ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  return true;
}

/** Every identifier in `body` that resolves to `symbol`. */
function referencesTo(body, symbol) {
  const found = [];
  const walk = (node) => {
    if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === symbol) {
      found.push(node);
    }
    ts.forEachChild(node, walk);
  };
  if (body) walk(body);
  return found;
}

/**
 * One entry per NAMED type we own that appears as a destructured parameter
 * type. `bound` is the union across every consumer in the mobile source.
 */
const typeRecords = new Map();

/** The type alias / interface declaration this type reference resolves to. */
function ownedNamedDeclaration(typeNode, type) {
  if (!ts.isTypeReferenceNode(typeNode)) return null;
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const decls = symbol?.getDeclarations() ?? [];
  const decl = decls.find(
    (d) => ts.isTypeAliasDeclaration(d) || ts.isInterfaceDeclaration(d),
  );
  if (!decl) return null;
  const file = decl.getSourceFile();
  if (file.isDeclarationFile || !isEvidenceFile(file.fileName)) return null;
  return { symbol, decl, file };
}


/** Owned named types reachable from a parameter's type NODE, intersections included. */
function ownedTypeReferences(typeNode) {
  const nodes = ts.isIntersectionTypeNode(typeNode) ? typeNode.types : [typeNode];
  const out = [];
  for (const n of nodes) {
    const t = checker.getTypeFromTypeNode(n);
    const owned = ownedNamedDeclaration(n, t);
    if (owned) out.push({ owned, type: t });
  }
  return out;
}

/**
 * CREDITS ARE KEYED BY PROPERTY SYMBOL, NOT BY (type, name) — and this is the
 * correction the second report-only run forced. `type X = ContractArgs & {…}`
 * is a different TYPE with the SAME property symbols, so a per-type tally
 * accused every ContractArgs member that only the intersecting consumer reads
 * (23 of the 30 it reported). The compiler already unifies aliases,
 * intersections and interface inheritance at the symbol level; keying on the
 * symbol inherits that for free instead of re-implementing it.
 */
const creditedProps = new Set();
const creditAllTypes = new Set();

function recordFor(owned, type) {
  let record = typeRecords.get(owned.symbol);
  if (!record) {
    record = {
      name: owned.decl.name.text,
      declFile: owned.file.fileName,
      properties: checker.getPropertiesOfType(type),
      sites: [],
    };
    typeRecords.set(owned.symbol, record);
  }
  return record;
}

/**
 * Credit a property symbol AND its root symbols. `React.memo`'s comparator is
 * contextually typed `Readonly<Props>` — a MAPPED type, whose members are
 * fresh synthetic symbols. Crediting only the symbol at the read site made the
 * scanner accuse `mapBearing`/`mapPitch` while the memo comparator six hundred
 * lines below compared both. `getRootSymbols` is how the compiler itself
 * walks a mapped/synthesised member back to the one that was declared.
 */
function creditSymbol(symbol) {
  if (!symbol) return;
  creditedProps.add(symbol);
  for (const root of checker.getRootSymbols(symbol)) creditedProps.add(root);
}

/** Credit `name` as read on `type`, by the property's own symbol. */
function creditName(type, name) {
  creditSymbol(checker.getPropertyOfType(type, name));
}

/**
 * PASS A — SUBJECTS. A record exists for every owned named type that appears
 * as the annotation of a DESTRUCTURED PARAMETER. That is the F4601 shape: a
 * contract someone fans arguments into.
 */
function inspectFunctionLike(node, sourceFile) {
  if (!node.body) return;
  for (const param of node.parameters) {
    if (!ts.isObjectBindingPattern(param.name)) continue;
    if (!param.type) {
      skips.untypedParam += 1;
      continue;
    }
    const owneds = ownedTypeReferences(param.type);
    if (owneds.length === 0) {
      // Vendor types, inline structural callback signatures, `Parameters<…>`
      // projections: a signature dictated to us, not a contract we can pad.
      skips.notOurNamedType += 1;
      continue;
    }
    for (const { owned, type } of owneds) {
      if (
        type.flags & ts.TypeFlags.TypeParameter ||
        type.flags & ts.TypeFlags.Any ||
        type.flags & ts.TypeFlags.Unknown ||
        checker.getIndexInfoOfType(type, ts.IndexKind.String) ||
        checker.getIndexInfoOfType(type, ts.IndexKind.Number) ||
        checker.getPropertiesOfType(type).length === 0
      ) {
        skips.unresolvableType += 1;
        continue;
      }
      const record = recordFor(owned, type);
      const { line } = sourceFile.getLineAndCharacterOfPosition(param.getStart());
      record.sites.push({
        file: relative(REPO_ROOT, sourceFile.fileName),
        line: line + 1,
        owner:
          (node.name && ts.isIdentifier(node.name) && node.name.text) ||
          (ts.isVariableDeclaration(node.parent) &&
            ts.isIdentifier(node.parent.name) &&
            node.parent.name.text) ||
          '<anonymous>',
        inScope: inScope(sourceFile.fileName),
      });
    }
  }
}

for (const sourceFile of evidenceFiles) {
  const walk = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      inspectFunctionLike(node, sourceFile);
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

/**
 * PASS B — CREDITS, gathered from the WHOLE mobile source and from EVERY
 * shape a read can take, because this half is what stops the scanner accusing
 * live code. The first run taught three of these the hard way:
 *
 *   - A destructure that is not a parameter: `const { navigation } =
 *     args.overlayRuntimeArgs;`. Any binding pattern whose type resolves to a
 *     tracked contract votes.
 *   - A read off a whole value: `props.foo`, resolved BY SYMBOL, so a
 *     same-named property on an unrelated type credits nothing.
 *   - A read in TYPE position: `SearchForegroundOverlayRuntimeArgs['rootOverlay']`
 *     is how a callback parameter borrows a contract's member, and it made the
 *     first run accuse `rootOverlay` while the very same file used it.
 *
 * A property ASSIGNMENT in an object literal is deliberately NOT a credit: a
 * caller supplying a value nobody reads is the defect itself.
 */
function trackedRecordOfType(type) {
  if (!type) return null;
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return symbol ? typeRecords.get(symbol) ?? null : null;
}

for (const sourceFile of evidenceFiles) {
  const walk = (node) => {
    if (ts.isObjectBindingPattern(node)) {
      const type = checker.getTypeAtLocation(node);
      const symbol = type?.aliasSymbol ?? type?.getSymbol();
      for (const element of node.elements) {
        if (element.dotDotDotToken) {
          if (!ts.isIdentifier(element.name)) {
            if (symbol) creditAllTypes.add(symbol);
            skips.wholeRestUse += 1;
            continue;
          }
          const restSymbol = checker.getSymbolAtLocation(element.name);
          const body = ts.findAncestor(node, (a) => !!a.body)?.body ?? sourceFile;
          for (const ref of referencesTo(body, restSymbol)) {
            const parent = ref.parent;
            if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === ref) {
              creditName(type, parent.name.text);
              continue;
            }
            // Spread, element access, passed on whole: everything is reachable.
            if (symbol) creditAllTypes.add(symbol);
            skips.wholeRestUse += 1;
            break;
          }
          continue;
        }
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) || ts.isStringLiteral(key)) creditName(type, key.text);
        else if (symbol) creditAllTypes.add(symbol);
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      creditSymbol(checker.getSymbolAtLocation(node.name));
    } else if (ts.isElementAccessExpression(node) && node.argumentExpression &&
      ts.isStringLiteralLike(node.argumentExpression)) {
      creditName(checker.getTypeAtLocation(node.expression), node.argumentExpression.text);
    } else if (ts.isIndexedAccessTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.indexType) && ts.isStringLiteralLike(node.indexType.literal)) {
        creditName(checker.getTypeFromTypeNode(node.objectType), node.indexType.literal.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

const findings = [];
// One finding per PROPERTY SYMBOL: an intersection alias and its base declare
// the same member, and reporting it twice would inflate the count.
const reported = new Set();
for (const [typeSymbol, record] of typeRecords) {
  if (creditAllTypes.has(typeSymbol)) continue;
  if (!record.sites.some((site) => site.inScope)) continue;
  const site = record.sites.find((s) => s.inScope);
  for (const prop of record.properties) {
    if (creditedProps.has(prop) || reported.has(prop)) continue;
    reported.add(prop);
    findings.push({
      file: site.file,
      line: site.line,
      owner: site.owner,
      typeText: record.name,
      property: prop.getName(),
      consumers: record.sites.length,
    });
  }
}
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const skipNote =
  ` (credited without checking: ${skips.untypedParam} untyped param(s), ` +
  `${skips.notOurNamedType} vendor/inline/derived param type(s), ` +
  `${skips.unresolvableType} union/generic/indexed param type(s), ` +
  `${skips.wholeRestUse} whole-rest use(s) — every one of those is the ` +
  `over-credit direction, never an accusation. ${typeRecords.size} named ` +
  `type(s) we own were checked across ${evidenceFiles.length} source file(s).)`;

if (findings.length === 0) {
  console.log(
    `find-dead-hook-args OK — no property declared by a parameter type goes ` +
      `unread across ${subjectFiles.length} in-scope file(s).${skipNote}`,
  );
  process.exit(0);
}

console.error(
  `find-dead-hook-args — ${findings.length} declared-but-never-read ` +
    `argument propert(ies):\n` +
    findings
      .map(
        (f) =>
          `  - ${f.file}:${f.line} — ${f.owner}(): ${f.typeText}.${f.property} ` +
          `is declared and supplied; no consumer of that type (${f.consumers} ` +
          `site(s)) binds or reads it`,
      )
      .join('\n') +
    `\nAn argument exists because a callee reads it (F4601). Delete the ` +
    `property from the type and from every caller — or bind and use it.` +
    skipNote,
);
process.exit(CHECK_MODE ? 1 : 0);
