/**
 * THE SCANNER THAT KEEPS THE REGISTRY HONEST (redteam-l2 K2).
 *
 * applyPlan's exhaustiveness used to be a doc-comment claim; it went false
 * the commit `knowledge_cuisines` landed. Now every `uuid[]` column in
 * schema.prisma must be classified: either registered in
 * ATTRIBUTE_ID_ARRAY_COLUMNS (adjudication repoints/strips it) or listed in
 * NON_ATTRIBUTE_UUID_ARRAY_COLUMNS (seen, ruled non-attribute). An
 * unclassified column fails this spec — a new uuid[] array cannot be
 * silently invisible to the judge.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ATTRIBUTE_ID_ARRAY_COLUMNS,
  NON_ATTRIBUTE_UUID_ARRAY_COLUMNS,
} from './attribute-reference-registry';

function uuidArrayColumnsInSchema(): string[] {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );
  const results: string[] = [];
  let currentTable: string | null = null;
  let modelFields: Array<{ field: string; mapped: string }> = [];
  let inModel = false;
  let modelName: string | null = null;
  for (const line of schema.split('\n')) {
    const modelStart = line.match(/^model\s+(\w+)\s*\{/);
    if (modelStart) {
      inModel = true;
      modelName = modelStart[1];
      currentTable = null;
      modelFields = [];
      continue;
    }
    if (!inModel) continue;
    const mapMatch = line.match(/^\s*@@map\("([^"]+)"\)/);
    if (mapMatch) {
      currentTable = mapMatch[1];
      continue;
    }
    if (/^\}/.test(line)) {
      const table = currentTable ?? modelName ?? '';
      for (const { mapped } of modelFields) {
        results.push(`${table}.${mapped}`);
      }
      inModel = false;
      continue;
    }
    const fieldMatch = line.match(/^\s*(\w+)\s+String\[\]/);
    if (fieldMatch && line.includes('@db.Uuid')) {
      const columnMap = line.match(/@map\("([^"]+)"\)/);
      modelFields.push({
        field: fieldMatch[1],
        mapped: columnMap ? columnMap[1] : fieldMatch[1],
      });
    }
  }
  return results;
}

describe('attribute-reference-registry', () => {
  const registered = new Set(
    Object.values(ATTRIBUTE_ID_ARRAY_COLUMNS)
      .flat()
      .map((site) => `${site.table}.${site.column}`),
  );

  it('classifies every uuid[] column in the schema', () => {
    const columns = uuidArrayColumnsInSchema();
    // Sanity: the scanner itself must see the known columns, or it has
    // rotted into an always-green metric.
    expect(columns).toEqual(
      expect.arrayContaining([
        'core_entities.restaurant_attributes',
        'core_entities.knowledge_cuisines',
        'core_restaurant_items.food_attributes',
      ]),
    );
    const unclassified = columns.filter(
      (column) =>
        !registered.has(column) &&
        !NON_ATTRIBUTE_UUID_ARRAY_COLUMNS.has(column),
    );
    expect(unclassified).toEqual([]);
  });

  it('has no column classified both ways', () => {
    const both = [...registered].filter((column) =>
      NON_ATTRIBUTE_UUID_ARRAY_COLUMNS.has(column),
    );
    expect(both).toEqual([]);
  });
});
