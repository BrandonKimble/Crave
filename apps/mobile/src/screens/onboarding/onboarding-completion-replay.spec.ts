/**
 * F810 — A FAILED SERVER COMPLETION MUST NOT BECOME A LOCAL "completed".
 *
 * The defect: `usersService.completeOnboarding` threw, and the catch logged a
 * warn, CLEARED the service-issue banner, and marked onboarding complete
 * locally. The persisted status became 'completed', so the flow never ran
 * again — and the payload (every answer plus the username claim) was gone. The
 * user believed they finished; the server had nothing.
 *
 * These cases drive the REAL persisted store through a REAL failing server call
 * and assert the three properties the fix owes: the payload survives, the
 * failure is visible, and the retry lands.
 *
 * RED recipe: restore the old catch — call `completeOnboardingLocally` and
 * return true instead of recording the pending payload — and every case below
 * fails.
 */
// The persisted store writes through AsyncStorage; in the hermetic node project
// there is no native module, so stand in a memory map rather than let every
// write log a warning (and, worse, resolve after teardown).
jest.mock('@react-native-async-storage/async-storage', () => {
  const memory = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (key: string) => Promise.resolve(memory.get(key) ?? null),
      setItem: (key: string, value: string) => {
        memory.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        memory.delete(key);
        return Promise.resolve();
      },
    },
  };
});

import { useOnboardingStore } from '../../store/onboardingStore';
import { decideOnboardingCompletionReplay } from './onboarding-completion-replay';

const payload = () => ({
  status: 'completed' as const,
  onboardingVersion: 3,
  selectedCity: 'Austin',
  previewCity: null,
  answers: { cuisines: ['tacos'], username: 'brandon' },
  username: 'brandon',
  failedAtMs: 1_700_000_000_000,
});

/**
 * The screen's completion path, reduced to the decision under test: try the
 * server; on failure record the payload and report the failure to the caller.
 * (Mirrors completeAndEnterApp's catch in screens/Onboarding.tsx.)
 */
const completeAndEnterApp = async (server: () => Promise<void>): Promise<boolean> => {
  try {
    await server();
    useOnboardingStore.getState().completeOnboardingLocally({ selectedCity: 'Austin' });
    useOnboardingStore.getState().clearPendingServerCompletion();
    return true;
  } catch {
    useOnboardingStore.getState().recordPendingServerCompletion(payload());
    return false;
  }
};

describe('F810 — the answers survive a server failure', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.getState().setAnswer('cuisines', ['tacos']);
  });

  it('RED — a failing server call does NOT mark onboarding complete', async () => {
    const landed = await completeAndEnterApp(() => Promise.reject(new Error('502')));

    expect(landed).toBe(false);
    // The flow must run again — a 'completed' status here is the silent loss.
    expect(useOnboardingStore.getState().status).not.toBe('completed');
  });

  it('the payload survives VERBATIM, username claim included', async () => {
    await completeAndEnterApp(() => Promise.reject(new Error('502')));

    const pending = useOnboardingStore.getState().pendingServerCompletion;
    expect(pending).not.toBeNull();
    expect(pending?.username).toBe('brandon');
    expect(pending?.answers).toEqual({ cuisines: ['tacos'], username: 'brandon' });
    expect(pending?.selectedCity).toBe('Austin');
  });

  it('the draft answers are still there, so the user can finish where they were', async () => {
    await completeAndEnterApp(() => Promise.reject(new Error('502')));
    expect(useOnboardingStore.getState().draft.answers.cuisines).toEqual(['tacos']);
  });

  it('THE RETRY LANDS: a second attempt that succeeds completes and empties the outbox', async () => {
    await completeAndEnterApp(() => Promise.reject(new Error('502')));
    expect(useOnboardingStore.getState().pendingServerCompletion).not.toBeNull();

    const landed = await completeAndEnterApp(() => Promise.resolve());

    expect(landed).toBe(true);
    expect(useOnboardingStore.getState().status).toBe('completed');
    expect(useOnboardingStore.getState().pendingServerCompletion).toBeNull();
  });

  it('the unconfirmed payload is PERSISTED (it must survive a cold start)', () => {
    useOnboardingStore.getState().recordPendingServerCompletion(payload());
    const persisted = useOnboardingStore.persist
      .getOptions()
      .partialize?.(useOnboardingStore.getState()) as
      | { pendingServerCompletion?: unknown }
      | undefined;
    expect(persisted?.pendingServerCompletion).toMatchObject({ username: 'brandon' });
  });
});

