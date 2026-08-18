/**
 * A WIPE THAT DELETES SCORES MUST FIRE THE RESCORE (lens-2 residual,
 * 2026-08-17; invariant scores.a-wipe-fires-the-rescore).
 *
 * The rescore runs only on rescore_state.dirty. wipe-city-derived.sql is the
 * named lifecycle tool that deletes core_public_entity_scores rows; if it
 * does not set the flag in the same transaction, the app serves a silently
 * short score table until an unrelated collection batch happens to mark
 * dirty — the incident's exact state. This check reads the wipe script and
 * requires: every DELETE touching core_public_entity_scores is followed,
 * before the COMMIT, by an UPDATE rescore_state that sets dirty = true.
 *
 * Exit 0 = the law holds. Exit 1 = it does not (or the script no longer
 * deletes scores at all, which means this check's subject moved — a proof
 * that quietly stops applying is a hard failure, not a skip).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const file = join(__dirname, 'reload', 'wipe-city-derived.sql');
const sql = readFileSync(file, 'utf8');

const deleteIdx = sql.indexOf('DELETE FROM core_public_entity_scores');
if (deleteIdx === -1) {
  console.error(
    `RED: ${file} no longer deletes core_public_entity_scores — this check's subject moved; re-derive the invariant.`,
  );
  process.exit(1);
}

const commitIdx = sql.indexOf('COMMIT', deleteIdx);
const tail = sql.slice(deleteIdx, commitIdx === -1 ? undefined : commitIdx);

const firesRescore = /UPDATE\s+rescore_state\s+SET\s+dirty\s*=\s*true/i.test(
  tail,
);

if (!firesRescore) {
  console.error(
    `RED: ${file} deletes core_public_entity_scores without setting rescore_state.dirty before COMMIT — the wipe must fire the machinery it invalidates.`,
  );
  process.exit(1);
}

console.log('wipe-city-derived.sql fires the rescore it makes necessary.');
