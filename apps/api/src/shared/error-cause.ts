/**
 * Full cause chain of an error, newest first ("wrapper <- cause <- root").
 *
 * Loud-RED doctrine (archive-load audit §5): a persisted failure record must
 * carry enough to attribute WITHOUT a repro. Generic wrappers that stringify
 * only their own message ("LLM output processing failed for batch X") cost
 * hours of foreground-repro archaeology during the stage-2 load — twice.
 * Every site that persists or aggregates an error message uses this instead
 * of `error.message`.
 */
export function buildCauseChain(error: unknown): string {
  const parts: string[] = [];
  let cursor: unknown = error;
  let depth = 0;
  while (cursor && depth < 8) {
    parts.push(
      cursor instanceof Error ? cursor.message : JSON.stringify(cursor),
    );
    cursor = cursor instanceof Error ? cursor.cause : undefined;
    depth += 1;
  }
  return parts.join(' <- ').slice(0, 4000);
}
