import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COLUMN_COVERAGE,
  PERSON_DATA_RULES,
  type ColumnCoverageEntry,
} from './person-data-class';
import { retentionAction, retentionScopeColumns } from './person-data-scope';
import { codeMatches, stripComments } from '../../../shared/testing/code-only';

/**
 * THE CENSUS — TOTAL CLASSIFICATION (F9310, owner-approved 2026-08-07).
 *
 * WHAT THIS USED TO BE, AND WHY IT WAS NOT ENOUGH. The census asked a
 * deliberately over-broad regex — `*_user_id` plus a hardcoded literal list —
 * "is there a person-shaped column nobody classified?" That is the right
 * SHAPE of question (inference as adversary, never as decider) asked over the
 * wrong domain. A `bio`, a `phone_number`, a `home_address`, a `dob`, a
 * `lat`/`lng` on a person's action matches no reference-column pattern and is
 * in no literal list, so it would be born unclassified, stay unclassified,
 * and never be erased — silently, which is the one failure mode the whole
 * declaration exists to make impossible. The net could only catch the columns
 * someone had already thought of.
 *
 * SO THE QUESTION IS INVERTED: guilty until classified. The domain is now the
 * SCHEMA ITSELF — every (table, column) Prisma declares — and each one must
 * appear either in `PERSON_DATA_RULES` (a disposition) or in
 * `COLUMN_COVERAGE` (not_person / dies_with_row / lives_with_row /
 * erased_by_hand / awaiting_owner). Anything in neither is named and fails.
 * There is no residual "the pattern didn't match it" category left, because
 * there is no pattern.
 *
 * The independence that made the old census trustworthy is preserved: this
 * reads schema.prisma, the classification is hand-written, so the two cannot
 * share a blind spot. What changed is that the schema side is now COMPLETE.
 *
 * AND THE LEANING CLAIMS ARE VERIFIED, NOT TRUSTED. `dies_with_row` on a
 * table with no `delete_row` rule fails. `lives_with_row` with nothing
 * retaining the row fails. `erased_by_hand` whose handler no longer mentions
 * the field fails. A coverage entry cannot outlive the mechanism it names.
 *
 * RED RECIPE (run it, don't trust it): add `bio String? @map("bio")` to any
 * model — no `_user_id`, no literal-list membership — and this fails naming
 * `<table>.bio`. Delete a rule from PERSON_DATA_RULES and the same happens.
 */

const SCHEMA_PATH = join(__dirname, '../../../../prisma/schema.prisma');

interface SchemaColumn {
  table: string;
  column: string;
  /** `String?` in the schema — i.e. the column can actually be set NULL. */
  optional: boolean;
}

/**
 * Parse EVERY stored column out of the schema.
 *
 * Relation fields are excluded because they are not columns — a
 * `user User @relation(fields: [userId])` line stores nothing; its `userId`
 * scalar, which IS stored, is a separate line and is classified on its own.
 * Excluding them by "the field's type is a model name" is exact, and it
 * deliberately does NOT exclude enums (`EntityType`), which are real columns.
 */
function readSchemaColumns(): SchemaColumn[] {
  const src = readFileSync(SCHEMA_PATH, 'utf8');
  const modelNames = new Set(
    [...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]),
  );
  const out: SchemaColumn[] = [];
  for (const block of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm)) {
    const body = block[2];
    const mapped = body.match(/@@map\("(\w+)"\)/);
    const table = mapped ? mapped[1] : block[1];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue;
      }
      const field = trimmed.match(/^(\w+)\s+(\S+)/);
      if (!field) continue;
      if (modelNames.has(field[2].replace(/[?[\]]/g, ''))) continue;
      const colMap = trimmed.match(/@map\("(\w+)"\)/);
      const column =
        colMap?.[1] ?? field[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      const optional = /^\w+\s+\w+\?/.test(trimmed);
      out.push({ table, column, optional });
    }
  }
  return out;
}

const snakeToCamel = (s: string): string =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The coverage entry governing a column: the column entry, else the table's. */
function coverageFor(
  table: string,
  column: string,
): ColumnCoverageEntry | undefined {
  return (
    COLUMN_COVERAGE.find((e) => e.table === table && e.column === column) ??
    COLUMN_COVERAGE.find((e) => e.table === table && e.column === undefined)
  );
}

