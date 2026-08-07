import type { UsernameAvailability } from './users';

/**
 * An availability answer AND the draft it answered for (F5804).
 *
 * The defect this shape exists to make unrepresentable: EditProfilePanel stored the bare
 * `UsernameAvailability` and never cleared it when the draft changed. Between keystroke and
 * settle — type 'ada', wait for available:true, type 'm' — the state still held 'ada''s
 * answer, so `available === true && normalized !== currentUsername` was TRUE for 'adam',
 * Save enabled, and pressing it called claimUsername('adam') on 'ada''s evidence. The caption
 * was wrong in the same window: the field read 'adam' while the panel rendered
 * '@ada is available'. The server was the backstop, so the outcome was a confusing failure
 * rather than a wrong claim — but the client was asserting something it did not know.
 *
 * Clearing the answer on every draft change would have been a guard: correct only as long as
 * every future writer remembers to add itself to it. Carrying the QUESTION with the ANSWER is
 * not a guard — an answer to a different question is structurally not an answer here, and
 * there is no code path that can forget.
 */
export type UsernameAvailabilityAnswer = {
  /** The normalized draft this answer was requested for. */
  forNormalized: string;
  result: UsernameAvailability;
};

/**
 * The answer — but only if it answered the draft being asked about. A mismatch reads exactly
 * like no answer at all, which is the truth: the check for this draft has not come back.
 */
export const availabilityAnswerFor = (
  answer: UsernameAvailabilityAnswer | null,
  normalized: string
): UsernameAvailability | null =>
  answer != null && answer.forNormalized === normalized ? answer.result : null;

/**
 * Whether the current draft is a name the user can claim: the server said this exact draft is
 * available, and it is not already theirs.
 */
export const isUsernameClaimable = (
  answer: UsernameAvailabilityAnswer | null,
  normalized: string,
  currentUsername: string | null
): boolean =>
  availabilityAnswerFor(answer, normalized)?.available === true && normalized !== currentUsername;
