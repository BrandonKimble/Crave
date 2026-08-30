/**
 * The sentence of `text` containing `surface` — the verbatim evidence the
 * identity judge reads under the D2 context standard ("no. 16 noodles" is
 * menu numbering; "soto omakase" is Soto's omakase). Deterministic string
 * work: case-insensitive locate, expand to sentence punctuation/newlines,
 * cap the excerpt. Null when the surface is not literally present (never
 * invent provenance). Pure module so the behavior is unit-testable without
 * dragging the processing service's dependency graph.
 */
export function mentionSentenceOf(
  text: string | undefined,
  surface: string,
): string | null {
  const needle = surface.trim().toLowerCase();
  if (!text || !needle) return null;
  const haystack = text.toLowerCase();
  const at = haystack.indexOf(needle);
  if (at < 0) return null;
  const bounds = /[.!?\n]/;
  let start = at;
  while (start > 0 && !bounds.test(text[start - 1])) start -= 1;
  let end = at + needle.length;
  while (end < text.length && !bounds.test(text[end])) end += 1;
  const sentence = text
    .slice(start, Math.min(end + 1, text.length))
    .replace(/\s+/g, ' ')
    .trim();
  if (!sentence) return null;
  // Cap: enough sentence to resolve a reference, never a whole post.
  return sentence.length > 320 ? `${sentence.slice(0, 320)}…` : sentence;
}
