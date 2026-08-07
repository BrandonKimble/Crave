/**
 * THE one client-side username normalization (F5805). It sits beside the users service whose
 * `checkUsername`/`claimUsername` it feeds, in its own module so it carries no transport
 * dependencies — users.ts pulls axios and expo-constants, which the hermetic node test
 * project cannot load, and a rule nobody can test is a rule that drifts again.
 *
 * It used to have three homes: UsernameService.normalize on the server
 * (`raw.trim().toLowerCase().replace(/\s+/g, '')`), a byte-for-byte restatement in
 * EditProfilePanel under a comment conceding the duplication, and Onboarding's copy which
 * ALSO stripped '@'. The drift was user-visible on exactly the field that invites the
 * character: EditProfilePanel's placeholder renders `@{currentUsername}`, so a user who
 * typed the '@' sent it to the server and was told the name was unavailable, while the
 * identical keystrokes during onboarding succeeded.
 *
 * THE '@' DECISION, made once and stated: STRIP IT. The server's USERNAME_REGEX is
 * `^[a-z][a-z0-9]*([._]?[a-z0-9]+)*$` — '@' is not in the alphabet at any position, so a
 * leading '@' can never be part of a name the server would accept. Stripping is therefore
 * lossless (it can only turn a guaranteed rejection into the name the user meant) and it is
 * the answer the '@'-prefixed placeholder promises. The server does NOT strip it, which is
 * correct: this is input sanitisation the field's own affordance requires, not a second
 * opinion about what a username is.
 *
 * What this is NOT: an authority on whether a name is VALID or FREE. Those answers come from
 * the server, and `UsernameAvailability.normalized` is its spelling — prefer it once you have it.
 */
export const normalizeUsernameDraft = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, '').replace(/@/g, '');