/** The verbs that leave the ROW standing — what `lives_with_row` leans on. */
const KEEPING_DISPOSITIONS = new Set([
  'retain',
  'sever',
  'anonymized_by_shell',
]);

/**
 * Every `lives_with_row` entry whose NAMED keeper is missing or does not keep,
 * given a rule set. Taking the rules as an argument is what lets the mutation
 * proof below ask this exact function about a declaration with the keeper
 * removed — the same function the live check runs, not a copy of it.
 */
function unsupportedLivesWithRow(
  rules: readonly (typeof PERSON_DATA_RULES)[number][],
): string[] {
  return COLUMN_COVERAGE.filter((e) => e.coverage === 'lives_with_row')
    .map((e) => {
      const key = `${e.table}.${e.column ?? '*'}`;
      if (!e.keptBy) return `${key} (no keptBy)`;
      const keeper = rules.find(
        (r) => r.table === e.table && r.column === e.keptBy,
      );
      if (!keeper) return `${key} (keptBy ${e.table}.${e.keptBy} is gone)`;
      if (!KEEPING_DISPOSITIONS.has(keeper.disposition)) {
        return `${key} (keptBy ${e.table}.${e.keptBy} is ${keeper.disposition} — it keeps nothing)`;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}

describe('person-data census — EVERY column in the schema is classified', () => {
  const columns = readSchemaColumns();
  const declared = new Set(
    PERSON_DATA_RULES.map((r) => `${r.table}.${r.column}`),
  );
  const dispositionsByTable = new Map<string, Set<string>>();
  for (const rule of PERSON_DATA_RULES) {
    const set = dispositionsByTable.get(rule.table) ?? new Set<string>();
    set.add(rule.disposition);
    dispositionsByTable.set(rule.table, set);
  }

  it('parses the whole schema (RED-proof: an empty parse would pass everything vacuously)', () => {
    // The always-green failure mode this repo keeps finding. Real numbers on
    // 2026-08-07: 98 tables, 886 columns. A parser regression collapses these.
    expect(new Set(columns.map((c) => c.table)).size).toBeGreaterThan(90);
    expect(columns.length).toBeGreaterThan(800);
  });

  it('NO column anywhere in the schema is unclassified', () => {
    const unclassified = columns
      .filter((c) => !declared.has(`${c.table}.${c.column}`))
      .filter((c) => !coverageFor(c.table, c.column))
      .map((c) => `${c.table}.${c.column}`);

    // Jest prints the array, which names exactly what to classify. Add a
    // PERSON_DATA_RULES rule (it holds a person's data) or a COLUMN_COVERAGE
    // entry (it does not, or something else already disposes of it).
    expect(unclassified).toEqual([]);
  });

  it('every retained or not_person rule states WHY (keeping data needs a reason)', () => {
    const keepers = PERSON_DATA_RULES.filter(
      (r) => r.disposition === 'retain' || r.disposition === 'not_person',
    );
    expect(keepers.length).toBeGreaterThan(0);
    for (const rule of keepers) {
      // The message is in the key so a failure names the offending rule.
      expect(
        `${rule.table}.${rule.column}:${rule.basis ?? 'MISSING-BASIS'}`,
      ).not.toContain('MISSING-BASIS');
    }
  });

  it('every BOUNDED horizon says WHAT expires — the row or the column', () => {
    // The same lesson as `horizon` itself, one field along. Until 2026-08-07
    // every bounded horizon sat on a column that NAMES the person, so "the
    // promise expired" and "delete the row" were the same sentence and the
    // sweep only knew how to DELETE. `users.stripe_customer_id` is a retained
    // VALUE on a row that must never be deleted (the anonymized shell anchors
    // the very financial records it is retained for) — and the row-DELETE it
    // inherited by default matched nothing, so it read as enforcement while
    // enforcing nothing, one scope fix away from destroying the shell.
    //
    // RED RECIPE: delete `horizonUnit` from any rule below and this names it.
    const unstated = PERSON_DATA_RULES.filter(
      (r) => r.disposition === 'retain' && typeof r.horizon === 'number',
    )
      .filter((r) => r.horizonUnit !== 'row' && r.horizonUnit !== 'column')
      .map((r) => `${r.table}.${r.column}`);
    expect(unstated).toEqual([]);
  });

  it('a `row` horizon scopes by a column that LOCATES the person; a `column` horizon does not', () => {
    // The two units are not interchangeable and the mistake is silent in both
    // directions: a 'row' unit on a value column builds `WHERE <value> =
    // <userId>` (matches nothing, deletes nothing, looks fine), and a 'column'
    // unit on the person key would null the key itself. So each unit is
    // checked against the derivation the SQL is actually built from.
    const declaredPersonKeys = new Map<string, Set<string>>();
    for (const r of PERSON_DATA_RULES.filter((r) => r.personKey)) {
      const set = declaredPersonKeys.get(r.table) ?? new Set<string>();
      set.add(r.column);
      declaredPersonKeys.set(r.table, set);
    }

    const wrong: string[] = [];
    for (const rule of PERSON_DATA_RULES) {
      if (rule.disposition !== 'retain' || typeof rule.horizon !== 'number') {
        continue;
      }
      const key = `${rule.table}.${rule.column}`;
      const scoped = retentionScopeColumns(rule);
      if (rule.horizonUnit === 'column') {
        // Scoped by SOMETHING ELSE — the table's declared person key.
        if (scoped?.includes(rule.column)) wrong.push(`${key} (self-scoped)`);
        if (retentionAction(rule) !== 'null_column') {
          wrong.push(`${key} (not an UPDATE)`);
        }
      } else {
        if (!scoped?.includes(rule.column)) {
          wrong.push(`${key} (not self-scoped)`);
        }
        if (retentionAction(rule) !== 'delete_row') {
          wrong.push(`${key} (not a DELETE)`);
        }
        // THE ONE THAT CATCHES THE REAL DEFECT. A row-DELETE scopes BY this
        // column, so this column has to be able to hold a user id. Where the
        // table has told us which columns do — a declared `personKey` — a
        // row-unit horizon on any OTHER column is provably a statement that
        // can never match: `WHERE stripe_customer_id = <a uuid>`.
        //
        // RED RECIPE: flip users.stripe_customer_id to `horizonUnit: 'row'`
        // and this names it. (Tables that declare no personKey — user_reports,
        // billing_* — are not checked here: nothing has said which of their
        // columns locates a person, so there is no fact to check against.)
        const keys = declaredPersonKeys.get(rule.table);
        if (keys && keys.size > 0 && !keys.has(rule.column)) {
          wrong.push(
            `${key} (row horizon on a column the table does not declare as a person key — the DELETE would scope by a value, matching nothing)`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every coverage entry states WHY (a bare claim is not a classification)', () => {
    const bare = COLUMN_COVERAGE.filter((e) => !e.basis?.trim()).map(
      (e) => `${e.table}.${e.column ?? '*'}`,
    );
    expect(bare).toEqual([]);
  });

  it('no rule and no coverage entry names something that no longer exists (drift both ways)', () => {
    const real = new Set(columns.map((c) => `${c.table}.${c.column}`));
    const realTables = new Set(columns.map((c) => c.table));
    const stale = [
      ...PERSON_DATA_RULES.map((r) => `${r.table}.${r.column}`).filter(
        (key) => !real.has(key),
      ),
      ...COLUMN_COVERAGE.filter((e) =>
        e.column === undefined
          ? !realTables.has(e.table)
          : !real.has(`${e.table}.${e.column}`),
      ).map((e) => `${e.table}.${e.column ?? '*'}`),
    ];
    expect(stale).toEqual([]);
  });

  it('`dies_with_row` leans on a real delete_row rule (the claim cannot outlive it)', () => {
    const unsupported = COLUMN_COVERAGE.filter(
      (e) => e.coverage === 'dies_with_row',
    )
      .filter((e) => !dispositionsByTable.get(e.table)?.has('delete_row'))
      .map((e) => `${e.table}.${e.column ?? '*'}`);
    expect(unsupported).toEqual([]);
  });

  it('`lives_with_row` leans on THE NAMED rule that keeps the row', () => {
    // F9504: this used to ask only "does this table have SOME keeping rule?".
    // `users` carries five rules and exactly one of them keeps the row
    // (`user_id: retain`); the other four are `null_column` scrubs. So all
    // sixteen `users` columns passed on the existence of rules that keep
    // nothing, and deleting the ONE that does would not have reddened any of
    // them. The claim now names its keeper and the keeper is resolved.
    expect(unsupportedLivesWithRow(PERSON_DATA_RULES)).toEqual([]);
  });

  it('MUTATION (F9504): removing THE keeper rule reds every column leaning on it', () => {
    // The mutation the weaker check slept through. Drop `users.user_id:retain`
    // — the single rule that keeps the anonymized shell alive — and every
    // `users` column classified "it lives with the row" must say so, because
    // the row it names is no longer kept by anything.
    const without = PERSON_DATA_RULES.filter(
      (r) => !(r.table === 'users' && r.column === 'user_id'),
    );
    const red = unsupportedLivesWithRow(without);
    expect(red.length).toBeGreaterThan(10);
    expect(red).toContain(
      'users.last_sign_in_at (keptBy users.user_id is gone)',
    );
    // And ONLY users: other tables lean on their own keepers.
    expect(red.every((k) => k.startsWith('users.'))).toBe(true);
  });

  it('NO table-level entry may KEEP data — an inherited default must be a safe one', () => {
    // The asymmetry that makes table-level grouping legitimate at all. A
    // table-level entry classifies columns THAT DO NOT EXIST YET, so it is
    // only honest where the default it hands them is safe: `not_person`
    // (nothing about a person can appear on a corpus/ops table unnoticed) and
    // `dies_with_row` (a new column is destroyed with its row regardless).
    // `lives_with_row` and `erased_by_hand` hand a FUTURE column the answer
    // "keep it" / "something already handles it" — which is how a `bio` added
    // to `users` would be born classified and never erased. Exactly the
    // silence the inversion exists to break, so it is unrepresentable.
    const safeToInherit = new Set(['not_person', 'dies_with_row']);
    const overreaching = COLUMN_COVERAGE.filter(
      (e) => e.column === undefined && !safeToInherit.has(e.coverage),
    ).map((e) => `${e.table} (${e.coverage})`);
    expect(overreaching).toEqual([]);
  });

  it('`erased_by_hand` names a handler that still mentions the column', () => {
    // The whole point of this coverage kind is that the mechanism lives
    // OUTSIDE the rule walk. An out-of-band mechanism nothing checks is how
    // `users.email` came to be uncovered in the first place, so the coupling
    // is mechanical: delete the anonymize line and this reds.
    const broken: string[] = [];
    for (const entry of COLUMN_COVERAGE.filter(
      (e) => e.coverage === 'erased_by_hand',
    )) {
      const key = `${entry.table}.${entry.column ?? '*'}`;
      if (!entry.handledBy || !entry.column) {
        broken.push(`${key} (no handledBy)`);
        continue;
      }
      let src: string;
      try {
        src = readFileSync(join(__dirname, entry.handledBy), 'utf8');
      } catch {
        broken.push(`${key} (handler missing: ${entry.handledBy})`);
        continue;
      }
      // CODE, NOT PROSE (F9503). A raw `includes` matches the handler's own
      // COMMENTS — and D148's stash comment re-mentions username, displayName
      // and avatarUrl by name, so deleting the anonymize lines would have left
      // this green on the strength of a sentence describing them. `codeMatches`
      // strips comments first, which is the one thing that makes "the handler
      // still does it" a fact rather than a description.
      const mention = new RegExp(`\\b${snakeToCamel(entry.column)}\\b`);
      if (!codeMatches(mention, src, entry.handledBy)) {
        broken.push(`${key} (handler no longer mentions it in CODE)`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('MUTATION (F9503): a handler that only MENTIONS the column in a comment reds', () => {
    // The defect was live: D148 added a stash comment to
    // account-deletion.service.ts naming username / displayName / avatarUrl in
    // prose, so a raw `includes` would have stayed green with the anonymize
    // WRITES deleted — the census would have been certifying a sentence.
    const handler = readFileSync(
      join(__dirname, '../account-deletion.service.ts'),
      'utf8',
    );
    // `username` is the live instance: the handler names it in PROSE seven
    // times over and above the writes, so a raw `includes` survives deleting
    // every one of the writes.
    const code = stripComments(handler, 'account-deletion.service.ts');
    const count = (src: string) => (src.match(/\busername\b/g) ?? []).length;
    expect(count(handler)).toBeGreaterThan(count(code));

    // THE MUTATION: keep the comments, delete the code. The old check reads
    // this as "the handler still does it"; the code-only one does not.
    const commentsOnly = handler
      .split('\n')
      .filter((l) => l.trim().startsWith('*') || l.trim().startsWith('//'))
      // Re-marked as line comments: a `*` continuation lifted out of its
      // enclosing `/** … */` is no longer a comment to any parser.
      .map((l) => `// ${l.trim().replace(/^[*/]+ ?/, '')}`)
      .join('\n');
    expect(commentsOnly).toContain('username');
    expect(codeMatches(/\busername\b/, commentsOnly)).toBe(false);

    // …while the real handler passes on CODE, and the strip is not just
    // blanking the file (an empty strip would fail everything, not pass it).
    expect(codeMatches(/\busername\b/, handler)).toBe(true);
    expect(code.length).toBeGreaterThan(1000);
  });

  it('every `sever` rule targets a NULLABLE column — a declaration that cannot be executed is a lie', () => {
    // RED-proof for a real defect (2026-08-03): seven `sever` rules targeted
    // NOT NULL columns (photos.user_id, poll_comments.user_id,
    // messages.sender_user_id, ...). The declaration read correctly and could
    // not run. Those are now `anonymized_by_shell`, which names the mechanism
    // that actually provides their anonymity.
    const byKey = new Map(
      columns.map((c) => [`${c.table}.${c.column}`, c.optional]),
    );
    const notNullable = PERSON_DATA_RULES.filter(
      (r) => r.disposition === 'sever',
    )
      .map((r) => `${r.table}.${r.column}`)
      .filter((key) => byKey.get(key) === false);
    expect(notNullable).toEqual([]);
  });

  it('QUARANTINE: every awaiting_owner entry is a complete question (and is reported)', () => {
    const quarantined = COLUMN_COVERAGE.filter(
      (e) => e.coverage === 'awaiting_owner',
    );
    // Incomplete quarantine is worse than none: "we're not sure" without what
    // the writer puts there or what we'd recommend is not a question anyone
    // can answer, so it would sit forever.
    const incomplete = quarantined
      .filter((e) => !e.writer?.trim() || !e.recommendation?.trim())
      .map((e) => `${e.table}.${e.column ?? '*'}`);
    expect(incomplete).toEqual([]);

    // Printed on EVERY run, deliberately. A quarantine nobody sees becomes a
    // permanent classification by default — the silence this design exists to
    // prevent, one level up.

    console.warn(
      `\nPERSON DATA — ${quarantined.length} column(s) AWAITING OWNER CLASSIFICATION:\n` +
        quarantined
          .map((e) => `  • ${e.table}.${e.column ?? '*'} — ${e.basis}`)
          .join('\n') +
        '\n',
    );
  });

  it('THE MUTATION PROOF: an unclassified new column is named and fails', () => {
    // The inversion's whole claim is that a column matching NO person-shaped
    // pattern still cannot hide. `bio` is exactly the shape the old
    // reference-column net was blind to, so it is the right mutation.
    const mutated: SchemaColumn[] = [
      ...columns,
      { table: 'users', column: 'bio', optional: true },
      { table: 'core_entities', column: 'phone_number', optional: true },
    ];
    const unclassified = mutated
      .filter((c) => !declared.has(`${c.table}.${c.column}`))
      .filter((c) => !coverageFor(c.table, c.column))
      .map((c) => `${c.table}.${c.column}`);

    // NOTE the second one: `core_entities` is covered TABLE-level as
    // not_person, so a new column there is covered by inheritance and does
    // NOT red. That is the deliberate trade of table-level grouping — and it
    // is why a table that could ever hold a person is never covered at table
    // level as not_person, only as dies_with_row / lives_with_row, where the
    // row's fate is the correct default for a new column on it.
    expect(unclassified).toEqual(['users.bio']);
  });
});
