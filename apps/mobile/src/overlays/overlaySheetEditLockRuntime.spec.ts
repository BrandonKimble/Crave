// Hermetic node lane: react-native-reanimated ships ESM and isn't transformed here
// (same reason jest.sentry-stub.js exists for @sentry/react-native). `makeMutable`'s
// only contract this file relies on is "returns a mutable { value }" — stub exactly that.
jest.mock('react-native-reanimated', () => ({
  makeMutable: <T>(initial: T) => ({ value: initial }),
}));

import {
  acquireOverlaySheetEditLock,
  overlaySheetEditLockValue,
} from './overlaySheetEditLockRuntime';

// F1484: the lock used to be a `Set<string>`, so two acquisitions of the SAME token
// yielded two releases and the FIRST release dropped the key — silently unlocking a
// still-live holder. This proves the refcounted fix: releasing one of two
// same-token acquisitions must NOT unlock while the other is still held.
describe('acquireOverlaySheetEditLock', () => {
  it('stays locked when one of two same-token acquisitions releases', () => {
    const releaseFirst = acquireOverlaySheetEditLock('edit-mode:listDetail:root');
    expect(overlaySheetEditLockValue.value).toBe(1);

    const releaseSecond = acquireOverlaySheetEditLock('edit-mode:listDetail:root');
    expect(overlaySheetEditLockValue.value).toBe(1);

    releaseFirst();
    // The bug: a Set-based lock drops the key on the FIRST release regardless of the
    // second acquisition still being live, unlocking the surviving holder mid-edit.
    expect(overlaySheetEditLockValue.value).toBe(1);

    releaseSecond();
    expect(overlaySheetEditLockValue.value).toBe(0);
  });

  it('unlocks after a single acquisition releases', () => {
    const release = acquireOverlaySheetEditLock('edit-mode:lists:root');
    expect(overlaySheetEditLockValue.value).toBe(1);
    release();
    expect(overlaySheetEditLockValue.value).toBe(0);
  });

  it('a second release of the same acquisition is a no-op (does not double-decrement)', () => {
    const releaseA = acquireOverlaySheetEditLock('edit-mode:dmSession:entry-1');
    const releaseB = acquireOverlaySheetEditLock('edit-mode:dmSession:entry-1');
    releaseA();
    releaseA();
    expect(overlaySheetEditLockValue.value).toBe(1);
    releaseB();
    expect(overlaySheetEditLockValue.value).toBe(0);
  });
});
