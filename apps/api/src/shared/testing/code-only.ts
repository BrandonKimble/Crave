/**
 * Strip comments before a source scanner reads it.
 *
 * WHY THIS IS SHARED (red team 2026-08-02). Three separate guard specs written
 * in one session were satisfied by PROSE rather than code:
 *
 *   - The Gemini paid-surface scanner required `assertSpendBudgetOpen` inside
 *     the enclosing method. A COMMENT sixteen lines above the call already
 *     contained that string, so the gate on `models.generateContent` — the
 *     main generation path — could be deleted outright and the guard stayed
 *     green.
 *   - The demand-mass guard accepted a SQL comment standing in for the
 *     filter it was supposed to require.
 *   - The timestamp-frame scanner truncated at a backtick inside a SQL comment.
 *
 * A scanner that reads a comment as an implementation is not a guard; it is a
 * search for the word we hoped to find. One of the specs in that same session
 * had already solved this locally — this is that helper, hoisted, so the next
 * scanner gets it by construction instead of by whoever remembers.
 *
 * Deliberately simple: line comments, block comments, and JSDoc. It does not
 * try to respect comment markers inside string literals, because over-
 * stripping makes a guard STRICTER (it can only fail more), which is the safe
 * direction for a test whose job is to catch omissions.
 */
export function codeOnly(source: string): string {
  return (
    source
      // Block and JSDoc comments, including multi-line.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Line comments, and SQL `--` comments inside template literals.
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').replace(/--.*$/, ''))
      .join('\n')
  );
}
