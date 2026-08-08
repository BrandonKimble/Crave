/**
 * EVERY FOREIGN KEY'S REFERENCING COLUMNS ARE INDEXED.
 *
 * Postgres indexes the PARENT side of a foreign key for free — it has to, to
 * enforce the reference. It never indexes the CHILD side. So a DELETE or key
 * UPDATE on the parent fires a referential-integrity trigger that has no index
 * to use, and sequentially scans the child once per foreign key, per row.
 *
 * THE INCIDENT. `poll_topics` carried four un-indexed foreign keys to
 * `core_entities`: 96,025 sequential scans over 18,284 rows — 24,006 per key,
 * four per deleted entity, remainder exactly zero — and 624 million tuples
 * read. Nothing was broken, nothing logged, no test went red. Entity deletion
 * is already the expensive operation in this codebase (the ~$118 Austin-wipe
 * lesson) and it had been paying a quadratic trigger tax on top the whole time.
 *
 * WHY THIS CHECKS THE SCHEMA AND NOT THE DATABASE. A live-database check can
 * only find the defect after someone has already shipped and applied it, and
 * it cannot run in CI without a database. `schema.prisma` is where the foreign
 * key is DECLARED, so that is where the rule belongs: the guard fails while
 * the model is still being written, and its mutations are ordinary file edits
 * that the invariant registry can prove make it fail.
 *
 * A referencing column set counts as indexed when it is a PREFIX of any index
 * on the model — @@index, @@unique, @@id, or a field-level @unique/@id — since
 * Postgres can use a leading subset of a composite index. Order matters: an
 * index on (b, a) does NOT serve a foreign key on (a).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

type Model = { name: string; body: string; line: number };

const SCHEMA =
  process.env.PRISMA_SCHEMA_PATH ??
  join(__dirname, '..', 'prisma', 'schema.prisma');

const parseModels = (source: string): Model[] => {
  const models: Model[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const start = /^model\s+(\w+)\s*\{/.exec(lines[i]);
    if (!start) continue;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== '}') end += 1;
    models.push({
      name: start[1],
      body: lines.slice(i + 1, end).join('\n'),
      line: i + 1,
    });
    i = end;
  }
  return models;
};

/** Every column list that has an index whose LEADING columns are that list. */
const indexPrefixes = (body: string): string[][] => {
  const prefixes: string[][] = [];
  const block = /@@(?:index|unique|id)\(\s*(?:fields:\s*)?\[([^\]]+)\]/g;
  for (const m of body.matchAll(block)) {
    prefixes.push(m[1].split(',').map((f) => f.trim().split('(')[0]));
  }
  // Field-level @id / @unique are single-column indexes.
  for (const line of body.split('\n')) {
    const field = /^\s+(\w+)\s+\S+.*@(?:id|unique)\b/.exec(line);
    if (field && !line.includes('@@')) prefixes.push([field[1]]);
  }
  return prefixes;
};

const isIndexed = (fields: string[], prefixes: string[][]): boolean =>
  prefixes.some(
    (prefix) =>
      prefix.length >= fields.length &&
      fields.every((field, i) => prefix[i] === field),
  );

const main = (): void => {
  const source = readFileSync(SCHEMA, 'utf8');
  const violations: string[] = [];

  for (const model of parseModels(source)) {
    const prefixes = indexPrefixes(model.body);
    const relation = /@relation\([^)]*fields:\s*\[([^\]]+)\]/g;
    for (const m of model.body.matchAll(relation)) {
      const fields = m[1].split(',').map((f) => f.trim());
      if (fields.length === 0 || fields[0] === '') continue;
      if (!isIndexed(fields, prefixes)) {
        violations.push(
          `  ${model.name}: relation on [${fields.join(', ')}] has no index whose leading columns are [${fields.join(', ')}]`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `\nUN-INDEXED FOREIGN KEY${violations.length === 1 ? '' : 'S'} (${violations.length}):\n\n${violations.join('\n')}\n\n` +
        `Postgres does not index the child side of a foreign key. Without one, every\n` +
        `parent DELETE or key UPDATE sequentially scans this table once per key, per\n` +
        `row. Add @@index([...]) on the referencing columns, in that order.\n`,
    );
    process.exit(1);
  }

  console.log(
    'Every foreign key in schema.prisma has an index on its referencing columns.',
  );
};

main();
