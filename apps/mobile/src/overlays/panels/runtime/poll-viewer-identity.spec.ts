// FALSIFIERS FOR THE LIFTED VIEWER IDENTITY (touch-latency rung #1).
//
// Three properties, each with a mutation that turns it RED:
//   1. exactly ONE profile subscription per rendered leg, whatever the row count
//      (mutation: reinstate the per-card hook -> RED)
//   2. an unrelated profile field changing does not re-render rows
//      (mutation: publish the whole profile object -> RED)
//   3. the viewer avatar still reaches the rows (the behaviour the hook served)
//
// PURE LANE, deliberately. This project is *.spec.ts only — no React, no RN (see
// jest.config.js). That is not a limitation here: a row re-render under
// useSyncExternalStore IS a listener notification, so asserting on notifications
// asserts the property directly rather than through a renderer. Property (1) is
// about which modules hold a subscription at all, which is a source fact.

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  getPollViewerIdentity,
  resetPollViewerIdentity,
  setPollViewerIdentity,
  subscribePollViewerIdentity,
} from './poll-viewer-identity-store';

const sourceOf = (...segments: string[]): string =>
  readFileSync(join(__dirname, ...segments), 'utf8')
    // Comments discuss the code that USED to be here on purpose.
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Rows, as far as the store is concerned: N independent listeners. */
const attachRows = (count: number): { notifications: () => number; detach: () => void } => {
  let notifications = 0;
  const unsubscribes = Array.from({ length: count }, () =>
    subscribePollViewerIdentity(() => {
      notifications += 1;
    })
  );
  return {
    notifications: () => notifications,
    detach: () => unsubscribes.forEach((unsubscribe) => unsubscribe()),
  };
};

describe('the viewer identity is resolved once per leg, not once per card', () => {
  beforeEach(() => resetPollViewerIdentity());

  it('(1) the ROW module opens no profile or auth subscription at any row count', () => {
    // Asserted against the source rather than a runtime count: an import that
    // drags the subscription back into every card's tree would pass a count
    // taken at one row count and fail at another.
    const rowSource = sourceOf('..', 'PollCandidateBars.tsx');
    expect(rowSource).not.toMatch(/useQuery\s*\(/);
    expect(rowSource).not.toMatch(/useAuthController\s*\(/);
    expect(rowSource).not.toMatch(/createProfileQueryOptions/);

    // …and they live in the publication hook instead, which is mounted once per
    // leg (PollsPanel's list parts hook), never inside a row.
    const publicationSource = sourceOf('use-poll-viewer-identity.ts');
    expect(publicationSource).toMatch(/useQuery\s*\(/);
    expect(publicationSource).toMatch(/useAuthController\s*\(/);
  });

  it('(1b) exactly ONE call site mounts the publication, and it is the leg', () => {
    const panelSource = sourceOf('..', 'PollsPanel.tsx');
    const mounts = panelSource.match(/usePollViewerIdentityPublication\(\)/g) ?? [];
    expect(mounts).toHaveLength(1);
  });

  it('(2) a profile write that changes neither rendered value reaches NO row', () => {
    const rows = attachRows(11);
    setPollViewerIdentity({ isSignedIn: true, avatarUrl: 'https://cdn/me.png' });
    const afterRealChange = rows.notifications();
    expect(afterRealChange).toBe(11);

    // An unrelated field changing projects to the SAME two values.
    setPollViewerIdentity({ isSignedIn: true, avatarUrl: 'https://cdn/me.png' });
    setPollViewerIdentity({ isSignedIn: true, avatarUrl: 'https://cdn/me.png' });
    expect(rows.notifications()).toBe(afterRealChange);
    rows.detach();
  });

  it('(2b) unrelated writes cost nothing at ANY row count', () => {
    const rows = attachRows(25);
    for (let index = 0; index < 20; index += 1) {
      setPollViewerIdentity({ isSignedIn: false, avatarUrl: null });
    }
    expect(rows.notifications()).toBe(0);
    rows.detach();
  });

  it('(3) a change to a value rows DO render reaches every row', () => {
    const rows = attachRows(7);
    setPollViewerIdentity({ isSignedIn: true, avatarUrl: 'https://cdn/a.png' });
    expect(rows.notifications()).toBe(7);
    expect(getPollViewerIdentity()).toEqual({
      isSignedIn: true,
      avatarUrl: 'https://cdn/a.png',
    });
    // Signing out must also reach them — the dot disappears.
    setPollViewerIdentity({ isSignedIn: false, avatarUrl: null });
    expect(rows.notifications()).toBe(14);
    rows.detach();
  });
});
