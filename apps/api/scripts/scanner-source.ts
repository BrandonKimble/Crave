/**
 * SOURCE AS THE COMPILER SEES IT — the scanners' entry point.
 *
 * THE IMPLEMENTATION IS NOT HERE (F3911, 2026-08-06). It lives in
 * `src/shared/testing/code-only.ts`, and that file's header carries the whole
 * argument: why guards match stripped source, the bias the strip takes when it
 * cannot tell what it is looking at, and why the regex-literal state exists
 * (F3910 — `/^https?:\/\//` used to trip the `//` branch and blank the rest of
 * its line, hiding a real call from the guard).
 *
 * This module used to be a SECOND stripper with the OPPOSITE documented bias
 * from that one, neither citing the other, the two already disagreeing about
 * `--` inside template literals. Two hand-rolled solutions to one problem is
 * the pattern this exercise polices; keeping the guard tooling exempt from it
 * was never defensible. The re-export stays so the two CI scanners
 * (`check-author-identity.ts`, `check-subject-text-emission.ts`) keep their
 * one entry point and cannot go back to matching prose.
 */
export { codeMatches, stripComments } from '../src/shared/testing/code-only';
