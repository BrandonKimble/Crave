/**
 * @script-class: gate
 * @run-by: yarn invariants (identity.merge-group-sites-carry-the-accent-veto)
 *
 * GATE: every identity_key-GROUPED MERGE carries the accent veto.
 *
 * THE LAW (entity-identity.ts, accentsAgreeUnbanked): canonicalFold strips
 * tone marks, so two DIFFERENT names — "Cơm Chay" / "Cơm Cháy", bò / bó —
 * agree on the folded identity_key. Any code that GROUPS rows by that key to
 * MERGE them is therefore proposing to fuse entities the fold cannot tell
 * apart, and must run the whole-string accent veto over each proposed group
 * before acting. The two merge lanes (restaurant-entity-merge,
 * food-dedupe-merge) both do; this gate is what makes the third one do it
 * too, the day it is written.
 *
 * WHAT COUNTS AS A MERGE-GROUP SITE (deliberately narrow, so search-recall
 * joins don't false-positive): SQL containing `GROUP BY identity_key`, or a
 * PAIR-JOIN of the sorted key (`x.identity_key_sorted = y.identity_key_sorted`).
 * A parameter equality (`identity_key_sorted = ${key}`) is a lookup, not a
 * merge, and is out of scope — the resolver's own tiers carry their veto.
 *
 * PASS = the file also names one of the veto functions. RED PROOF: a scratch
 * file with `GROUP BY identity_key` and no veto reference exits 1.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../src');
const MERGE_GROUP = /GROUP BY identity_key\b/;
const PAIR_JOIN = /\w+\.identity_key_sorted\s*=\s*\w+\.identity_key_sorted/;
const VETO = /accentsAgreeUnbanked|accentAdmits|accentVetoed|placeNamesAgree/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC);
if (files.length === 0) {
  console.error('FAIL: scanned zero files — the scan itself is broken.');
  process.exit(1);
}
const failures: string[] = [];
let sites = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf-8');
  if (!MERGE_GROUP.test(text) && !PAIR_JOIN.test(text)) continue;
  sites += 1;
  if (!VETO.test(text)) {
    failures.push(file);
  }
}
if (sites === 0) {
  console.error(
    'FAIL: found zero merge-group sites — either every merge lane vanished ' +
      'or the patterns rotted; both need a human.',
  );
  process.exit(1);
}
if (failures.length) {
  console.error(
    'FAIL: identity_key-grouped merge without an accent veto — the fold ' +
      'cannot tell tone-differing names apart; run accentsAgreeUnbanked ' +
      '(entity-identity.ts) over each proposed group:',
  );
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`OK: ${sites} merge-group site(s), every one carries the veto.`);