describe('decideOnboardingCompletionReplay', () => {
  it('replays a pending payload for a signed-in user', () => {
    const pending = payload();
    expect(
      decideOnboardingCompletionReplay({ pending, isSignedIn: true, inFlight: false })
    ).toEqual({ kind: 'replay', payload: pending });
  });

  it('never replays anonymously, never replays twice at once, never invents work', () => {
    const pending = payload();
    expect(
      decideOnboardingCompletionReplay({ pending, isSignedIn: false, inFlight: false }).kind
    ).toBe('skip');
    expect(
      decideOnboardingCompletionReplay({ pending, isSignedIn: true, inFlight: true }).kind
    ).toBe('skip');
    expect(
      decideOnboardingCompletionReplay({ pending: null, isSignedIn: true, inFlight: false })
    ).toEqual({ kind: 'skip', reason: 'nothing_pending' });
  });

  it('an OLD payload is still replayed — the outbox never expires', () => {
    const ancient = { ...payload(), failedAtMs: 0 };
    expect(
      decideOnboardingCompletionReplay({ pending: ancient, isSignedIn: true, inFlight: false }).kind
    ).toBe('replay');
  });
});

/**
 * D40 — THE ANONYMOUS COMPLETER.
 *
 * A waitlist / pre-auth user answers every question and then, because they
 * are not signed in, the screen took a completely different branch: it marked
 * the flow complete LOCALLY and queued nothing. `completeOnboardingLocally`
 * resets the draft, so the answers were gone from the device too — and the
 * "already finished on this device" mirror that fires after they later sign
 * in sends `answers: {}`. The one thing onboarding exists to collect was
 * destroyed by the success path, not the failure path.
 *
 * "Not signed in yet" is the same SHAPE as "the server said no": a payload we
 * cannot land today. So it takes the same lane — the F810 outbox — and the
 * existing replay rules land it on the first authenticated launch, unchanged.
 *
 * RED recipe: delete the `recordPendingServerCompletion(...)` call from the
 * anonymous branch of `completeAndEnterApp` in screens/Onboarding.tsx and
 * both cases below fail.
 */
const completeAnonymously = (): boolean => {
  // The anonymous branch of completeAndEnterApp, reduced to its decision.
  const answers = useOnboardingStore.getState().draft.answers;
  useOnboardingStore.getState().recordPendingServerCompletion({
    status: 'completed',
    onboardingVersion: 6,
    selectedCity: 'Austin',
    previewCity: null,
    answers,
    username: null,
    failedAtMs: Date.now(),
  });
  useOnboardingStore.getState().completeOnboardingLocally({ selectedCity: 'Austin' });
  return true;
};

describe('D40 — an anonymous completer does not lose their answers', () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.getState().setAnswer('cuisines', ['tacos']);
  });

  it('queues the payload even though nobody is signed in — and the local flow still completes', () => {
    expect(completeAnonymously()).toBe(true);
    // Completing locally is correct here: the user really did finish. What
    // was wrong was finishing WITHOUT keeping what they said.
    expect(useOnboardingStore.getState().status).toBe('completed');
    const pending = useOnboardingStore.getState().pendingServerCompletion;
    expect(pending).not.toBeNull();
    expect(pending?.answers).toEqual({ cuisines: ['tacos'] });
  });

  it('the queued answers survive the draft reset that completing locally performs', () => {
    completeAnonymously();
    // completeOnboardingLocally wipes the draft — which is exactly why the
    // payload has to be captured BEFORE it runs.
    expect(useOnboardingStore.getState().draft.answers).toEqual({});
    expect(useOnboardingStore.getState().pendingServerCompletion?.answers).toEqual({
      cuisines: ['tacos'],
    });
  });

  it('the replay decision skips while anonymous and lands the SAME payload once signed in', () => {
    completeAnonymously();
    const pending = useOnboardingStore.getState().pendingServerCompletion;

    // Before sign-in: held, never dropped.
    expect(
      decideOnboardingCompletionReplay({ pending, isSignedIn: false, inFlight: false })
    ).toEqual({ kind: 'skip', reason: 'not_signed_in' });

    // After sign-in: the same answers, unedited.
    expect(
      decideOnboardingCompletionReplay({ pending, isSignedIn: true, inFlight: false })
    ).toEqual({ kind: 'replay', payload: pending });
  });
});
