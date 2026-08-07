/**
 * F5804 discriminator — an availability answer belongs to the draft it answered for.
 *
 * THE SCENARIO, which is the row's proving mutation in model form: type 'ada', let the check
 * settle available:true, then type 'm'. Before the fix, `availability` still held 'ada''s
 * answer with nothing tying it to 'ada', so Save armed for 'adam' and the caption claimed
 * '@ada is available' under a field reading 'adam'.
 *
 * PROVING MUTATION: drop the key — make `availabilityAnswerFor` return `answer?.result ?? null`
 * (ignoring `forNormalized`) and the stale-draft cases below go RED.
 *
 * (The mobile jest project has no react-test-renderer, so the panel itself cannot be typed
 * into here; the state model it now holds is the thing under test, and the panel holds nothing
 * else — `availability` is exactly this pair and both readers go through these two functions.)
 */
import {
  availabilityAnswerFor,
  isUsernameClaimable,
  type UsernameAvailabilityAnswer,
} from './username-availability-answer';

const answerFor = (normalized: string, available: boolean): UsernameAvailabilityAnswer => ({
  forNormalized: normalized,
  result: { normalized, available, reason: available ? 'ok' : 'taken', suggestions: [] },
});

const ADA_IS_AVAILABLE = answerFor('ada', true);

describe('availabilityAnswerFor', () => {
  it('returns the answer to the question actually asked', () => {
    expect(availabilityAnswerFor(ADA_IS_AVAILABLE, 'ada')).toBe(ADA_IS_AVAILABLE.result);
  });

  it('reads as NO ANSWER once the draft has moved on', () => {
    // The caption renders from this: nothing is shown while 'adam''s check is in flight.
    expect(availabilityAnswerFor(ADA_IS_AVAILABLE, 'adam')).toBeNull();
  });

  it('reads as no answer for the empty draft', () => {
    expect(availabilityAnswerFor(ADA_IS_AVAILABLE, '')).toBeNull();
  });

  it('reads as no answer when nothing has been asked', () => {
    expect(availabilityAnswerFor(null, 'ada')).toBeNull();
  });
});

describe('isUsernameClaimable', () => {
  it('arms for the draft the server actually cleared', () => {
    expect(isUsernameClaimable(ADA_IS_AVAILABLE, 'ada', 'oldname')).toBe(true);
  });

  it('does NOT arm for a later draft on an earlier draft-s answer', () => {
    // The whole finding: type 'ada', settle, type 'm' -> Save must stay disabled.
    expect(isUsernameClaimable(ADA_IS_AVAILABLE, 'adam', 'oldname')).toBe(false);
  });

  it('does not arm on a taken name', () => {
    expect(isUsernameClaimable(answerFor('ada', false), 'ada', 'oldname')).toBe(false);
  });

  it('does not arm when the available name is already the user-s own', () => {
    expect(isUsernameClaimable(ADA_IS_AVAILABLE, 'ada', 'ada')).toBe(false);
  });

  it('does not arm before any answer has arrived', () => {
    expect(isUsernameClaimable(null, 'ada', 'oldname')).toBe(false);
  });
});
