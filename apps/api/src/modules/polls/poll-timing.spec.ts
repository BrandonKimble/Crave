import {
  MS_PER_DAY,
  MIN_USER_POLL_WINDOW_DAYS,
  MAX_USER_POLL_WINDOW_DAYS,
  clampUserPollWindowDays,
  extractCloseWindowDays,
  isActivePollDueToClose,
  resolvePollAutoCloseDays,
  resolvePollClosesAt,
} from './poll-timing';

describe('clampUserPollWindowDays', () => {
  it('clamps below the min up to the min', () => {
    expect(clampUserPollWindowDays(1)).toBe(MIN_USER_POLL_WINDOW_DAYS);
  });
  it('clamps above the max down to the max', () => {
    expect(clampUserPollWindowDays(30)).toBe(MAX_USER_POLL_WINDOW_DAYS);
  });
  it('keeps an in-range value (rounded)', () => {
    expect(clampUserPollWindowDays(7)).toBe(7);
    expect(clampUserPollWindowDays(5.6)).toBe(6);
  });
  it('returns null for null/undefined/NaN', () => {
    expect(clampUserPollWindowDays(null)).toBeNull();
    expect(clampUserPollWindowDays(undefined)).toBeNull();
    expect(clampUserPollWindowDays(Number.NaN)).toBeNull();
  });
});

describe('resolvePollClosesAt', () => {
  const launched = new Date('2026-01-01T00:00:00.000Z');
  const globalDays = resolvePollAutoCloseDays();

  it('uses the per-poll window when a valid override is provided', () => {
    expect(resolvePollClosesAt(launched, 7)?.getTime()).toBe(
      launched.getTime() + 7 * MS_PER_DAY,
    );
    expect(resolvePollClosesAt(launched, 14)?.getTime()).toBe(
      launched.getTime() + 14 * MS_PER_DAY,
    );
  });
  it('falls back to the global default window when no override', () => {
    expect(resolvePollClosesAt(launched)?.getTime()).toBe(
      launched.getTime() + globalDays * MS_PER_DAY,
    );
  });
  it('ignores a non-positive / null override and uses the global default', () => {
    expect(resolvePollClosesAt(launched, 0)?.getTime()).toBe(
      launched.getTime() + globalDays * MS_PER_DAY,
    );
    expect(resolvePollClosesAt(launched, null)?.getTime()).toBe(
      launched.getTime() + globalDays * MS_PER_DAY,
    );
  });
  it('returns null for missing or invalid launchedAt', () => {
    expect(resolvePollClosesAt(null)).toBeNull();
    expect(resolvePollClosesAt(undefined)).toBeNull();
    expect(resolvePollClosesAt('not-a-date')).toBeNull();
  });
});

describe('extractCloseWindowDays', () => {
  it('reads a numeric closeWindowDays from a metadata object', () => {
    expect(extractCloseWindowDays({ closeWindowDays: 7 })).toBe(7);
  });
  it('returns null when absent / non-numeric / non-object', () => {
    expect(extractCloseWindowDays({ other: 1 })).toBeNull();
    expect(extractCloseWindowDays({ closeWindowDays: 'x' })).toBeNull();
    expect(extractCloseWindowDays(null)).toBeNull();
    expect(extractCloseWindowDays([7])).toBeNull();
  });
});

describe('isActivePollDueToClose', () => {
  const now = new Date('2026-02-01T00:00:00.000Z').getTime();

  it('is due when the per-poll window has elapsed', () => {
    const launched = new Date(now - 8 * MS_PER_DAY); // 8d ago, window 7 → closed 1d ago
    expect(isActivePollDueToClose(launched, { closeWindowDays: 7 }, now)).toBe(
      true,
    );
  });
  it('is NOT due when the per-poll window has not elapsed', () => {
    const launched = new Date(now - 5 * MS_PER_DAY); // 5d ago, window 7 → not yet
    expect(isActivePollDueToClose(launched, { closeWindowDays: 7 }, now)).toBe(
      false,
    );
  });
  it('falls back to the global window when no stored window', () => {
    const g = resolvePollAutoCloseDays();
    expect(
      isActivePollDueToClose(new Date(now - (g + 1) * MS_PER_DAY), {}, now),
    ).toBe(true);
    expect(
      isActivePollDueToClose(new Date(now - (g - 0.5) * MS_PER_DAY), {}, now),
    ).toBe(false);
  });
});
