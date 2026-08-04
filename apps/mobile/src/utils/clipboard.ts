// The ONE clipboard seam. react-native's Clipboard is deprecated; the ideal
// replacement is expo-clipboard, but it ships a NATIVE module that is NOT in
// the current dev-client pods (ios/Podfile.lock has no ExpoClipboard).
// MIGRATION TRIGGER: at the next native rebuild, `npx expo install
// expo-clipboard`, swap the import below to `import * as Clipboard from
// 'expo-clipboard'` (setString → setStringAsync), and delete this comment.
//
// F817 (2026-08-03) — TRIGGER RE-CHECKED, STILL OWED, AND NOW DATED.
// Native rebuilds HAVE happened since this was written (the rnmapbox 10.3.1 patch re-port,
// 2026-08-02) and the swap did not ride along, which is exactly how a migration trigger
// rots into permanent scaffolding. Re-verified today: `expo-clipboard` is absent from
// package.json AND `ExpoClipboard` is absent from ios/Podfile.lock, so the shim's stated
// condition still holds — this is NOT stale, it is owed.
//
// It was NOT done in this pass because doing it correctly means adding a native dependency
// and re-running pod install + a device build, i.e. the ios/ native lane; landing the JS
// half alone would ship an import of a native module that is not in the binary. Whoever
// takes the next native rebuild owns this three-line change.
import { Clipboard } from 'react-native';

export const setClipboardString = (value: string): void => {
  Clipboard.setString(value);
};
