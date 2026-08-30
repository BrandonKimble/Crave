/**
 * THE REVIEWED WIDENING VERDICT TABLE (acceptance red team 2026-08-30,
 * docket determinism): the dry-run's JSON output is --apply's REQUIRED
 * input. Apply never re-judges — temperature-0 verdicts drift run-to-run on
 * exactly the marginal pairs the owner reviews, so the table he signed off
 * must be the table that binds. This module is the pure contract half
 * (shape + refusal rules), testable without booting the app; the script
 * and WideningSatisfiesService.settleReviewedVerdicts do the I/O.
 */
import { createHash } from 'crypto';
import type { WideningHearingRow } from './widening-satisfies.service';

export interface WideningVerdictTable {
  generatedAt: string;
  ruleVersions: { attribute: number; ingredient: number };
  rows: WideningHearingRow[];
}

export interface WideningRuleVersions {
  attribute: number;
  ingredient: number;
}

/** sha256 of the reviewed file's exact bytes — stamped into every ledger
 *  row's subject so each verdict names the table that authorized it. */
export function wideningTableSha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The refusal rules, in one place:
 *  - no file given → refuse (an apply that judged its own docket would
 *    write verdicts nobody reviewed);
 *  - rule versions in the table differ from the current rules → refuse
 *    (a rule bump between review and apply re-opens every verdict — the
 *    review is stale).
 * Returns the human-readable refusal, or null when the apply may proceed.
 */
export function wideningApplyRefusal(
  verdictFile: string | undefined,
  table: WideningVerdictTable | null,
  current: WideningRuleVersions,
): string | null {
  if (!verdictFile) {
    return (
      'REFUSED: --apply requires the reviewed verdict table:\n' +
      '  widening-docket.ts --apply <verdicts.json>\n' +
      'Run the dry-run first; it writes the table for review.'
    );
  }
  if (!table || !Array.isArray(table.rows)) {
    return `REFUSED: ${verdictFile} is not a widening verdict table (no rows array).`;
  }
  if (
    table.ruleVersions?.attribute !== current.attribute ||
    table.ruleVersions?.ingredient !== current.ingredient
  ) {
    return (
      `REFUSED: the reviewed table was judged under rule versions ` +
      `${JSON.stringify(table.ruleVersions)} but the current rules are ` +
      `${JSON.stringify(current)} — re-run the dry-run and review afresh ` +
      `(a rule bump re-opens every verdict).`
    );
  }
  return null;
}
