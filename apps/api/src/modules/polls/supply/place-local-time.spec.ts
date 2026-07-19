import {
  anyZoneInsideLocalWindow,
  currentWeekOfLabel,
  derivedTimeZoneFromLongitude,
  effectiveTimeZone,
  labelDayDiff,
  localParts,
} from './place-local-time';

// §4 ritual time helpers: time is LABELS (local calendar dates), not
// milliseconds — closure and evidence consumption must be DST-immune and
// knife-edge-free (red-team 1a/2b), and hours in which no zone on earth can
// be in its Sunday window are derivable from the UTC instant (3a).

const SUNDAY = 0;

describe('currentWeekOfLabel — the current ritual cycle label', () => {
  it('on the ritual day itself, the label IS the local date', () => {
    // Sunday 2026-07-19 09:30 America/Chicago.
    expect(
      currentWeekOfLabel(
        new Date('2026-07-19T14:30:00Z'),
        'America/Chicago',
        SUNDAY,
      ),
    ).toBe('2026-07-19');
  });

  it('mid-week, the label is the most recent ritual day (across a month boundary)', () => {
    // Wednesday 2026-07-01 local → most recent Sunday = 2026-06-28.
    expect(
      currentWeekOfLabel(
        new Date('2026-07-01T15:00:00Z'),
        'America/Chicago',
        SUNDAY,
      ),
    ).toBe('2026-06-28');
  });

  it('DST spring-forward: the label advances by exactly one calendar week even though only 6d23h elapsed', () => {
    const before = currentWeekOfLabel(
      new Date('2026-03-01T15:00:00Z'), // Sunday 09:00 CST
      'America/Chicago',
      SUNDAY,
    );
    const after = currentWeekOfLabel(
      new Date('2026-03-08T14:30:00Z'), // Sunday 09:30 CDT — 6d23.5h later
      'America/Chicago',
      SUNDAY,
    );
    expect(before).toBe('2026-03-01');
    expect(after).toBe('2026-03-08');
    expect(labelDayDiff(after, before)).toBe(7);
  });

  it('respects the zone: the same instant is Sunday in Chicago but already Monday in Tokyo', () => {
    const instant = new Date('2026-07-19T16:00:00Z'); // Sun 11:00 Chicago, Mon 01:00 Tokyo
    expect(currentWeekOfLabel(instant, 'America/Chicago', SUNDAY)).toBe(
      '2026-07-19',
    );
    expect(currentWeekOfLabel(instant, 'Asia/Tokyo', SUNDAY)).toBe(
      '2026-07-19',
    );
    // …and mid-week Tokyo has moved on while Chicago's Sunday label holds.
    const laterInstant = new Date('2026-07-25T16:00:00Z'); // Sat Chicago, Sun Tokyo
    expect(currentWeekOfLabel(laterInstant, 'America/Chicago', SUNDAY)).toBe(
      '2026-07-19',
    );
    expect(currentWeekOfLabel(laterInstant, 'Asia/Tokyo', SUNDAY)).toBe(
      '2026-07-26',
    );
  });
});

describe('labelDayDiff', () => {
  it('is exact calendar arithmetic', () => {
    expect(labelDayDiff('2026-07-19', '2026-07-12')).toBe(7);
    expect(labelDayDiff('2026-07-19', '2026-07-05')).toBe(14);
    expect(labelDayDiff('2026-07-19', '2026-07-19')).toBe(0);
    expect(labelDayDiff('2026-01-01', '2025-12-25')).toBe(7);
  });
});

describe('anyZoneInsideLocalWindow — the 3a global Sunday-window gate', () => {
  const windowAt = (iso: string) =>
    anyZoneInsideLocalWindow(new Date(iso), SUNDAY, 9);

  it('true whenever some IANA offset puts local time in Sunday ≥ 09:00', () => {
    // Sunday noon UTC: most of the world is inside.
    expect(windowAt('2026-07-19T12:00:00Z')).toBe(true);
    // Saturday 19:00Z: UTC+14 (Kiritimati) is Sunday 09:00 — first true hour.
    expect(windowAt('2026-07-18T19:00:00Z')).toBe(true);
    // Monday 10:00Z: UTC-12 is still Sunday 22:00.
    expect(windowAt('2026-07-20T10:00:00Z')).toBe(true);
  });

  it('false when NO zone on earth can be inside its Sunday window', () => {
    // Saturday 18:45Z: even UTC+14 is only Sunday 08:45 — not yet.
    expect(windowAt('2026-07-18T18:45:00Z')).toBe(false);
    // Mid-week is never inside.
    expect(windowAt('2026-07-15T14:30:00Z')).toBe(false);
    // Tuesday midday: the trailing UTC-12 edge left Sunday long ago.
    expect(windowAt('2026-07-21T12:00:00Z')).toBe(false);
  });
});

describe('nautical fallback (1b: can be 2h+ off political time, same-Sunday-safe)', () => {
  it('Austin in summer: nautical UTC-7 vs political CDT (UTC-5) — 2h apart, same local Sunday', () => {
    const zone = derivedTimeZoneFromLongitude(-97.74);
    expect(zone).toBe('Etc/GMT+7');
    const instant = new Date('2026-07-19T18:00:00Z'); // 13:00 CDT, 11:00 UTC-7
    const political = localParts(instant, 'America/Chicago');
    const nautical = localParts(instant, zone);
    expect(political.hour - nautical.hour).toBe(2);
    // Both are the same Sunday, both ≥ 09:00 — the ritual fires either way.
    expect(political.dayOfWeek).toBe(SUNDAY);
    expect(nautical.dayOfWeek).toBe(SUNDAY);
    expect(political.date).toBe(nautical.date);
  });

  it('effectiveTimeZone prefers the stored zone and falls back to the derivation', () => {
    expect(
      effectiveTimeZone({ timeZone: 'America/Chicago', centroidLng: -97.74 }),
    ).toBe('America/Chicago');
    expect(effectiveTimeZone({ timeZone: null, centroidLng: -97.74 })).toBe(
      'Etc/GMT+7',
    );
    expect(effectiveTimeZone({ timeZone: null, centroidLng: null })).toBeNull();
  });
});
